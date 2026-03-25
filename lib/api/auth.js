import { getClientIp } from './ip.js'

function parseTokenList(s) {
  const v = String(s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
  return v
}

function getAllowedTokens() {
  return parseTokenList(process.env.API_AUTH_TOKENS || '')
}

export function getAuthToken(request) {
  const apiKey = request.headers.get('x-api-key')
  if (apiKey) return String(apiKey).trim()
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m && m[1]) return m[1].trim()
  return ''
}

export function authenticate(request, { required = false } = {}) {
  const allowed = getAllowedTokens()
  const token = getAuthToken(request)
  const ip = getClientIp(request)

  if (required && !token) return { ok: false, status: 401, error: 'missing token' }
  if (token && allowed.length && !allowed.includes(token)) return { ok: false, status: 401, error: 'invalid token' }
  return { ok: true, subject: token ? `token:${token}` : `ip:${ip}`, token }
}
