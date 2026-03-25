export function getClientIp(request) {
  const xf = request.headers.get('x-forwarded-for') || ''
  if (xf) {
    const first = xf.split(',')[0].trim()
    if (first) return first
  }
  const xr = request.headers.get('x-real-ip') || ''
  if (xr) return xr.trim()
  return '0.0.0.0'
}

