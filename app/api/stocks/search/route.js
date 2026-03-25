export const dynamic = 'force-dynamic'

import { guard } from '../../../../lib/api/guard.js'
import { searchStocks } from '../../../../lib/services/stocksSearch.js'

function ok(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extraHeaders } })
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const q = url.searchParams.get('query') || url.searchParams.get('q') || ''
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100)
    if (!q) return ok({ code: 400, msg: 'query required' }, 400)
    const g = await guard(request, {
      name: 'stocks.search',
      rateLimits: [
        { scope: 'ip', limit: 180, windowSeconds: 60 },
        { scope: 'subject', limit: 600, windowSeconds: 60 }
      ]
    })
    if (!g.ok) return g.response
    const r = await searchStocks({ query: q, limit })
    if (r.error) return ok({ code: r.status === 500 ? 500 : 1, msg: r.error }, r.status || 400, g.headers || {})
    return ok({ code: 0, data: r.data }, 200, g.headers || {})
  } catch (e) {
    return ok({ code: 500, msg: e?.message || String(e) }, 500)
  }
}
