import { incrWithExpiry } from './kv.js'

const mem = new Map()

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

function memIncr(key, windowSeconds) {
  const now = nowSec()
  const bucket = Math.floor(now / windowSeconds)
  const k = `${key}:${bucket}`
  const v = mem.get(k) || 0
  const next = v + 1
  mem.set(k, next)
  return { value: next, ttl: windowSeconds - (now % windowSeconds) }
}

export async function checkRateLimit({ key, limit, windowSeconds }) {
  const ws = Math.max(1, Math.floor(windowSeconds))
  const k = `rl:${key}:w${ws}`
  const r = await incrWithExpiry(k + `:${Math.floor(nowSec() / ws)}`, ws + 2)
  const out = r.error ? memIncr(k, ws) : r
  const remaining = Math.max(0, Math.floor(limit) - out.value)
  return {
    ok: out.value <= limit,
    limit: Math.floor(limit),
    remaining,
    reset_in: Math.max(0, Math.floor(out.ttl || ws))
  }
}

