export const dynamic = 'force-dynamic'

const TUSHARE_URL = 'https://api.tushare.pro'
const cache = {
  info: new Map()
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
  const r = await fetchTushare('stock_basic', { name: input, list_status: 'L' }, 'ts_code,name')
  if (r.error) return { error: r.error }
  if (!r.rows.length) return { error: 'Symbol not found' }
  return { ts_code: r.rows[0].ts_code }
}

export async function GET(request) {
  const url = new URL(request.url)
  const input = url.searchParams.get('input') || ''
  if (!input) return ok({ code: 400, msg: 'input required' }, 400)
  const tokenSet = !!process.env.TUSHARE_TOKEN
  if (!tokenSet) return ok({ code: -1, msg: 'Missing TUSHARE_TOKEN' }, 500)

  const resolved = await resolveTsCode(input)
  if (resolved.error) return ok({ code: 1, msg: resolved.error }, 400)
  const ts_code = resolved.ts_code

  const cached = cache.info.get(ts_code)
  if (cached) return ok({ code: 0, data: cached })

  const r = await fetchTushare('stock_basic', { ts_code }, 'ts_code,name,area,industry,market,list_date')
  if (r.error) return ok({ code: 500, msg: r.error }, 502)
  if (!r.rows.length) return ok({ code: 2, msg: 'No stock_basic data' }, 404)
  const x = r.rows[0]
  const doc = {
    ts_code,
    name: x.name || '',
    area: x.area || '',
    industry: x.industry || '',
    market: x.market || '',
    list_date: x.list_date || '',
    last_update: Date.now()
  }
  cache.info.set(ts_code, doc)
  return ok({ code: 0, data: doc })
}

