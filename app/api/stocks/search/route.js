export const dynamic = 'force-dynamic'

import pgPkg from 'pg'

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function normalizeQuery(q) {
  const s = String(q || '').trim()
  if (!s) return null
  const up = s.toUpperCase()
  if (/^\d{1,6}$/.test(up)) return { type: 'symbol_prefix', value: up }
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(up)) return { type: 'ts_code', value: up }
  if (/^(SH|SZ|BJ)\d{6}$/.test(up)) return { type: 'ex_symbol', value: up }
  return { type: 'name_like', value: s }
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
    const q = url.searchParams.get('query') || url.searchParams.get('q') || ''
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100)
    if (!q) return ok({ code: 400, msg: 'query required' }, 400)
    const nq = normalizeQuery(q)
    if (!nq) return ok({ code: 400, msg: 'invalid query' }, 400)
    const pool = getPool()
    if (!pool) return ok({ code: 500, msg: 'DATABASE_URL missing' }, 500)
    let rows = []
    if (nq.type === 'ts_code') {
      const [symbol, ex] = nq.value.split('.')
      const r = await pool.query(
        `SELECT e.code AS exchange_code, s.symbol, s.name, s.board
         FROM stocks s JOIN exchanges e ON e.id = s.exchange_id
         WHERE e.code = $1 AND s.symbol = $2
         LIMIT 1`,
        [ex, symbol]
      )
      rows = r.rows
    } else if (nq.type === 'ex_symbol') {
      const ex = nq.value.slice(0, 2)
      const symbol = nq.value.slice(2)
      const r = await pool.query(
        `SELECT e.code AS exchange_code, s.symbol, s.name, s.board
         FROM stocks s JOIN exchanges e ON e.id = s.exchange_id
         WHERE e.code = $1 AND s.symbol = $2
         LIMIT 1`,
        [ex, symbol]
      )
      rows = r.rows
    } else if (nq.type === 'symbol_prefix') {
      const like = nq.value + '%'
      const r = await pool.query(
        `SELECT e.code AS exchange_code, s.symbol, s.name, s.board
         FROM stocks s JOIN exchanges e ON e.id = s.exchange_id
         WHERE s.symbol LIKE $1
         ORDER BY s.symbol
         LIMIT $2`,
        [like, limit]
      )
      rows = r.rows
    } else {
      const like = '%' + nq.value.replace(/[%_]/g, '\\$&') + '%'
      const r = await pool.query(
        `SELECT e.code AS exchange_code, s.symbol, s.name, s.board
         FROM stocks s JOIN exchanges e ON e.id = s.exchange_id
         WHERE s.name ILIKE $1 ESCAPE '\\'
         ORDER BY s.symbol
         LIMIT $2`,
        [like, limit]
      )
      rows = r.rows
    }
    const list = rows.map(x => {
      const ts_code = `${x.symbol}.${x.exchange_code}`
      return { ts_code, exchange_code: x.exchange_code, symbol: x.symbol, name: x.name, board: x.board }
    })
    return ok({ code: 0, data: { list } })
  } catch (e) {
    return ok({ code: 500, msg: e?.message || String(e) }, 500)
  }
}
