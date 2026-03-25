export const dynamic = 'force-dynamic'

import { guard } from '../../../lib/api/guard.js'
import { heuristicPredict } from '../../../lib/services/predictHeuristic.js'

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

  const g = await guard(request, {
    name: 'predict',
    rateLimits: [
      { scope: 'ip', limit: 30, windowSeconds: 60 },
      { scope: 'subject', limit: 60, windowSeconds: 60 }
    ]
  })
  if (!g.ok) return g.response

  const baseHeaders = { 'content-type': 'application/json', ...(g.headers || {}) }
  const resp = (obj, status) => new Response(JSON.stringify(obj), { status, headers: baseHeaders })

  const r = await heuristicPredict({ symbol })
  if (r.error) return resp({ error: r.error }, r.status || 400)
  return resp(r.data, 200)
}
