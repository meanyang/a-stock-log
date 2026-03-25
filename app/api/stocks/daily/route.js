export const dynamic = 'force-dynamic'

import { resolveStock } from '../../../../lib/market/symbolResolver.js'
import { fetchDailyBarsByTsCode, yyyymmdd } from '../../../../lib/market/dailyData.js'

const cache = {
  daily: new Map()
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

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function mergeByDate(a, b) {
  const m = new Map()
  for (const r of a || []) if (r && r.date) m.set(r.date, r)
  for (const r of b || []) if (r && r.date) m.set(r.date, r)
  return Array.from(m.values()).sort((x, y) => String(x.date).localeCompare(String(y.date)))
}

export async function GET(request) {
  const url = new URL(request.url)
  const input = url.searchParams.get('input') || url.searchParams.get('ts_code') || ''
  const start_date = url.searchParams.get('start_date') || ''
  const end_date = url.searchParams.get('end_date') || ''
  const limitRaw = Number(url.searchParams.get('limit') || 400)
  const limit = Number.isFinite(limitRaw) ? limitRaw : 400
  if (!input) return ok({ code: 400, msg: 'input required' }, 400)

  const resolved = await resolveStock(input)
  if (resolved.error) {
    if (resolved.error === 'DATABASE_URL missing') return ok({ code: 500, msg: resolved.error }, 500)
    return ok({ code: 1, msg: resolved.error }, 400)
  }
  const ts_code = resolved.ts_code

  const tokenSet = !!process.env.TUSHARE_TOKEN
  if (!tokenSet) return ok({ code: -1, msg: 'Missing TUSHARE_TOKEN' }, 500)

  const today = new Date()
  const todayStr = yyyymmdd(today)
  const needUpdateAfter18 = isAfter18()

  const cached = cache.daily.get(ts_code) || null
  let merged = cached
  const isEmpty = !cached || !Array.isArray(cached.rows) || cached.rows.length === 0
  if (isEmpty) {
    let from = start_date
    if (!from) {
      if (typeof limit === 'number' && limit > 0) {
        const back = Math.max(450, Math.min(3650, Math.floor(limit * 3)))
        const d = new Date(today)
        d.setDate(d.getDate() - back)
        from = yyyymmdd(d)
      } else {
        from = '20000101'
      }
    }
    const to = end_date || todayStr
    const r = await fetchDailyBarsByTsCode(ts_code, from, to)
    if (r.error) return ok({ code: 500, msg: r.error }, 502)
    const rows = r.bars || []
    const out = typeof limit === 'number' && limit > 0 ? rows.slice(-Math.min(limit, 1000)) : rows
    if (!out.length) return ok({ code: 2, msg: 'No daily data' }, 404)
    merged = { ts_code, last_update: Date.now(), last_date: out[out.length - 1].date, rows: out }
    cache.daily.set(ts_code, merged)
  } else {
    let shouldFetch = false
    if (needUpdateAfter18 && cached.last_date && cached.last_date < todayStr) {
      shouldFetch = true
    }
    if (shouldFetch) {
      const from = nextYYYYMMDD(cached.last_date) || cached.last_date
      const to = end_date || todayStr
      const r = await fetchDailyBarsByTsCode(ts_code, from, to)
      if (!r.error && r.bars && r.bars.length) {
        const mergedRows = mergeByDate(cached.rows || [], r.bars)
        const out = typeof limit === 'number' && limit > 0 ? mergedRows.slice(-Math.min(limit, 1000)) : mergedRows
        merged = { ts_code, last_update: Date.now(), last_date: out[out.length - 1].date, rows: out }
        cache.daily.set(ts_code, merged)
      }
    }
  }

  return ok({ code: 0, data: merged })
}

