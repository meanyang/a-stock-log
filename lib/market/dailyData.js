import { resolveStock } from './symbolResolver.js'
import { breakerFetch } from '../api/breakerFetch.js'

const TUSHARE_URL = 'https://api.tushare.pro'
const DAILY_FIELDS = 'trade_date,open,high,low,close,vol'

export function yyyymmdd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function isYYYYMMDD(s) {
  return /^\d{8}$/.test(String(s || ''))
}

async function tusharePost(api_name, params, fields) {
  const token = process.env.TUSHARE_TOKEN || ''
  if (!token) return { error: 'TUSHARE_TOKEN missing' }
  const body = JSON.stringify({ api_name, token, params, fields })
  let res
  try {
    res = await breakerFetch(
      'tushare',
      TUSHARE_URL,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body },
      { failureThreshold: 5, openMs: 30000 }
    )
  } catch (e) {
    if (e && e.code === 'CIRCUIT_OPEN') return { error: 'tushare circuit open' }
    return { error: 'tushare request failed' }
  }
  const json = await res.json()
  if (json.code !== 0) return { error: json.msg || 'tushare error' }
  const { fields: fs, items } = json.data
  const rows = items.map(arr => Object.fromEntries(fs.map((f, i) => [f, arr[i]])))
  return { rows }
}

function normalizeDailyRows(rows) {
  return rows
    .map(r => ({
      date: String(r.trade_date || ''),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      vol: Number(r.vol)
    }))
    .filter(r => /^\d{8}$/.test(r.date))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchDailyBarsByTsCode(ts_code, start_date, end_date) {
  const code = String(ts_code || '').trim().toUpperCase()
  if (!/^\d{6}\.(SH|SZ|BJ)$/.test(code)) return { error: 'invalid ts_code' }
  if (start_date && !isYYYYMMDD(start_date)) return { error: 'invalid start_date' }
  if (end_date && !isYYYYMMDD(end_date)) return { error: 'invalid end_date' }

  const r = await tusharePost('daily', { ts_code: code, start_date, end_date }, DAILY_FIELDS)
  if (r.error) return { error: r.error }
  const bars = normalizeDailyRows(r.rows || [])
  return { ts_code: code, bars }
}

export async function fetchDailyBarsByInput(input, start_date, end_date) {
  const resolved = await resolveStock(input)
  if (resolved.error) return { error: resolved.error }
  return fetchDailyBarsByTsCode(resolved.ts_code, start_date, end_date)
}
