import { resolveStock } from '../market/symbolResolver.js'
import { fetchDailyBarsByTsCode, yyyymmdd } from '../market/dailyData.js'

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
function macd(values, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  const ema = (arr, n) => {
    const out = new Array(arr.length).fill(null)
    const k = 2 / (n + 1)
    let prev = arr[0]
    out[0] = prev
    for (let i = 1; i < arr.length; i++) {
      const v = arr[i] * k + prev * (1 - k)
      out[i] = v
      prev = v
    }
    return out
  }
  const emaShort = ema(values, shortPeriod)
  const emaLong = ema(values, longPeriod)
  const dif = values.map((_, i) => emaShort[i] - emaLong[i])
  const dea = ema(dif, signalPeriod)
  const hist = dif.map((v, i) => (v == null || dea[i] == null ? null : v - dea[i]))
  return { dif, dea, hist }
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

export async function heuristicPredict({ symbol, horizonDays = 15 }) {
  const resolved = await resolveStock(symbol)
  if (resolved.error) {
    if (resolved.error === 'DATABASE_URL missing') return { error: resolved.error, status: 500 }
    return { error: resolved.error, status: 400 }
  }
  const ts_code = resolved.ts_code
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 450)
  const start_date = yyyymmdd(start)
  const end_date = yyyymmdd(today)
  const daily = await fetchDailyBarsByTsCode(ts_code, start_date, end_date)
  if (daily.error) return { error: daily.error, status: 502 }
  const rows = daily.bars || []
  if (!rows.length) return { error: 'no data', status: 404 }
  const closes = rows.map(r => r.close)
  if (closes.length < 30) return { error: 'insufficient data', status: 400 }
  const ma5 = sma(closes, 5)
  const ma10 = sma(closes, 10)
  const ma20 = sma(closes, 20)
  const m = macd(closes)
  const b = boll(closes, 20, 2)
  const take = Math.min(120, rows.length)
  const candles = rows.slice(-take).map(r => ({
    date: `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    vol: Number(r.vol)
  }))
  const history = rows.slice(-take).map(r => ({
    date: `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`,
    close: r.close
  }))
  const fc = []
  let lastDate = new Date(`${rows[rows.length - 1].date.slice(0, 4)}-${rows[rows.length - 1].date.slice(4, 6)}-${rows[rows.length - 1].date.slice(6, 8)}`)
  let series = closes.slice()
  for (let i = 0; i < horizonDays; i++) {
    const m20 = sma(series, 20)
    const b2 = boll(series, 20, 2)
    const m2 = macd(series)
    const idx = series.length - 1
    const p = series[idx]
    const ma = m20[idx] ?? p
    const up = b2.upper[idx] ?? p * 1.06
    const low = b2.lower[idx] ?? p * 0.94
    const d = m2.dif[idx] ?? 0
    const e = m2.dea[idx] ?? 0
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
    candles,
    history,
    forecast: fc,
    note: 'Data from Tushare Pro, heuristic forecast using MA/MACD/BOLL'
  }
  return { data: body }
}
