export const dynamic = 'force-dynamic'

import pgPkg from 'pg'

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function normalizeInput(input) {
  const s = String(input || '').trim().toUpperCase()
  if (!s) return null
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(s)) {
    const [symbol, ex] = s.split('.')
    return { exchange_code: ex, symbol }
  }
  if (/^(SH|SZ|BJ)\d{6}$/.test(s)) {
    return { exchange_code: s.slice(0, 2), symbol: s.slice(2) }
  }
  if (/^\d{6}$/.test(s)) {
    if (s.startsWith('6')) return { exchange_code: 'SH', symbol: s }
    if (s.startsWith('4') || s.startsWith('8')) return { exchange_code: 'BJ', symbol: s }
    return { exchange_code: 'SZ', symbol: s }
  }
  return null
}

function getPool() {
  const url = process.env.DATABASE_URL || ''
  if (!url) return null
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = new pgPkg.Pool({ connectionString: url })
  }
  return globalThis.__pgPool
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const input = url.searchParams.get('input') || url.searchParams.get('ts_code') || ''
    if (!input) return ok({ code: 400, msg: 'input required' }, 400)

    const normalized = normalizeInput(input)
    if (!normalized) return ok({ code: 400, msg: 'invalid input' }, 400)

    const pool = getPool()
    if (!pool) return ok({ code: 500, msg: 'DATABASE_URL missing' }, 500)

    const r = await pool.query(
      `
      SELECT
        s.id,
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
      FROM stocks s
      JOIN exchanges e ON e.id = s.exchange_id
      WHERE e.code = $1 AND s.symbol = $2
      LIMIT 1
      `,
      [normalized.exchange_code, normalized.symbol]
    )

    const row = r.rows[0] || null
    if (!row) return ok({ code: 2, msg: 'not found' }, 404)

    const ts_code = `${row.symbol}.${row.exchange_code}`
    return ok({ code: 0, data: { ...row, ts_code } })
  } catch (e) {
    return ok({ code: 500, msg: e?.message || String(e) }, 500)
  }
}
