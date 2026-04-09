export const dynamic = 'force-dynamic'

import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { guard } from '../../../../lib/api/guard.js'
import { getPgPool } from '../../../../lib/db/pool.js'

function ok(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extraHeaders } })
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128)
})

export async function POST(request) {
  try {
    const g = await guard(request, {
      name: 'auth.register',
      rateLimits: [{ scope: 'ip', limit: 20, windowSeconds: 60 }]
    })
    if (!g.ok) return g.response

    const pool = getPgPool()
    if (!pool) return ok({ code: 500, msg: 'DATABASE_URL missing' }, 500, g.headers || {})

    const body = await request.json()
    const parsed = registerSchema.safeParse(body || {})
    if (!parsed.success) return ok({ code: 400, msg: 'invalid input' }, 400, g.headers || {})
    const { email, password } = parsed.data

    const exists = await pool.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email])
    if (exists?.rows?.length) return ok({ code: 409, msg: 'email already registered' }, 409, g.headers || {})

    const roundsRaw = Number(process.env.PASSWORD_SALT_ROUNDS || 10)
    const rounds = Number.isFinite(roundsRaw) ? Math.min(Math.max(Math.floor(roundsRaw), 10), 14) : 10
    const passwordHash = await bcrypt.hash(password, rounds)
    const ins = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    )
    const u = ins?.rows?.[0]
    return ok({ code: 0, data: { id: u?.id, email: u?.email } }, 200, g.headers || {})
  } catch (e) {
    return ok({ code: 500, msg: e?.message || String(e) }, 500)
  }
}

