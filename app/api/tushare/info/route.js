export const dynamic = 'force-dynamic'

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
async function resolveBySina(input) {
  const s = String(input || '').trim()
  if (!s) return { error: 'input required' }
  const normalized = normalizeInput(s)
  // 即使有标准化代码，也尝试请求一次以获取名称
  const url = `http://suggest3.sinajs.cn/suggest/type=&key=${encodeURIComponent(s)}&name=suggestdata`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return { error: `sina http ${res.status}` }
    const text = await res.text()
    const match = text.match(/="([^"]*)"/)
    if (!match || !match[1]) {
      // 若无返回但有标准化代码，退回仅代码
      if (normalized) {
        return { ts_code: normalized, name: '' }
      }
      return { error: 'no suggestion' }
    }
    const stocks = match[1].split(';').filter(Boolean)
    if (!stocks.length) {
      if (normalized) return { ts_code: normalized, name: '' }
      return { error: 'no suggestion' }
    }
    const fields = stocks[0].split(',')
    // 经验位：fields[3] 形如 sh600519/sz000001/bjXXXXXX
    const symbol = fields[3] || ''
    let ts_code = ''
    if (/^sh\d{6}$/i.test(symbol)) ts_code = `${symbol.slice(2)}.SH`
    else if (/^sz\d{6}$/i.test(symbol)) ts_code = `${symbol.slice(2)}.SZ`
    else if (/^bj\d{6}$/i.test(symbol)) ts_code = `${symbol.slice(2)}.BJ`
    // 名称优先取中文名位置（通常为 fields[0] 或 fields[4]）
    const name = fields[0] || fields[4] || s
    if (!ts_code && normalized) ts_code = normalized
    if (!ts_code) return { error: 'Symbol not found' }
    return { ts_code, name }
  } catch (e) {
    if (normalized) return { ts_code: normalized, name: '' }
    return { error: e.message || 'sina fetch error' }
  }
}

export async function GET(request) {
  const url = new URL(request.url)
  const input = url.searchParams.get('input') || ''
  if (!input) return ok({ code: 400, msg: 'input required' }, 400)

  const resolved = await resolveBySina(input)
  if (resolved.error) return ok({ code: 1, msg: resolved.error }, 400)
  const ts_code = resolved.ts_code
  const name = resolved.name || ''

  const cached = cache.info.get(ts_code)
  if (cached) return ok({ code: 0, data: cached })

  const doc = {
    ts_code,
    name: name || '',
    area: '',
    industry: '',
    market: '',
    list_date: '',
    last_update: Date.now()
  }
  cache.info.set(ts_code, doc)
  return ok({ code: 0, data: doc })
}
