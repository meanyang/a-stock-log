import pgPkg from 'pg'

export function getPgPool() {
  const url = process.env.DATABASE_URL || ''
  if (!url) return null
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = new pgPkg.Pool({ connectionString: url })
  }
  return globalThis.__pgPool
}

