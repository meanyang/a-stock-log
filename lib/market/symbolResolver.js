import { getPgPool } from '../db/pool.js'

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
    return { symbol: s }
  }
  return null
}

function inferredExchangeOrder(symbol) {
  if (!symbol) return ['SH', 'SZ', 'BJ']
  if (symbol.startsWith('6')) return ['SH', 'SZ', 'BJ']
  if (symbol.startsWith('4') || symbol.startsWith('8')) return ['BJ', 'SH', 'SZ']
  return ['SZ', 'SH', 'BJ']
}

export async function resolveStock(input) {
  const n = normalizeInput(input)
  if (!n) return { error: 'invalid input' }

  const pool = getPgPool()
  if (!pool) return { error: 'DATABASE_URL missing' }

  if (n.exchange_code) {
    const r = await pool.query(
      `SELECT e.code AS exchange_code, s.symbol, s.name, s.board
       FROM stocks s JOIN exchanges e ON e.id = s.exchange_id
       WHERE e.code = $1 AND s.symbol = $2
       LIMIT 1`,
      [n.exchange_code, n.symbol]
    )
    const row = r.rows[0] || null
    if (!row) return { error: 'symbol not found' }
    return { ...row, ts_code: `${row.symbol}.${row.exchange_code}` }
  }

  const order = inferredExchangeOrder(n.symbol)
  for (const ex of order) {
    const r = await pool.query(
      `SELECT e.code AS exchange_code, s.symbol, s.name, s.board
       FROM stocks s JOIN exchanges e ON e.id = s.exchange_id
       WHERE e.code = $1 AND s.symbol = $2
       LIMIT 1`,
      [ex, n.symbol]
    )
    const row = r.rows[0] || null
    if (row) return { ...row, ts_code: `${row.symbol}.${row.exchange_code}` }
  }

  return { error: 'symbol not found' }
}

