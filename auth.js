import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { getPgPool } from './lib/db/pool.js'

async function findUserByEmail(email) {
  const pool = getPgPool()
  if (!pool) return null
  const q = 'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1'
  const r = await pool.query(q, [String(email || '').toLowerCase()])
  const row = r?.rows?.[0]
  if (!row) return null
  return { id: row.id, email: row.email, passwordHash: row.password_hash }
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128)
})

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'dev-secret'),
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'Email',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' }
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials || {})
        if (!parsed.success) return null
        const { email, password } = parsed.data
        const user = await findUserByEmail(email)
        if (!user) return null
        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null
        return { id: String(user.id), email: user.email }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      const uid = token?.uid
      if (session?.user) {
        if (uid != null) session.user.id = String(uid)
        if (token?.email && !session.user.email) session.user.email = String(token.email)
      }
      return session
    }
  },
  pages: {
    signIn: '/login'
  }
}
