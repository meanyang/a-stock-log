import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pgPkg from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function loadDatabaseUrlFromEnvLocal() {
  try {
    const p = path.join(process.cwd(), '.env.local')
    const text = await fs.readFile(p, 'utf8')
    for (const line of text.split('\n')) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const m = s.match(/^DATABASE_URL\s*=\s*(.+)\s*$/)
      if (!m) continue
      let v = m[1].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (v) return v
    }
  } catch {}
  return ''
}

function mustEnv(name) {
  const v = process.env[name]
  if (v) return v
  const e = new Error(`${name} missing`)
  e.code = 'ENV_MISSING'
  throw e
}

async function resolveDatabaseUrl() {
  const v = process.env.DATABASE_URL
  if (v) return v
  const fromFile = await loadDatabaseUrlFromEnvLocal()
  if (fromFile) return fromFile
  const e = new Error('DATABASE_URL missing')
  e.code = 'ENV_MISSING'
  throw e
}

async function main() {
  const DATABASE_URL = await resolveDatabaseUrl()
  const sqlPath = path.join(__dirname, 'schema.sql')
  const sql = await fs.readFile(sqlPath, 'utf8')

  const client = new pgPkg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    throw e
  } finally {
    await client.end()
  }
}

await main()
