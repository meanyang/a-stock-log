export const dynamic = 'force-dynamic'

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

function prevTradingDay(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - 1)
  while (isWeekend(d)) d.setDate(d.getDate() - 1)
  return d
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function generateSeries({ seed, points, startPrice, direction = 0 }) {
  const rand = mulberry32(seed)
  let price = Math.max(1, startPrice)
  const out = []
  for (let i = 0; i < points; i++) {
    const drift = (rand() - 0.5) * 0.02 + direction * 0.002
    price = Math.max(0.5, price * (1 + drift))
    out.push(Number(price.toFixed(2)))
  }
  return out
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') || '').trim()
  if (!symbol) {
    return new Response(
      JSON.stringify({ error: 'symbol is required' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    )
  }

  const seed = hashString(symbol.toUpperCase())
  const today = new Date()
  while (isWeekend(today)) today.setDate(today.getDate() - 1)

  const historyDays = 120
  const forecastDays = 15

  let cursor = new Date(today)
  const history = []

  const base = 10 + (seed % 90)
  const histVals = generateSeries({ seed, points: historyDays, startPrice: base })

  for (let i = histVals.length - 1; i >= 0; i--) {
    history.unshift({ date: formatDate(cursor), close: histVals[i] })
    cursor = prevTradingDay(cursor)
  }

  const lastPrice = history[history.length - 1].close
  const forecastVals = generateSeries({ seed: seed ^ 0x9e3779b9, points: forecastDays, startPrice: lastPrice, direction: 1 })
  const forecast = []
  cursor = nextTradingDay(today)
  for (let i = 0; i < forecastVals.length; i++) {
    forecast.push({ date: formatDate(cursor), close: forecastVals[i] })
    cursor = nextTradingDay(cursor)
  }

  const body = {
    symbol,
    history,
    forecast,
    note: 'Synthetic forecast for demo purposes only'
  }

  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' }
  })
}

