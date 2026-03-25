import { getPgPool } from '../db/pool.js'

function normalizeQuery(q) {
  const s = String(q || '').trim()
  if (!s) return null
  const up = s.toUpperCase()
  if (/^\d{1,6}$/.test(up)) return { type: 'symbol_prefix', value: up }
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(up)) return { type: 'ts_code', value: up }
  if (/^(SH|SZ|BJ)\d{6}$/.test(up)) return { type: 'ex_symbol', value: up }
  return { type: 'name_like', value: s }
}

export async function searchStocks({ query, limit = 20 }) {
  if (!query) return { error: 'query required', status: 400 }
  const nq = normalizeQuery(query)
  if (!nq) return { error: 'invalid query', status: 400 }
  const pool = getPgPool()
  if (!pool) return { error: 'DATABASE_URL missing', status: 500 }
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
      [like, Math.min(Math.max(Number(limit || 20), 1), 100)]
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
      [like, Math.min(Math.max(Number(limit || 20), 1), 100)]
    )
    rows = r.rows
  }
  const list = rows.map(x => {
    const ts_code = `${x.symbol}.${x.exchange_code}`
    return { ts_code, exchange_code: x.exchange_code, symbol: x.symbol, name: x.name, board: x.board }
  })
  return { data: { list } }
}

