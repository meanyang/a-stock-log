export const dynamic = 'force-dynamic'

import { guard } from '../../../../lib/api/guard.js'
import { getStockInfoByInput } from '../../../../lib/services/stocksInfo.js'

function ok(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extraHeaders } })
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const input = url.searchParams.get('input') || url.searchParams.get('ts_code') || ''
    if (!input) return ok({ code: 400, msg: 'input required' }, 400)

    const g = await guard(request, {
      name: 'stocks.info',
      rateLimits: [
        { scope: 'ip', limit: 120, windowSeconds: 60 },
        { scope: 'subject', limit: 600, windowSeconds: 60 }
      ]
    })
    if (!g.ok) return g.response

    const r = await getStockInfoByInput({ input })
    if (r.error) return ok({ code: r.status === 500 ? 500 : 1, msg: r.error }, r.status || 400, g.headers || {})
    return ok({ code: 0, data: r.data }, 200, g.headers || {})
  } catch (e) {
    return ok({ code: 500, msg: e?.message || String(e) }, 500)
  }
}
