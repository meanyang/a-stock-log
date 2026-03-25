const circuits = new Map()

function nowMs() {
  return Date.now()
}

function getCircuit(name) {
  if (!circuits.has(name)) {
    circuits.set(name, { state: 'closed', failures: 0, nextTryAt: 0 })
  }
  return circuits.get(name)
}

export function isCircuitOpen(name) {
  const c = getCircuit(name)
  if (c.state !== 'open') return false
  if (nowMs() >= c.nextTryAt) {
    c.state = 'half'
    return false
  }
  return true
}

export async function withCircuitBreaker(name, fn, opts = {}) {
  const failureThreshold = Math.max(1, Math.floor(opts.failureThreshold ?? 5))
  const openMs = Math.max(1000, Math.floor(opts.openMs ?? 30000))
  const c = getCircuit(name)
  if (c.state === 'open' && nowMs() < c.nextTryAt) {
    const e = new Error('circuit open')
    e.code = 'CIRCUIT_OPEN'
    throw e
  }
  try {
    const res = await fn()
    c.failures = 0
    c.state = 'closed'
    c.nextTryAt = 0
    return res
  } catch (err) {
    c.failures += 1
    if (c.failures >= failureThreshold) {
      c.state = 'open'
      c.nextTryAt = nowMs() + openMs
    } else if (c.state === 'half') {
      c.state = 'open'
      c.nextTryAt = nowMs() + openMs
    }
    throw err
  }
}

