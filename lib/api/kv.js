function hasUpstash() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

async function upstashPipeline(commands) {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '') + '/pipeline'
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || ''
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ commands })
  })
  if (!res.ok) return { error: `upstash http ${res.status}` }
  const json = await res.json()
  return { json }
}

export async function incrWithExpiry(key, ttlSeconds) {
  if (!hasUpstash()) return { error: 'upstash not configured' }
  const ttl = Math.max(1, Math.floor(ttlSeconds))
  const r = await upstashPipeline([
    ['INCR', key],
    ['EXPIRE', key, ttl, 'NX'],
    ['TTL', key]
  ])
  if (r.error) return { error: r.error }
  const out = Array.isArray(r.json) ? r.json : []
  const n = Number(out?.[0]?.result ?? NaN)
  const remainingTtl = Number(out?.[2]?.result ?? NaN)
  if (!Number.isFinite(n)) return { error: 'upstash bad response' }
  return { value: n, ttl: Number.isFinite(remainingTtl) ? remainingTtl : ttl }
}

