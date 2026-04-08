import { resolveStock } from '../market/symbolResolver.js'
import { fetchDailyBarsByTsCode, yyyymmdd } from '../market/dailyData.js'

const cache = { daily: new Map() }

function normYYYYMMDD(input) {
  const s = String(input || '').trim()
  if (!s) return ''
  if (/^\d{8}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, '')
  return null
}

function nextYYYYMMDD(s) {
  if (!/^\d{8}$/.test(s)) return null
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
  d.setDate(d.getDate() + 1)
  return yyyymmdd(d)
}

function isAfter18() {
  const n = new Date()
  return n.getHours() >= 18
}

function mergeByDate(a, b) {
  const m = new Map()
  for (const r of a || []) if (r && r.date) m.set(r.date, r)
  for (const r of b || []) if (r && r.date) m.set(r.date, r)
  return Array.from(m.values()).sort((x, y) => String(x.date).localeCompare(String(y.date)))
}

export async function getDailyByInput({ input, start_date, end_date, limit = 400 }) {
  if (!input) return { error: 'input required', status: 400 }
  const sd = normYYYYMMDD(start_date)
  if (sd === null) return { error: 'invalid start_date', status: 400 }
  const ed = normYYYYMMDD(end_date)
  if (ed === null) return { error: 'invalid end_date', status: 400 }

  const today = new Date()
  const todayStr = yyyymmdd(today)
  const reqTo = ed || todayStr
  let reqFrom = sd
  if (!reqFrom) {
    if (typeof limit === 'number' && limit > 0) {
      const back = Math.max(450, Math.min(3650, Math.floor(limit * 3)))
      const d = ed
        ? new Date(`${reqTo.slice(0, 4)}-${reqTo.slice(4, 6)}-${reqTo.slice(6, 8)}`)
        : new Date(today)
      d.setDate(d.getDate() - back)
      reqFrom = yyyymmdd(d)
    } else {
      reqFrom = '20000101'
    }
  }
  if (reqFrom && reqTo && reqFrom > reqTo) return { error: 'start_date after end_date', status: 400 }

  const resolved = await resolveStock(input)
  if (resolved.error) {
    if (resolved.error === 'DATABASE_URL missing') return { error: resolved.error, status: 500 }
    return { error: resolved.error, status: 400 }
  }
  const ts_code = resolved.ts_code
  const tokenSet = !!process.env.TUSHARE_TOKEN
  if (!tokenSet) return { error: 'Missing TUSHARE_TOKEN', status: 500 }
  const needUpdateAfter18 = isAfter18()

  const cached = cache.daily.get(ts_code) || null
  let merged = cached
  const isEmpty = !cached || !Array.isArray(cached.rows) || cached.rows.length === 0
  if (isEmpty) {
    const r = await fetchDailyBarsByTsCode(ts_code, reqFrom, reqTo)
    if (r.error) return { error: r.error, status: 502 }
    const rows = r.bars || []
    const cap = 5000
    const out = rows.length > cap ? rows.slice(-cap) : rows
    if (!out.length) return { error: 'No daily data', status: 404 }
    merged = { ts_code, last_update: Date.now(), last_date: out[out.length - 1].date, rows: out }
    cache.daily.set(ts_code, merged)
  } else {
    const cap = 5000
    const rows0 = Array.isArray(cached.rows) ? cached.rows : []
    const firstDate = rows0.length ? rows0[0].date : ''
    const lastDate = rows0.length ? rows0[rows0.length - 1].date : (cached.last_date || '')
    let cur = rows0

    const needFetchBackward = !!(reqFrom && firstDate && reqFrom < firstDate)
    const needFetchForward = !!(reqTo && lastDate && reqTo > lastDate)
    const needDailyUpdate = !!(needUpdateAfter18 && lastDate && lastDate < todayStr)

    if (needFetchBackward) {
      const r = await fetchDailyBarsByTsCode(ts_code, reqFrom, firstDate)
      if (r.error) return { error: r.error, status: 502 }
      if (r.bars && r.bars.length) cur = mergeByDate(r.bars, cur)
    }

    if (needFetchForward || needDailyUpdate) {
      const from = nextYYYYMMDD(lastDate || cached.last_date) || (lastDate || cached.last_date)
      const to = needFetchForward ? reqTo : todayStr
      if (from && to && from <= to) {
        const r = await fetchDailyBarsByTsCode(ts_code, from, to)
        if (!r.error && r.bars && r.bars.length) cur = mergeByDate(cur, r.bars)
      }
    }

    if (cur.length > cap) cur = cur.slice(-cap)
    if (cur !== rows0) {
      merged = { ts_code, last_update: Date.now(), last_date: cur[cur.length - 1].date, rows: cur }
      cache.daily.set(ts_code, merged)
    } else {
      merged = cached
    }
  }
  const srcRows = Array.isArray(merged?.rows) ? merged.rows : []
  let view = srcRows
  if (reqFrom) view = view.filter(r => r && r.date && r.date >= reqFrom)
  if (reqTo) view = view.filter(r => r && r.date && r.date <= reqTo)
  if (typeof limit === 'number' && limit > 0) view = view.slice(-Math.min(limit, 1000))
  if (!view.length) return { error: 'No daily data', status: 404 }
  return { data: { ts_code: merged.ts_code, last_update: merged.last_update, last_date: merged.last_date, rows: view } }
}

export async function getCandlesForPredict({ symbol, start_date, end_date, backDays = 90, limit = 300 }) {
  const s = String(symbol || '').trim()
  if (!s) return { error: 'symbol required', status: 400 }

  const today = new Date()
  const ed = String(end_date || '').trim() || yyyymmdd(today)
  const sd = String(start_date || '').trim() || (() => {
    const back = new Date(today)
    back.setDate(back.getDate() - Math.max(1, Math.floor(backDays)))
    return yyyymmdd(back)
  })()

  const r = await getDailyByInput({ input: s, start_date: sd, end_date: ed, limit })
  if (r.error) return { error: r.error, status: r.status || 502 }

  const rows = Array.isArray(r.data?.rows) ? r.data.rows : []
  const candles = rows.map(x => ({
    date: `${x.date.slice(0, 4)}-${x.date.slice(4, 6)}-${x.date.slice(6, 8)}`,
    open: Number(x.open),
    high: Number(x.high),
    low: Number(x.low),
    close: Number(x.close),
    vol: Number(x.vol),
    amount: Number(x.amount)
  }))
  if (!candles.length) return { error: 'No daily data', status: 404 }

  return {
    data: {
      ts_code: r.data.ts_code,
      last_update: r.data.last_update,
      last_date: r.data.last_date,
      candles
    }
  }
}
