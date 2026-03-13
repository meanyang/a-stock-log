export const dynamic = 'force-dynamic'

const TUSHARE_URL = 'https://api.tushare.pro'
const cache = {
  daily: new Map()
}

function yyyymmdd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}
function nextYYYYMMDD(s) {
  if (!/^\d{8}$/.test(s)) return null
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
  d.setDate(d.getDate() + 1)
  return yyyymmdd(d)
}
function isAfter18() {
  const n = new Date()
  return n.getHours() >= 18
}
function ok(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function normalizeInput(input) {
  const s = String(input || '').trim().toUpperCase()
  if (!s) return null
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(s)) return s
  if (/^\d{6}$/.test(s)) {
    if (s.startsWith('6')) return `${s}.SH`
    if (s.startsWith('4') || s.startsWith('8')) return `${s}.BJ`
    return `${s}.SZ`
  }
  return null
}

async function fetchTushare(api_name, params, fields) {
  const token = process.env.TUSHARE_TOKEN || ''
  if (!token) return { error: 'TUSHARE_TOKEN missing' }
  const body = { api_name, token, params, fields }
  const res = await fetch(TUSHARE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) return { error: `tushare http ${res.status}` }
  const json = await res.json()
  if (json.code !== 0) return { error: json.msg || 'tushare error' }
  const fs = json.data.fields
  const items = json.data.items
  const rows = items.map(arr => Object.fromEntries(fs.map((f, i) => [f, arr[i]])))
  return { rows }
}

async function resolveTsCode(input) {
  const normalized = normalizeInput(input)
  if (normalized) return { ts_code: normalized }
  try {
    const s = String(input || '').trim()
    const url = `http://suggest3.sinajs.cn/suggest/type=&key=${encodeURIComponent(s)}&name=suggestdata`
    const res = await fetch(url, { cache: 'no-store' })
    const text = await res.text()
    const m = text.match(/="([^"]*)"/)
    if (m && m[1]) {
      const stocks = m[1].split(';').filter(Boolean)
      for (const item of stocks) {
        const fields = item.split(',')
        const symbol = fields[3] || ''
        if (/^sh\d{6}$/i.test(symbol)) return { ts_code: `${symbol.slice(2)}.SH` }
        if (/^sz\d{6}$/i.test(symbol)) return { ts_code: `${symbol.slice(2)}.SZ` }
        if (/^bj\d{6}$/i.test(symbol)) return { ts_code: `${symbol.slice(2)}.BJ` }
        const code6 = fields[1] || fields[2] || ''
        if (/^\d{6}$/.test(code6)) {
          if (code6.startsWith('6')) return { ts_code: `${code6}.SH` }
          if (code6.startsWith('4') || code6.startsWith('8')) return { ts_code: `${code6}.BJ` }
          return { ts_code: `${code6}.SZ` }
        }
      }
    }
  } catch {}
  return { error: 'Symbol not found' }
}

export async function GET(request) {
  const url = new URL(request.url)
  const input = url.searchParams.get('input') || ''
  const start_date = url.searchParams.get('start_date') || ''
  const end_date = url.searchParams.get('end_date') || ''
  const limit = Number(url.searchParams.get('limit') || 400)
  if (!input) return ok({ code: 400, msg: 'input required' }, 400)

  const resolved = await resolveTsCode(input)
  if (resolved.error) return ok({ code: 1, msg: resolved.error }, 400)
  const ts_code = resolved.ts_code

  const tokenSet = !!process.env.TUSHARE_TOKEN
  if (!tokenSet) return ok({ code: -1, msg: 'Missing TUSHARE_TOKEN' }, 500)

  const todayStr = yyyymmdd(new Date())
  const needUpdateAfter18 = isAfter18()

  const cached = cache.daily.get(ts_code) || null
  let merged = cached
  const isEmpty = !cached || !Array.isArray(cached.rows) || cached.rows.length === 0
  if (isEmpty) {
    const from = start_date || '20000101'
    const to = end_date || todayStr
    const r = await fetchTushare('daily', { ts_code, start_date: from, end_date: to }, 'trade_date,open,high,low,close,vol')
    if (r.error) return ok({ code: 500, msg: r.error }, 502)
    const rows = r.rows.map(x => ({
      date: x.trade_date, open: Number(x.open), high: Number(x.high), low: Number(x.low), close: Number(x.close), vol: Number(x.vol)
    })).sort((a, b) => a.date.localeCompare(b.date))
    const out = typeof limit === 'number' && limit > 0 ? rows.slice(-limit) : rows
    if (!out.length) return ok({ code: 2, msg: 'No daily data' }, 404)
    merged = { ts_code, last_update: Date.now(), last_date: out[out.length - 1].date, rows: out }
    cache.daily.set(ts_code, merged)
  } else {
    let shouldFetch = false
    if (needUpdateAfter18 && cached.last_date && cached.last_date < todayStr) {
      shouldFetch = true
    }
    if (shouldFetch) {
      const from = nextYYYYMMDD(cached.last_date) || cached.last_date
      const to = end_date || todayStr
      const r = await fetchTushare('daily', { ts_code, start_date: from, end_date: to }, 'trade_date,open,high,low,close,vol')
      if (!r.error && r.rows.length) {
        const rows = r.rows.map(x => ({
          date: x.trade_date, open: Number(x.open), high: Number(x.high), low: Number(x.low), close: Number(x.close), vol: Number(x.vol)
        })).sort((a, b) => a.date.localeCompare(b.date))
        const mergedRows = (cached.rows || []).concat(rows).sort((a, b) => a.date.localeCompare(b.date))
        merged = { ts_code, last_update: Date.now(), last_date: mergedRows[mergedRows.length - 1].date, rows: mergedRows }
        cache.daily.set(ts_code, merged)
      }
    }
  }
  return ok({ code: 0, data: merged })
}
