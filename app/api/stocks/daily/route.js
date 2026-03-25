export const dynamic = 'force-dynamic'

import { yyyymmdd } from '../../../../lib/market/dailyData.js'
import { guard } from '../../../../lib/api/guard.js'
import { getDailyByInput } from '../../../../lib/services/stocksDaily.js'

function ok(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extraHeaders } })
}

export async function GET(request) {
  const url = new URL(request.url)
  const input = url.searchParams.get('input') || url.searchParams.get('ts_code') || ''
  const start_date = url.searchParams.get('start_date') || ''
  const end_date = url.searchParams.get('end_date') || ''
  const limitRaw = Number(url.searchParams.get('limit') || 400)
  const limit = Number.isFinite(limitRaw) ? limitRaw : 400
  if (!input) return ok({ code: 400, msg: 'input required' }, 400)

  const g = await guard(request, {
    name: 'stocks.daily',
    rateLimits: [
      { scope: 'ip', limit: 120, windowSeconds: 60 },
      { scope: 'subject', limit: 300, windowSeconds: 60 }
    ],
    requireAuth: true
  })
  if (!g.ok) return g.response

  const today = new Date()
  const todayStr = yyyymmdd(today)
  const r = await getDailyByInput({ input, start_date, end_date: end_date || todayStr, limit })
  if (r.error) return ok({ code: r.status === 500 ? 500 : 1, msg: r.error }, r.status || 400, g.headers || {})
  return ok({ code: 0, data: r.data }, 200, g.headers || {})
}
