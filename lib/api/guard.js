import { getClientIp } from './ip.js'
import { authenticate } from './auth.js'
import { checkRateLimit } from './ratelimit.js'
import { checkDailyQuota } from './quota.js'

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

function isGuardDisabled() {
  return String(process.env.API_GUARD_DISABLED || '').toLowerCase() === 'true'
}

export async function guard(request, opts = {}) {
  if (isGuardDisabled()) return { ok: true, ip: getClientIp(request), subject: 'disabled', token: '' }

  const ip = getClientIp(request)
  const auth = authenticate(request, { required: !!opts.requireAuth })
  if (!auth.ok) {
    return { ok: false, response: json({ code: 401, msg: auth.error }, auth.status || 401) }
  }

  const subject = (() => {
    const s = String(opts.subject || '').trim()
    if (s) return s
    return auth.subject || `ip:${ip}`
  })()
  const name = String(opts.name || 'api')
  const headers = {}

  const rateLimits = Array.isArray(opts.rateLimits) ? opts.rateLimits : []
  for (const r of rateLimits) {
    const scope = r.scope === 'subject' ? 'subject' : 'ip'
    const key = `${name}:${scope}:${scope === 'subject' ? subject : ip}`
    const chk = await checkRateLimit({ key, limit: r.limit, windowSeconds: r.windowSeconds })
    headers['x-ratelimit-limit'] = String(chk.limit)
    headers['x-ratelimit-remaining'] = String(chk.remaining)
    headers['x-ratelimit-reset'] = String(chk.reset_in)
    if (!chk.ok) {
      return { ok: false, response: json({ code: 429, msg: 'rate limited' }, 429, headers) }
    }
  }

  if (opts.dailyQuota && typeof opts.dailyQuota.limit === 'number') {
    const scope = opts.dailyQuota.scope === 'ip' ? 'ip' : 'subject'
    const key = `${name}:${scope}:${scope === 'subject' ? subject : ip}`
    const chk = await checkDailyQuota({ key, limit: opts.dailyQuota.limit })
    headers['x-quota-limit'] = String(chk.limit)
    headers['x-quota-remaining'] = String(chk.remaining)
    headers['x-quota-reset'] = String(chk.reset_in)
    if (!chk.ok) {
      return { ok: false, response: json({ code: 429, msg: 'quota exceeded' }, 429, headers) }
    }
  }

  return { ok: true, ip, subject, token: auth.token || '', headers }
}
