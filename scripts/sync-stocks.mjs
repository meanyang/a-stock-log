import { spawn } from 'node:child_process'
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

async function resolveDatabaseUrl() {
  const v = process.env.DATABASE_URL
  if (v) return v
  const fromFile = await loadDatabaseUrlFromEnvLocal()
  if (fromFile) return fromFile
  const e = new Error('DATABASE_URL missing')
  e.code = 'ENV_MISSING'
  throw e
}

function isAfter18China(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).formatToParts(now)
  const h = Number(p.find(x => x.type === 'hour')?.value || '0')
  return h >= 18
}

function parseArgs(argv) {
  const out = { force: false }
  for (const a of argv.slice(2)) {
    if (a === '--force' || a === '-f') out.force = true
  }
  return out
}

function runProcess(bin, args, options = {}) {
  const env = options.env || process.env
  const cwd = options.cwd || process.cwd()
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env, cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', c => {
      stdout += c
    })
    child.stderr.on('data', c => {
      stderr += c
    })
    child.on('error', reject)
    child.on('close', code => {
      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

async function ensureAkshareDeps() {
  const depsDir = path.join(__dirname, 'akshare', '_pydeps')
  const reqPath = path.join(__dirname, 'akshare', 'requirements.txt')
  const env = { ...process.env, PYTHONPATH: depsDir + (process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : '') }

  const probe = await runProcess('python3', ['-c', 'import akshare, pandas'], { env })
  if (probe.code === 0) return { env }

  const pip = await runProcess('python3', ['-m', 'pip', 'install', '--target', depsDir, '-r', reqPath], { env })
  if (pip.code !== 0) {
    const err = new Error(`pip install failed (${pip.code}): ${pip.stderr.trim()}`)
    err.code = 'PIP_FAILED'
    throw err
  }

  const probe2 = await runProcess('python3', ['-c', 'import akshare, pandas'], { env })
  if (probe2.code !== 0) {
    const err = new Error(`akshare import failed: ${probe2.stderr.trim()}`)
    err.code = 'AKSHARE_IMPORT_FAILED'
    throw err
  }

  return { env }
}

async function runPythonDump() {
  const scriptPath = path.join(__dirname, 'akshare', 'stocks_dump.py')
  const { env } = await ensureAkshareDeps()
  const r = await runProcess('python3', [scriptPath], { env })
  if (r.code !== 0) {
    const err = new Error(`python failed (${r.code}): ${r.stderr.trim()}`)
    err.code = 'PYTHON_FAILED'
    throw err
  }
  try {
    return JSON.parse(r.stdout)
  } catch (e) {
    const err = new Error(`invalid json from python: ${e.message}`)
    err.code = 'PYTHON_BAD_JSON'
    err.stderr = r.stderr
    throw err
  }
}

async function upsertExchanges(client) {
  const rows = [
    { code: 'SH', name: '上海证券交易所' },
    { code: 'SZ', name: '深圳证券交易所' },
    { code: 'BJ', name: '北京证券交易所' }
  ]

  for (const x of rows) {
    await client.query(
      `INSERT INTO exchanges (code, name, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [x.code, x.name]
    )
  }

  const r = await client.query('SELECT id, code FROM exchanges WHERE code IN ($1, $2, $3)', ['SH', 'SZ', 'BJ'])
  return new Map(r.rows.map(x => [x.code, x.id]))
}

async function bulkUpsertStocks(client, exchangeIdByCode, stocks) {
  const exchangeIds = []
  const symbols = []
  const names = []
  const types = []
  const boards = []
  const sources = []

  for (const s of stocks) {
    const exchangeId = exchangeIdByCode.get(s.exchange_code)
    if (!exchangeId) continue
    const symbol = String(s.symbol || '').trim()
    if (!/^\d{6}$/.test(symbol)) continue
    const name = String(s.name || '').trim()
    const type = String(s.type || 'stock').trim() || 'stock'
    const board = s.board == null ? null : String(s.board).trim() || null
    const source = String(s.creation_source || '').trim() || null

    exchangeIds.push(exchangeId)
    symbols.push(symbol)
    names.push(name)
    types.push(type)
    boards.push(board)
    sources.push(source)
  }

  if (exchangeIds.length === 0) return { upserted: 0 }

  const q = `
    WITH input AS (
      SELECT *
      FROM UNNEST(
        $1::bigint[],
        $2::text[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::text[]
      ) AS t(exchange_id, symbol, name, type, board, creation_source)
    )
    INSERT INTO stocks (
      exchange_id, symbol, name, type, board, status, creation_source, updated_at
    )
    SELECT
      exchange_id,
      symbol,
      COALESCE(NULLIF(name, '')::text, symbol),
      NULLIF(type, '')::text,
      NULLIF(board, '')::text,
      'active',
      NULLIF(creation_source, '')::text,
      now()
    FROM input
    ON CONFLICT (exchange_id, symbol) DO UPDATE SET
      name = CASE WHEN EXCLUDED.name IS NOT NULL THEN EXCLUDED.name ELSE stocks.name END,
      type = COALESCE(EXCLUDED.type, stocks.type),
      board = COALESCE(EXCLUDED.board, stocks.board),
      creation_source = COALESCE(EXCLUDED.creation_source, stocks.creation_source),
      updated_at = now()
  `
  await client.query(q, [exchangeIds, symbols, names, types, boards, sources])
  return { upserted: exchangeIds.length }
}

async function markDelistedByMissing(client, exchangeIds, symbolSetByExchangeId) {
  const exchangeIdArr = Array.from(exchangeIds)
  for (const exchangeId of exchangeIdArr) {
    const symbols = Array.from(symbolSetByExchangeId.get(exchangeId) || [])
    if (symbols.length === 0) continue
    await client.query(
      `UPDATE stocks
       SET status = 'delisted', updated_at = now()
       WHERE exchange_id = $1
         AND status = 'active'
         AND symbol <> ALL($2::text[])`,
      [exchangeId, symbols]
    )
  }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.force && !isAfter18China()) {
    process.stdout.write(JSON.stringify({ skipped: true, reason: 'before 18:00 Asia/Shanghai' }) + '\n')
    return
  }

  const DATABASE_URL = await resolveDatabaseUrl()
  const dump = await runPythonDump()
  const stocks = Array.isArray(dump?.stocks) ? dump.stocks : []

  const client = new pgPkg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    const run = await client.query(
      `INSERT INTO import_runs (source, status)
       VALUES ($1, 'running')
       RETURNING id`,
      ['stocks:official+akshare']
    )
    const importRunId = run.rows[0].id

    const exchangeIdByCode = await upsertExchanges(client)
    const { upserted } = await bulkUpsertStocks(client, exchangeIdByCode, stocks)

    const symbolSetByExchangeId = new Map()
    for (const s of stocks) {
      const exchangeId = exchangeIdByCode.get(s.exchange_code)
      if (!exchangeId) continue
      const symbol = String(s.symbol || '').trim()
      if (!/^\d{6}$/.test(symbol)) continue
      if (!symbolSetByExchangeId.has(exchangeId)) symbolSetByExchangeId.set(exchangeId, new Set())
      symbolSetByExchangeId.get(exchangeId).add(symbol)
    }
    await markDelistedByMissing(client, exchangeIdByCode.values(), symbolSetByExchangeId)

    await client.query(
      `UPDATE import_runs
       SET status = 'success', finished_at = now(), message = $2
       WHERE id = $1`,
      [importRunId, `upserted=${upserted}`]
    )

    const totalR = await client.query('SELECT count(*) AS n FROM stocks')
    const byStatusR = await client.query('SELECT status, count(*) AS n FROM stocks GROUP BY status ORDER BY status')
    const total = Number(totalR.rows[0]?.n || 0)
    const by_status = byStatusR.rows.map(x => ({ status: x.status, n: Number(x.n || 0) }))

    await client.query('COMMIT')
    process.stdout.write(JSON.stringify({ ok: true, upserted, total, by_status }) + '\n')
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
