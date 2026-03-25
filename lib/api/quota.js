import { incrWithExpiry } from './kv.js'

const mem = new Map()

function yyyymmddUTC(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function secondsUntilNextUtcDay(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0))
  return Math.max(1, Math.floor((next.getTime() - now.getTime()) / 1000))
}

function memIncr(key, ttlSeconds) {
  const day = yyyymmddUTC()
  const k = `${key}:${day}`
  const v = mem.get(k) || 0
  const next = v + 1
  mem.set(k, next)
  return { value: next, ttl: Math.min(ttlSeconds, secondsUntilNextUtcDay()) }
}

export async function checkDailyQuota({ key, limit }) {
  const day = yyyymmddUTC()
  const ttl = secondsUntilNextUtcDay() + 60
  const r = await incrWithExpiry(`qt:${key}:${day}`, ttl)
  const out = r.error ? memIncr(`qt:${key}`, ttl) : r
  const remaining = Math.max(0, Math.floor(limit) - out.value)
  return {
    ok: out.value <= limit,
    limit: Math.floor(limit),
    remaining,
    reset_in: Math.max(0, Math.floor(out.ttl || ttl))
  }
}

