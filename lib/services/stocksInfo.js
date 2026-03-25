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
    if (s.startsWith('6')) return { exchange_code: 'SH', symbol: s }
    if (s.startsWith('4') || s.startsWith('8')) return { exchange_code: 'BJ', symbol: s }
    return { exchange_code: 'SZ', symbol: s }
  }
  return null
}

export async function getStockInfoByInput({ input }) {
  if (!input) return { error: 'input required', status: 400 }
  const normalized = normalizeInput(input)
  if (!normalized) return { error: 'invalid input', status: 400 }
  const pool = getPgPool()
  if (!pool) return { error: 'DATABASE_URL missing', status: 500 }
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
  if (!row) return { error: 'not found', status: 404 }
  const ts_code = `${row.symbol}.${row.exchange_code}`
  return { data: { ...row, ts_code } }
}

