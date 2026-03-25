export const dynamic = 'force-dynamic'

import { getPgPool } from '../../../../lib/db/pool.js'
import { resolveStock } from '../../../../lib/market/symbolResolver.js'
import { guard } from '../../../../lib/api/guard.js'

const cache = { info: new Map() }
function ok(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extraHeaders } })
}

export async function GET(request) {
  const url = new URL(request.url)
  const input = url.searchParams.get('input') || ''
  if (!input) return ok({ code: 400, msg: 'input required' }, 400)

  const g = await guard(request, {
    name: 'tushare.info',
    rateLimits: [
      { scope: 'ip', limit: 180, windowSeconds: 60 },
      { scope: 'subject', limit: 600, windowSeconds: 60 }
    ]
  })
  if (!g.ok) return g.response

  const rs = await resolveStock(input)
  if (rs.error) return ok({ code: 1, msg: rs.error }, 400, g.headers || {})
  const ts_code = rs.ts_code

  const cached = cache.info.get(ts_code)
  if (cached) return ok({ code: 0, data: cached }, 200, g.headers || {})

  const [symbol, ex] = ts_code.split('.')
  const pool = getPgPool()
  if (!pool) return ok({ code: 500, msg: 'DATABASE_URL missing' }, 500, g.headers || {})
  const r = await pool.query(
    `SELECT
      e.code AS exchange_code,
      s.symbol,
      s.name,
      s.full_name,
      s.type,
      s.board,
      s.list_date,
      s.delist_date,
      s.status,
      s.industry,
      s.area,
      s.isin,
      s.updated_at
     FROM stocks s JOIN exchanges e ON e.id = s.exchange_id
     WHERE e.code = $1 AND s.symbol = $2
     LIMIT 1`,
    [ex, symbol]
  )
  const row = r.rows[0] || null
  if (!row) return ok({ code: 2, msg: 'not found' }, 404, g.headers || {})
  const doc = { ...row, ts_code: `${row.symbol}.${row.exchange_code}`, last_update: Date.now() }
  cache.info.set(ts_code, doc)
  return ok({ code: 0, data: doc }, 200, g.headers || {})
}
