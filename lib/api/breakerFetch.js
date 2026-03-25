import { withCircuitBreaker } from './circuitBreaker.js'

export async function breakerFetch(name, url, init, opts) {
  return withCircuitBreaker(
    name,
    async () => {
      const res = await fetch(url, init)
      if (!res.ok) {
        const e = new Error(`http ${res.status}`)
        e.code = 'HTTP_ERROR'
        e.status = res.status
        throw e
      }
      return res
    },
    opts
  )
}

