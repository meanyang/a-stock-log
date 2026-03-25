export const dynamic = 'force-dynamic'

import { resolveStock } from '../../../lib/market/symbolResolver.js'
import { fetchDailyBarsByTsCode, yyyymmdd } from '../../../lib/market/dailyData.js'

function isWeekend(date) {
  const d = date.getDay()
  return d === 0 || d === 6
}

function nextTradingDay(date) {
  const d = new Date(date)
  d.setDate(d.getDate() + 1)
  while (isWeekend(d)) d.setDate(d.getDate() + 1)
  return d
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sma(values, period) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

function ema(values, period) {
  const out = new Array(values.length).fill(null)
  const k = 2 / (period + 1)
  let prev = values[0]
  out[0] = prev
  for (let i = 1; i < values.length; i++) {
    const v = values[i] * k + prev * (1 - k)
    out[i] = v
    prev = v
  }
  return out
}

function stdev(values, period) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < values.length; i++) {
    const x = values[i]
    sum += x
    sumSq += x * x
    if (i >= period) {
      const x0 = values[i - period]
      sum -= x0
      sumSq -= x0 * x0
    }
    if (i >= period - 1) {
      const mean = sum / period
      out[i] = Math.sqrt(Math.max(0, sumSq / period - mean * mean))
    }
  }
  return out
}

function boll(values, period = 20, k = 2) {
  const mid = sma(values, period)
  const sd = stdev(values, period)
  const upper = new Array(values.length).fill(null)
  const lower = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    if (mid[i] != null && sd[i] != null) {
      upper[i] = mid[i] + k * sd[i]
      lower[i] = mid[i] - k * sd[i]
    }
  }
  return { mid, upper, lower }
}

function macd(values) {
  const ema12 = ema(values, 12)
  const ema26 = ema(values, 26)
  const dif = values.map((_, i) => (ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null))
  const dea = ema(
    dif.map(v => (v == null ? 0 : v)),
    9
  )
  const hist = dif.map((v, i) => (v == null || dea[i] == null ? null : v - dea[i]))
  return { dif, dea, hist }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') || '').trim()
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'symbol is required' }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  const tokenSet = !!process.env.TUSHARE_TOKEN
  if (!tokenSet) {
    return new Response(JSON.stringify({ error: 'Tushare token missing', hint: 'set TUSHARE_TOKEN env' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }

  const resolved = await resolveStock(symbol)
  if (resolved.error) {
    if (resolved.error === 'DATABASE_URL missing') {
      return new Response(JSON.stringify({ error: resolved.error }), { status: 500, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: resolved.error }), { status: 400, headers: { 'content-type': 'application/json' } })
  }
  const ts_code = resolved.ts_code

  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 450)
  const start_date = yyyymmdd(start)
  const end_date = yyyymmdd(today)

  const daily = await fetchDailyBarsByTsCode(ts_code, start_date, end_date)
  if (daily.error) {
    return new Response(JSON.stringify({ error: daily.error }), { status: 502, headers: { 'content-type': 'application/json' } })
  }
  const rows = daily.bars || []
  if (!rows.length) {
    return new Response(JSON.stringify({ error: 'no data' }), { status: 404, headers: { 'content-type': 'application/json' } })
  }

  const closes = rows.map(r => r.close)
  if (closes.length < 30) {
    return new Response(JSON.stringify({ error: 'insufficient data' }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  const ma5 = sma(closes, 5)
  const ma10 = sma(closes, 10)
  const ma20 = sma(closes, 20)
  const { dif, dea, hist } = macd(closes)
  const { mid, upper, lower } = boll(closes, 20, 2)

  const take = Math.min(120, rows.length)
  const history = rows.slice(-take).map((r, i, arr) => ({
    date: `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`,
    close: r.close
  }))

  const forecastDays = 15
  const fc = []
  let lastDate = new Date(`${rows[rows.length - 1].date.slice(0, 4)}-${rows[rows.length - 1].date.slice(4, 6)}-${rows[rows.length - 1].date.slice(6, 8)}`)
  let series = closes.slice()
  for (let i = 0; i < forecastDays; i++) {
    const m20 = sma(series, 20)
    const b = boll(series, 20, 2)
    const m = macd(series)
    const idx = series.length - 1
    const p = series[idx]
    const ma = m20[idx] ?? p
    const up = b.upper[idx] ?? p * 1.05
    const low = b.lower[idx] ?? p * 0.95
    const d = m.dif[idx] ?? 0
    const e = m.dea[idx] ?? 0
    let score = 0
    if (p > ma) score += 1
    else score -= 1
    if (d > e) score += 1
    else score -= 1
    if (p > up) score -= 1
    if (p < low) score += 1
    const base = 0.0025
    let pct = Math.max(-0.02, Math.min(0.02, score * base))
    const nxt = Math.max(0.5, Number((p * (1 + pct)).toFixed(2)))
    lastDate = nextTradingDay(lastDate)
    fc.push({ date: formatDate(lastDate), close: nxt })
    series = [...series, nxt]
  }

  const body = {
    symbol: ts_code,
    history: history,
    forecast: fc,
    note: 'Data from Tushare Pro, heuristic forecast using MA/MACD/BOLL'
  }

  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}
