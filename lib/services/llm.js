import { breakerFetch } from '../api/breakerFetch.js'
import { calculateTechnicalIndicators } from '../market/technicalIndicators.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const GLM_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const DEBUG = String(process.env.LLM_DEBUG || '').toLowerCase() === 'true'
const LOG_PARAMS = DEBUG || String(process.env.LLM_LOG_PARAMS || '').toLowerCase() === 'true'
const LOG_PARAMS_FULL = String(process.env.LLM_LOG_PARAMS_FULL || '').toLowerCase() === 'true'

function sanitizeHeaders(headers) {
  const h = (headers && typeof headers === 'object') ? headers : {}
  const out = {}
  for (const k of Object.keys(h)) {
    const v = h[k]
    if (String(k).toLowerCase() === 'authorization') out[k] = 'Bearer ***'
    else out[k] = v
  }
  return out
}

async function readJsonResponse(res, tag) {
  const status = res && typeof res.status === 'number' ? res.status : null
  let text = ''
  try { text = await res.text() } catch {}
  if (!String(text || '').trim()) {
    if (DEBUG) try { console.log('[llm] empty response body', { tag, status }) } catch {}
    return { error: `${tag} empty response`, status }
  }
  try {
    return { json: JSON.parse(text), status }
  } catch (e) {
    if (DEBUG) try {
      console.log('[llm] invalid json response', { tag, status, error: e?.message || String(e), body_preview: String(text).slice(0, 500) })
    } catch {}
    return { error: `${tag} invalid json`, status }
  }
}

function summarizeMessages(messages, full) {
  const arr = Array.isArray(messages) ? messages : []
  const out = []
  for (const m of arr) {
    const role = m?.role
    const content = (m && typeof m.content === 'string') ? m.content : String(m?.content ?? '')
    out.push(full
      ? { role, content, content_len: content.length }
      : { role, content_len: content.length, content_preview: content.slice(0, 1200) }
    )
  }
  return out
}

function messagesAsObjects(messages, full) {
  const arr = Array.isArray(messages) ? messages : []
  const out = []
  for (const m of arr) {
    if (!m || typeof m !== 'object') continue
    const role = m.role
    const content = (typeof m.content === 'string') ? m.content : String(m.content ?? '')
    const obj = { ...m, role, content: full ? content : content.slice(0, 1200) }
    obj.content_len = content.length
    out.push(obj)
  }
  return out
}

function fmtDateDash(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function nextTradeDay(d) {
  const nd = new Date(d.getTime())
  do { nd.setDate(nd.getDate() + 1) } while (nd.getDay() === 0 || nd.getDay() === 6)
  return nd
}

export function preprocess(candles, ctxDays, horizon) {
  const series = candles.slice(-ctxDays).map(c => ({
    date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, vol: c.vol
  }))
  const closes = series.map(s => s.close)
  const ma = (n) => {
    const out = []
    let sum = 0
    for (let i = 0; i < closes.length; i++) {
      sum += closes[i]
      if (i >= n) sum -= closes[i - n]
      out.push(i >= n - 1 ? Number((sum / n).toFixed(4)) : null)
    }
    return out
  }
  const ema = (arr, n) => {
    const out = []
    const a = 2 / (n + 1)
    let prev = arr[0]
    out.push(prev)
    for (let i = 1; i < arr.length; i++) {
      const v = a * arr[i] + (1 - a) * prev
      out.push(v)
      prev = v
    }
    return out
  }
  const roc = closes.map((c, i) => (i === 0 ? 0 : Number(((c - closes[i - 1]) / Math.max(1e-9, closes[i - 1])).toFixed(6))))
  const rsi14 = (() => {
    const out = new Array(closes.length).fill(null)
    let gain = 0, loss = 0
    if (closes.length > 14) {
      for (let i = 1; i <= 14; i++) {
        const diff = closes[i] - closes[i - 1]
        gain += Math.max(0, diff); loss += Math.max(0, -diff)
      }
      out[14] = loss === 0 ? 100 : Number((100 - 100 / (1 + gain / loss)).toFixed(2))
      const alpha = 1 / 14
      for (let i = 15; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1]
        gain = (1 - alpha) * gain + alpha * Math.max(0, diff)
        loss = (1 - alpha) * loss + alpha * Math.max(0, -diff)
        out[i] = loss === 0 ? 100 : Number((100 - 100 / (1 + gain / loss)).toFixed(2))
      }
    }
    return out
  })()
  const atr14 = (() => {
    const out = new Array(series.length).fill(null)
    let prevClose = series[0]?.close
    const trs = []
    for (let i = 0; i < series.length; i++) {
      const s = series[i]
      const tr = Math.max(s.high - s.low, Math.abs(s.high - prevClose), Math.abs(s.low - prevClose))
      trs.push(tr)
      prevClose = s.close
      if (i >= 13) {
        let sum = 0
        for (let j = i - 13; j <= i; j++) sum += trs[j]
        out[i] = Number((sum / 14).toFixed(4))
      }
    }
    return out
  })()
  const boll = (() => {
    const n = 20, k = 2
    const mb = ma(n)
    const up = new Array(closes.length).fill(null)
    const dn = new Array(closes.length).fill(null)
    for (let i = 0; i < closes.length; i++) {
      if (i >= n - 1) {
        let sum = 0
        for (let j = i - n + 1; j <= i; j++) sum += closes[j]
        const mean = sum / n
        let ss = 0
        for (let j = i - n + 1; j <= i; j++) { const diff = closes[j] - mean; ss += diff * diff }
        const sd = Math.sqrt(ss / n)
        up[i] = Number((mean + k * sd).toFixed(4))
        dn[i] = Number((mean - k * sd).toFixed(4))
      }
    }
    return { mb, up, dn }
  })()
  const std = (arr) => {
    const x = arr.filter(v => typeof v === 'number' && isFinite(v))
    if (!x.length) return 0
    const mean = x.reduce((a, b) => a + b, 0) / x.length
    const s = x.reduce((a, b) => a + (b - mean) * (b - mean), 0) / x.length
    return Math.sqrt(s)
  }
  const slope = (arr) => {
    const n = arr.length
    if (n < 2) return 0
    const xmean = (n + 1) / 2
    const ymean = arr.reduce((a, b) => a + b, 0) / n
    let num = 0, den = 0
    for (let i = 0; i < n; i++) { const xi = i + 1; num += (xi - xmean) * (arr[i] - ymean); den += (xi - xmean) * (xi - xmean) }
    return den === 0 ? 0 : num / den
  }
  const features = {
    ma5: ma(5), ma10: ma(10), ma20: ma(20),
    roc, rsi14, atr14, boll,
    bollWidth: boll.up.map((v, i) => {
      const mb = boll.mb[i], dn = boll.dn[i]
      if (v == null || mb == null || dn == null) return null
      const w = v - dn
      return Number((w / Math.max(1e-9, mb)).toFixed(6))
    })
  }
  const closes2 = series.map(s => s.close)
  const summary = (() => {
    const lastClose = closes2[closes2.length - 1]
    const std20 = std(roc.slice(-20))
    const std60 = std(roc.slice(-60))
    const slope20 = slope(closes2.slice(-20))
    const slope60 = slope(closes2.slice(-60))
    const rsi = rsi14[rsi14.length - 1]
    const atr = atr14[atr14.length - 1]
    const bw = features.bollWidth[features.bollWidth.length - 1]
    const regime = (s20, s60, r) => {
      const up = s20 > 0 && s60 > 0
      const down = s20 < 0 && s60 < 0
      if (up && r > 55) return 'trending_up'
      if (down && r < 45) return 'trending_down'
      return 'ranging'
    }
    const hi = Math.max(...closes2.slice(-60))
    const lo = Math.min(...closes2.slice(-60))
    return {
      last_close: Number(lastClose.toFixed(4)),
      vol_std_20: Number(std20.toFixed(6)),
      vol_std_60: Number(std60.toFixed(6)),
      momentum_slope_20: Number(slope20.toFixed(6)),
      momentum_slope_60: Number(slope60.toFixed(6)),
      rsi14_last: rsi,
      atr14_last: atr,
      boll_width_last: bw,
      regime: regime(slope20, slope60, rsi),
      resistance_60: Number(hi.toFixed(4)),
      support_60: Number(lo.toFixed(4))
    }
  })()
  return { series, features, summary, horizon }
}

function hasZh(s) {
  return /[\u4e00-\u9fa5]/.test(String(s || ''))
}
function needZh(list) {
  if (!Array.isArray(list) || !list.length) return false
  let zh = 0
  for (const s of list) if (hasZh(s)) zh++
  const ratio = zh / list.length
  return ratio < 0.6
}
function parseTranslation(text) {
  try {
    const obj = JSON.parse(String(text || '{}'))
    const arr = obj && obj.explanation && Array.isArray(obj.explanation) ? obj.explanation.map(x => String(x).trim()).filter(Boolean) : null
    if (arr && arr.length) return arr
  } catch {}
  const str = String(text || '')
  const m = str.match(/"explanation"\s*:\s*\[(.*?)\]/s)
  if (m) {
    const inner = m[1]
    const qs = inner.match(/"([^"]+)"/g)
    if (qs) {
      const arr = qs.map(s => s.replace(/^"|"$/g, '')).map(x => x.trim()).filter(Boolean)
      if (arr.length) return arr
    }
  }
  const lines = str.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const out = []
  for (const ln of lines) {
    const t = ln.replace(/^[\-\*\u2022]\s*/, '')
    if (t) out.push(t)
  }
  return out
}

function responseFormatJsonSchema({ name, schema }) {
  return { type: 'json_schema', json_schema: { name, strict: true, schema } }
}

function predictJsonSchema(horizon) {
  const n = Math.max(1, Math.floor(Number(horizon || 0) || 1))
  return responseFormatJsonSchema({
    name: 'a_stock_predict',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['forecast', 'explanation'],
      properties: {
        forecast: {
          type: 'array',
          minItems: n,
          maxItems: n,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['date', 'close'],
            properties: {
              date: { type: 'string', format: 'date', description: 'Trading day in YYYY-MM-DD' },
              close: { type: 'number', description: 'Predicted close price' }
            }
          }
        },
        explanation: { type: 'array', items: { type: 'string', description: 'Short driver / reasoning point' }, maxItems: 20 }
      }
    }
  })
}

function translationJsonSchema() {
  return responseFormatJsonSchema({
    name: 'a_stock_explanation_zh',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['explanation'],
      properties: {
        explanation: { type: 'array', items: { type: 'string', description: '中文要点' }, maxItems: 20 }
      }
    }
  })
}
async function translateExplanation(provider, model, sysPrompt, explanation) {
  const system = (sysPrompt || '') + ' 将以下要点翻译为简洁中文要点。仅输出 JSON：{"explanation":["要点1","要点2",...]}。'
  const user = JSON.stringify({ explanation })
  const temperature = 0.1
  const maxTokens = 256
  if (provider === 'openai') {
    const headers = { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`, 'Content-Type': 'application/json' }
    const body = { model: model || (process.env.OPENAI_MODEL || 'gpt-4o-mini'), messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens, response_format: translationJsonSchema() }
    let res
    try {
      res = await breakerFetch('llm:translate:openai', OPENAI_URL, { method: 'POST', headers, body: JSON.stringify(body) }, { failureThreshold: 5, openMs: 30000 })
    } catch {
      return explanation
    }
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content || ''
    return parseTranslation(text)
  } else if (provider === 'deepseek') {
    const headers = { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`, 'Content-Type': 'application/json' }
    const body = { model: model || (process.env.DEEPSEEK_MODEL || 'deepseek-chat'), messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens, response_format: translationJsonSchema() }
    let res
    try {
      res = await breakerFetch('llm:translate:deepseek', DEEPSEEK_URL, { method: 'POST', headers, body: JSON.stringify(body) }, { failureThreshold: 5, openMs: 30000 })
    } catch {
      return explanation
    }
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content || ''
    return parseTranslation(text)
  } else {
    const headers = {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
      'Content-Type': 'application/json',
      ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
      ...(process.env.OPENROUTER_APP_TITLE ? { 'X-Title': process.env.OPENROUTER_APP_TITLE } : {})
    }
    const body = {
      model: model || (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature,
      max_tokens: maxTokens,
      response_format: translationJsonSchema()
    }
    let res
    try {
      res = await breakerFetch('llm:translate:openrouter', OPENROUTER_URL, { method: 'POST', headers, body: JSON.stringify(body) }, { failureThreshold: 5, openMs: 30000 })
    } catch {
      return explanation
    }
    const json = await res.json()
    let text = ''
    const ch = json?.choices?.[0]?.message
    if (ch && typeof ch.content === 'string' && ch.content.trim()) text = ch.content
    else if (ch && ch.reasoning != null) {
      text = typeof ch.reasoning === 'string' ? ch.reasoning : (() => { try { return JSON.stringify(ch.reasoning) } catch { return '' } })()
    }
    return parseTranslation(text)
  }
}

function defaultSystemPrompt(horizon) {
  const n = Math.max(1, Math.floor(Number(horizon || 0) || 1))
  return [
    `你是量化预测助手。基于提供的技术指标生成未来${n}个交易日的收盘价预测。`,
    ``,
    `规则：`,
    `1. 仅使用输入数据 (ticker, currentPrice, fibonacci, supportResistance, bollingerBands, macd, summary)`,
    `2. 趋势方向由MACD (dif与dea) 和布林带位置、最近支撑/阻力、summary.recommendation推断`,
    `3. 波动率参考布林带宽度或波动计算结果`,
    `4. 交易日：周一至周五，timestamp下一个交易日开始，跳过周末，日期格式"YYYY-MM-DD"`,
    `5. 输出格式必须严格遵守（仅输出 JSON，无额外文字，无 markdown）：`,
    `{"forecast":[{"date":"YYYY-MM-DD","close":<number>}],"explanation":["理由1","理由2"]}`,
    `其中 forecast 必须恰好 ${n} 项；explanation 最多 20 条完整短句，需要中文。`,
    ``,
    `步骤：确定偏向->找出最近支撑/阻力和波动要求->逐步生成${n}日收盘价->写出解释。`,
    `现在开始。`
  ].join('\n')
}

function buildPrompt(indicators, horizon, sysPrompt) {
  const base = defaultSystemPrompt(horizon)
  const extra = String(sysPrompt || '').trim()
  const system = extra ? `${extra}\n\n${base}` : base
  const user = JSON.stringify(indicators || {})
  return { system, user }
}

function stripCodeFences(s) {
  const str = String(s || '')
  const m = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (m && m[1]) return String(m[1]).trim()
  return str.trim()
}

function cleanExplanationLines(lines) {
  if (!Array.isArray(lines)) return []
  const out = []
  function pushOne(v) {
    let s = String(v || '').trim()
    if (!s) return
    if (s === '{' || s === '}' || s === '[' || s === ']' || s === ',' || s === '},' || s === '],' || s === '{,' || s === '[,') return
    s = s.replace(/^\s*\{?\s*"?explanation"?\s*:\s*\[?/i, '')
    s = s.replace(/^\s*\{?\s*"?forecast"?\s*:\s*\[?/i, '')
    s = s.replace(/\]\s*\}?\s*$/, '')
    s = s.replace(/^[\u2022\-\*\s]+/, '')
    s = s.replace(/^\s*"+/, '').replace(/"+\s*$/, '')
    s = s.replace(/^\s*'+/, '').replace(/'+\s*$/, '')
    s = s.replace(/^\s*`+/, '').replace(/`+\s*$/, '')
    s = s.replace(/,\s*$/, '')
    if (!s) return
    if (s === 'explanation' || s === 'forecast') return
    out.push(s)
  }
  for (const raw of lines) {
    const s0 = String(raw || '').trim()
    if (!s0) continue
    if (/^"?explanation"?\s*:\s*\[?\s*$/i.test(s0) || /^"?forecast"?\s*:\s*\[?\s*$/i.test(s0)) continue
    const stripped = s0.replace(/^\s*\{?\s*"?explanation"?\s*:\s*\[?/i, '').replace(/\]\s*\}?\s*$/, '')
    if (stripped.includes('","')) {
      for (const part of stripped.split('","')) pushOne(part)
      continue
    }
    pushOne(s0)
  }
  return out
}

function normalizeExplanation(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    const flat = raw.map(x => String(x == null ? '' : x))
    if (flat.length === 1) {
      const one = stripCodeFences(flat[0])
      if (one.includes('"explanation"')) {
        try {
          const s = one.startsWith('{') ? one : (one.trim().startsWith('"explanation"') ? `{${one}}` : one)
          const obj = JSON.parse(s)
          if (obj && Array.isArray(obj.explanation)) return cleanExplanationLines(obj.explanation)
        } catch {}
      }
    }
    return cleanExplanationLines(flat)
  }
  const str = stripCodeFences(raw)
  if (!str) return []
  if (str.startsWith('{') && str.includes('"explanation"')) {
    try {
      const obj = JSON.parse(str)
      if (obj && Array.isArray(obj.explanation)) return cleanExplanationLines(obj.explanation)
    } catch {}
  }
  if (str.trim().startsWith('"explanation"')) {
    try {
      const obj = JSON.parse(`{${str}}`)
      if (obj && Array.isArray(obj.explanation)) return cleanExplanationLines(obj.explanation)
    } catch {}
  }
  const m = str.match(/"explanation"\s*:\s*\[(.*?)\]/s)
  if (m) {
    const inner = m[1]
    const qs = inner.match(/"([^"]+)"/g)
    if (qs) return cleanExplanationLines(qs.map(s => s.replace(/^"|"$/g, '')))
  }
  return cleanExplanationLines(str.split(/\n+/).map(s => s.trim()).filter(Boolean))
}

function parseOutput(text, lastDate, horizon) {
  let obj = null
  try { obj = JSON.parse(text) } catch { obj = null }
  if (obj && typeof obj === 'object') {
    const fc = Array.isArray(obj.forecast) ? obj.forecast.map(x => ({ date: x.date, close: Number(x.close) })) : []
    const exp = normalizeExplanation(obj.explanation)
    const fcFuture = fc.filter(x => x && String(x.date) > String(lastDate) && isFinite(x.close)).slice(0, horizon || fc.length)
    return { forecast: fcFuture, explanation: exp }
  }
  const str = String(text || '')
  const forecast = []
  let m
  const rx1 = /"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"[^}]*?"close"\s*:\s*(-?\d+(?:\.\d+)?)/g
  const rx2 = /"close"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g
  while ((m = rx1.exec(str))) forecast.push({ date: m[1], close: Number(m[2]) })
  while ((m = rx2.exec(str))) forecast.push({ date: m[2], close: Number(m[1]) })
  const seen = new Set()
  const fc2 = []
  for (const item of forecast) {
    const key = `${item.date}`
    if (!seen.has(key) && isFinite(item.close)) { seen.add(key); fc2.push(item) }
  }
  const fcFuture = fc2.filter(x => String(x.date) > String(lastDate)).slice(0, horizon || fc2.length)
  let explanation = []
  const em = str.match(/"explanation"\s*:\s*\[(.*?)\]/s)
  if (em) {
    const inner = em[1]
    const qs = inner.match(/"([^"]+)"/g)
    if (qs) explanation = cleanExplanationLines(qs.map(s => s.replace(/^"|"$/g, '')))
  }
  if (fcFuture.length) return { forecast: fcFuture, explanation }
  const lines = str.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const out = []
  const start = new Date(lastDate)
  let d = start
  for (let i = 0; i < lines.length && (!horizon || out.length < horizon); i++) {
    d = nextTradeDay(d)
    const num = Number(String(lines[i]).replace(/[^\d\.\-]/g, ''))
    if (!isNaN(num)) out.push({ date: fmtDateDash(d), close: Number(num.toFixed(2)) })
  }
  return { forecast: out, explanation: [] }
}

async function callOpenRouter(input, indicators, horizon, model, sysPrompt, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY || ''
  const referer = process.env.OPENROUTER_HTTP_REFERER || 'https://astocklog.19900128.xyz'
  const title = process.env.OPENROUTER_APP_TITLE || 'AStockLog'
  const temperature = Number(process.env.OPENROUTER_TEMPERATURE || 0.2)
  const maxTokens = (() => {
    const n = Number(opts && opts.maxTokens)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return Number(process.env.OPENROUTER_MAX_TOKENS || 2048)
  })()
  const modelId = String(model || '')
  const prompt = buildPrompt(indicators, horizon, sysPrompt)
  if (DEBUG) try {
    console.log('[llm] openrouter input', {
      model: modelId,
      horizon,
      ctx_days: input.series.length,
      temperature,
      max_tokens: maxTokens,
      system_len: (prompt.system || '').length,
      user_len: (prompt.user || '').length,
      user_preview: String(prompt.user || '').slice(0, 300)
    })
  } catch {}
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(referer ? { 'HTTP-Referer': referer } : {}),
    ...(title ? { 'X-Title': title } : {})
  }
  const body = {
    model: modelId,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    temperature,
    max_tokens: maxTokens
  }
  if (LOG_PARAMS) try {
    console.log('[llm] openrouter request', {
      url: OPENROUTER_URL,
      headers: sanitizeHeaders(headers),
      body: { ...body, messages: messagesAsObjects(body.messages, LOG_PARAMS_FULL) }
    })
  } catch {}
  let res
  try {
    res = await breakerFetch('llm:openrouter', OPENROUTER_URL, { method: 'POST', headers, body: JSON.stringify(body) }, { failureThreshold: 3, openMs: 30000 })
  } catch (e) {
    if (e && e.code === 'CIRCUIT_OPEN') return { error: 'openrouter circuit open' }
    return { error: 'openrouter request failed' }
  }
  if (!res.ok) {
    let errText = ''
    try { errText = await res.text() } catch {}
    if (DEBUG) try { console.log('[llm] openrouter error', { status: res.status, body: String(errText).slice(0, 300) }) } catch {}
    return { error: `openrouter http ${res.status}${errText ? `: ${String(errText).slice(0, 120)}` : ''}` }
  }
  const jr = await readJsonResponse(res, 'openrouter')
  if (jr.error) return { error: jr.error }
  const json = jr.json
  const choice = json && json.choices && json.choices[0]
  let text = ''
  if (choice && choice.message) {
    const c = choice.message
    if (typeof c.content === 'string' && c.content.trim()) text = c.content
    else if (c.reasoning != null) {
      if (typeof c.reasoning === 'string') text = c.reasoning
      else {
        try { text = JSON.stringify(c.reasoning) } catch { text = '' }
      }
    }
  }
  if (DEBUG) try { console.log('[llm] openrouter raw', String(text).slice(0, 300)) } catch {}
  if (DEBUG) try {
    console.log('[llm] openrouter output', {
      text_len: String(text).length,
      text_preview: String(text).slice(0, 300),
      usage: json.usage || null
    })
  } catch {}
  const out = parseOutput(text, input.series[input.series.length - 1].date, horizon)
  return { output: out, model: modelId, usage: json.usage || null }
}
async function callOpenAI(input, indicators, horizon, model, sysPrompt, opts = {}) {
  const apiKey = process.env.OPENAI_API_KEY || ''
  const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.2)
  const maxTokens = (() => {
    const n = Number(opts && opts.maxTokens)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return Number(process.env.OPENAI_MAX_TOKENS || 2048)
  })()
  const prompt = buildPrompt(indicators, horizon, sysPrompt)
  if (DEBUG) try {
    console.log('[llm] openai input', {
      model,
      horizon,
      ctx_days: input.series.length,
      temperature,
      max_tokens: maxTokens,
      system_len: (prompt.system || '').length,
      user_len: (prompt.user || '').length,
      user_preview: String(prompt.user || '').slice(0, 300)
    })
  } catch {}
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const body = {
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    temperature,
    max_tokens: maxTokens
  }
  if (LOG_PARAMS) try {
    console.log('[llm] openai request', {
      url: OPENAI_URL,
      headers: sanitizeHeaders(headers),
      body: { ...body, messages: messagesAsObjects(body.messages, LOG_PARAMS_FULL) }
    })
  } catch {}
  let res
  try {
    res = await breakerFetch('llm:openai', OPENAI_URL, { method: 'POST', headers, body: JSON.stringify(body) }, { failureThreshold: 3, openMs: 30000 })
  } catch (e) {
    if (e && e.code === 'CIRCUIT_OPEN') return { error: 'openai circuit open' }
    return { error: 'openai request failed' }
  }
  const jr = await readJsonResponse(res, 'openai')
  if (jr.error) return { error: jr.error }
  const json = jr.json
  const choice = json && json.choices && json.choices[0]
  const text = choice && choice.message && choice.message.content || ''
  if (DEBUG) try { console.log('[llm] openai raw', String(text).slice(0, 300)) } catch {}
  if (DEBUG) try {
    console.log('[llm] openai output', {
      text_len: String(text).length,
      text_preview: String(text).slice(0, 300),
      usage: json.usage || null
    })
  } catch {}
  const out = parseOutput(text, input.series[input.series.length - 1].date, horizon)
  return { output: out, model, usage: json.usage || null }
}

async function callGLM(input, indicators, horizon, model, sysPrompt, opts = {}) {
  const apiKey = process.env.GLM_API_KEY || ''
  if (!String(apiKey || '').trim()) return { error: 'glm api key missing' }
  const temperature = Number(process.env.GLM_TEMPERATURE || 0.2)
  const maxTokens = (() => {
    const n = Number(opts && opts.maxTokens)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return Number(process.env.GLM_MAX_TOKENS || 65536)
  })()
  const prompt = buildPrompt(indicators, horizon, sysPrompt)
  if (DEBUG) try {
    console.log('[llm] glm input', {
      model,
      horizon,
      ctx_days: input.series.length,
      temperature,
      max_tokens: maxTokens,
      system_len: (prompt.system || '').length,
      user_len: (prompt.user || '').length,
      user_preview: String(prompt.user || '').slice(0, 300)
    })
  } catch {}
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const body = {
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    temperature,
    max_tokens: maxTokens
  }
  if (LOG_PARAMS) try {
    console.log('[llm] glm request', {
      url: GLM_URL,
      headers: sanitizeHeaders(headers),
      body: { ...body, messages: messagesAsObjects(body.messages, LOG_PARAMS_FULL) }
    })
  } catch {}
  let res
  try {
    res = await breakerFetch('llm:glm', GLM_URL, { method: 'POST', headers, body: JSON.stringify(body) }, { failureThreshold: 3, openMs: 30000 })
  } catch (e) {
    if (e && e.code === 'CIRCUIT_OPEN') return { error: 'glm circuit open' }
    return { error: 'glm request failed' }
  }
  const jr = await readJsonResponse(res, 'glm')
  if (jr.error) return { error: jr.error }
  const json = jr.json
  const choice = json && json.choices && json.choices[0]
  const msg = choice && choice.message
  let text = ''
  if (msg) {
    const c = msg.content
    if (typeof c === 'string') text = c
    else if (Array.isArray(c)) text = c.map(x => (typeof x === 'string' ? x : (x?.text || ''))).join('')
    else text = String(c ?? '')
  } else if (typeof choice?.text === 'string') {
    text = choice.text
  }
  if (DEBUG) try { console.log('[llm] glm raw', String(text).slice(0, 300)) } catch {}
  if (DEBUG) try {
    console.log('[llm] glm output', {
      text_len: String(text).length,
      text_preview: String(text).slice(0, 300),
      usage: json.usage || null
    })
  } catch {}
  const out = parseOutput(stripCodeFences(text), input.series[input.series.length - 1].date, horizon)
  return { output: out, model, usage: json.usage || null }
}
async function callDeepseek(input, indicators, horizon, model, sysPrompt, opts = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY || ''
  const temperature = Number(process.env.DEEPSEEK_TEMPERATURE || 0.2)
  const maxTokens = (() => {
    const n = Number(opts && opts.maxTokens)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return Number(process.env.DEEPSEEK_MAX_TOKENS || 2048)
  })()
  const prompt = buildPrompt(indicators, horizon, sysPrompt)
  if (DEBUG) try {
    console.log('[llm] deepseek input', {
      model,
      horizon,
      ctx_days: input.series.length,
      temperature,
      max_tokens: maxTokens,
      system_len: (prompt.system || '').length,
      user_len: (prompt.user || '').length,
      user_preview: String(prompt.user || '').slice(0, 300)
    })
  } catch {}
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const body = {
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    temperature,
    max_tokens: maxTokens
  }
  if (LOG_PARAMS) try {
    console.log('[llm] deepseek request', {
      url: DEEPSEEK_URL,
      headers: sanitizeHeaders(headers),
      body: { ...body, messages: messagesAsObjects(body.messages, LOG_PARAMS_FULL) }
    })
  } catch {}
  let res
  try {
    res = await breakerFetch('llm:deepseek', DEEPSEEK_URL, { method: 'POST', headers, body: JSON.stringify(body) }, { failureThreshold: 3, openMs: 30000 })
  } catch (e) {
    if (e && e.code === 'CIRCUIT_OPEN') return { error: 'deepseek circuit open' }
    return { error: 'deepseek request failed' }
  }
  const jr = await readJsonResponse(res, 'deepseek')
  if (jr.error) return { error: jr.error }
  const json = jr.json
  const choice = json && json.choices && json.choices[0]
  const text = choice && choice.message && choice.message.content || ''
  if (DEBUG) try { console.log('[llm] deepseek raw', String(text).slice(0, 300)) } catch {}
  if (DEBUG) try {
    console.log('[llm] deepseek output', {
      text_len: String(text).length,
      text_preview: String(text).slice(0, 300),
      usage: json.usage || null
    })
  } catch {}
  const out = parseOutput(text, input.series[input.series.length - 1].date, horizon)
  return { output: out, model, usage: json.usage || null }
}

function calibrateForecast(out, input) {
  if (!Array.isArray(out) || !out.length) return out
  const last = input.series[input.series.length - 1].close
  const sigma = Math.max(0.005, input.summary.vol_std_20 || 0.01)
  const allow = Math.min(0.1, Math.max(0.02, 3 * sigma))
  const upLast = input.features.boll.up[input.features.boll.up.length - 1] || last * (1 + 2 * sigma)
  const dnLast = input.features.boll.dn[input.features.boll.dn.length - 1] || last * (1 - 2 * sigma)
  const sup = input.summary.support_60 || dnLast
  const res = input.summary.resistance_60 || upLast
  const regime = input.summary.regime
  const wTrend = regime === 'trending_up' ? 0.6 : regime === 'trending_down' ? 0.4 : 0.5
  const out2 = []
  let prev = last
  for (let i = 0; i < out.length; i++) {
    let target = Number(out[i].close)
    if (!isFinite(target)) target = prev
    let delta = target - prev
    const pct = delta / Math.max(1e-9, prev)
    if (pct > allow) delta = prev * allow
    if (pct < -allow) delta = -prev * allow
    let next = prev + delta
    if (next > res && regime !== 'trending_up') next = (next * wTrend + res * (1 - wTrend))
    if (next < sup && regime !== 'trending_down') next = (next * wTrend + sup * (1 - wTrend))
    if (next > upLast) next = (next + upLast) / 2
    if (next < dnLast) next = (next + dnLast) / 2
    out2.push({ date: out[i].date, close: Number(Math.max(0.01, next).toFixed(2)) })
    prev = out2[out2.length - 1].close
  }
  return out2
}

export function listModels() {
  return [
    { id: 'openrouter::openrouter/free', name: '自动', type: 'chat', enabled: true, maxTokens: 5120 },
    { id: 'openrouter::minimax/minimax-m2.5:free', name: 'Minimax 2.5', type: 'chat', enabled: true, maxTokens: 5120 },
    { id: 'openrouter::nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 nano', type: 'chat', enabled: true, maxTokens: 5120 },
    { id: 'openrouter::nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 super', type: 'chat', enabled: true, maxTokens: 5120 },
    { id: 'openrouter::arcee-ai/trinity-mini:free', name: 'Trinity mini', type: 'chat', enabled: true, maxTokens: 5120 },
    { id: 'openrouter::arcee-ai/trinity-large-preview:free', name: 'Trinity Large', type: 'chat', enabled: true, maxTokens: 5120 },
    { id: 'openrouter::liquid/lfm-2.5-1.2b-thinking:free', name: 'LFM 2.5', type: 'chat', enabled: true, maxTokens: 5120 },

    // { id: 'openai::gpt-4o-mini', name: 'OpenAI 4o mini', type: 'chat', enabled: true, maxTokens: 2048 },
    // { id: 'openai::gpt-4.1-mini', name: 'OpenAI 4.1 mini', type: 'chat', enabled: true, maxTokens: 2048 },

    // { id: 'deepseek::deepseek-chat', name: 'DeepSeek Chat', type: 'chat', enabled: true, maxTokens: 2048 },

    { id: 'glm::glm-4.7-flash', name: 'GLM Flash', type: 'chat', enabled: true, maxTokens: 65536 },
    { id: 'glm::glm-4.5-air', name: 'GLM Air', type: 'chat', enabled: true, maxTokens: 65536 },
    { id: 'glm::GLM-4-Flash', name: 'GLM-4', type: 'chat', enabled: true, maxTokens: 65536 },

    // { id: 'openrouter', name: 'Provider: OpenRouter', type: 'provider', enabled: true },
    // { id: 'openai', name: 'Provider: OpenAI', type: 'provider', enabled: true },
    // { id: 'deepseek', name: 'Provider: DeepSeek', type: 'provider', enabled: true },
    // { id: 'glm', name: 'Provider: GLM', type: 'provider', enabled: true }
  ]
}

function findModelFromList(modelId) {
  const id = String(modelId || '').trim()
  if (!id) return null
  const list = listModels()
  const exact = list.find(x => x && x.id === id) || null
  if (exact) return exact
  const raw = id.includes('::') ? id.split('::').slice(1).join('::') : id
  return list.find(x => x && typeof x.id === 'string' && (x.id === raw || x.id.endsWith(`::${raw}`))) || null
}

function pickMaxTokensFromModelList(modelId) {
  const id = String(modelId || '').trim()
  if (!id) return null
  const m = findModelFromList(id)
  const n = Number(m && m.maxTokens)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function pickModelNameFromModelList(modelId) {
  const id = String(modelId || '').trim()
  if (!id) return null
  const m = findModelFromList(id)
  const name = m && m.name
  if (!name) return null
  return String(name)
}

function friendlyModelName(modelId) {
  const original = String(modelId || '').trim()
  if (!original) return ''
  const mapped = pickModelNameFromModelList(original)
  if (mapped) return mapped
  const id = original.includes('::') ? original.split('::').slice(1).join('::') : original
  const last = id.includes('/') ? id.split('/').pop() : id
  const s = String(last || id).replace(/:free$/i, '').trim()
  return s || original
}

export async function runLlmPredict(body) {
  const candles = Array.isArray(body?.data?.candles) ? body.data.candles : []
  const symbol = (body?.params?.symbol) || ''
  const horizon = Number(body?.params?.horizon || process.env.PREDICT_HORIZON_DAYS || 20)
  const ctxDays = Number(process.env.CONTEXT_WINDOW_DAYS || 300)
  if (!candles.length) return { error: 'empty candles', status: 400 }
  const input = preprocess(candles, ctxDays, horizon)
  const lastDate = input.series[input.series.length - 1]?.date
  const ti = calculateTechnicalIndicators(candles)
  const baseTimestamp = (() => {
    const s = String(lastDate || '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`
    return new Date().toISOString()
  })()
  const indicators = {
    ...(symbol ? { ticker: String(symbol) } : {}),
    ...(ti && typeof ti === 'object' ? ti : {}),
    timestamp: baseTimestamp
  }
  const envProvider = process.env.LLM_PROVIDER || 'openrouter'
  const providerDefaults = (p) => {
    if (p === 'deepseek') return { model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', sysPrompt: process.env.DEEPSEEK_SYSTEM_PROMPT || '' }
    if (p === 'openai') return { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', sysPrompt: process.env.OPENAI_SYSTEM_PROMPT || '' }
    if (p === 'glm') return { model: process.env.GLM_MODEL || 'glm-4.7-flash', sysPrompt: process.env.GLM_SYSTEM_PROMPT || '' }
    return { model: process.env.OPENROUTER_MODEL || 'openrouter/free', sysPrompt: process.env.OPENROUTER_SYSTEM_PROMPT || '' }
  }
  let provider = envProvider
  let { model, sysPrompt } = providerDefaults(provider)
  let maxTokensOverride = null
  if (body?.params?.model != null) {
    const pm = body.params.model
    if (typeof pm === 'string') {
      const s = pm.trim()
      if (s === 'openrouter' || s === 'openai' || s === 'deepseek' || s === 'glm') {
        provider = s
        const d = providerDefaults(provider)
        model = d.model
        sysPrompt = d.sysPrompt
      } else if (s.includes('::')) {
        const parts = s.split('::')
        const p = String(parts[0] || '').trim()
        const m = parts.slice(1).join('::').trim()
        if (p === 'openrouter' || p === 'openai' || p === 'deepseek' || p === 'glm') {
          provider = p
          const d = providerDefaults(provider)
          model = m || d.model
          sysPrompt = d.sysPrompt
        } else {
          model = s
        }
      } else {
        model = s
      }
    } else if (pm && typeof pm === 'object') {
      const p = String(pm.provider || '').trim()
      if (p === 'openrouter' || p === 'openai' || p === 'deepseek' || p === 'glm') {
        provider = p
        const d = providerDefaults(provider)
        model = d.model
        sysPrompt = d.sysPrompt
      }
      const idOrModel = pm.id != null ? String(pm.id).trim() : (pm.model != null ? String(pm.model).trim() : '')
      if (idOrModel) {
        if (idOrModel.includes('::')) {
          const parts = idOrModel.split('::')
          const p2 = String(parts[0] || '').trim()
          const m2 = parts.slice(1).join('::').trim()
          if (p2 === 'openrouter' || p2 === 'openai' || p2 === 'deepseek' || p2 === 'glm') {
            provider = p2
            const d = providerDefaults(provider)
            model = m2 || d.model
            sysPrompt = d.sysPrompt
          } else {
            model = idOrModel
          }
        } else {
          model = idOrModel
        }
      }
      const n = Number(pm.maxTokens)
      if (Number.isFinite(n) && n > 0) maxTokensOverride = Math.floor(n)
    }
  }
  if (maxTokensOverride == null) maxTokensOverride = pickMaxTokensFromModelList(`${provider}::${model}`) ?? pickMaxTokensFromModelList(model)

  let r
  if (provider === 'openai') r = await callOpenAI(input, indicators, horizon, model, sysPrompt, { maxTokens: maxTokensOverride })
  else if (provider === 'deepseek') r = await callDeepseek(input, indicators, horizon, model, sysPrompt, { maxTokens: maxTokensOverride })
  else if (provider === 'glm') r = await callGLM(input, indicators, horizon, model, sysPrompt, { maxTokens: maxTokensOverride })
  else r = await callOpenRouter(input, indicators, horizon, model, sysPrompt, { maxTokens: maxTokensOverride })
  if (r && r.error) {
    const st = String(r.error).includes('circuit open') ? 503 : 502
    return { error: r.error, status: st }
  }
  const out = r.output || { forecast: [], explanation: [] }
  const forecast = calibrateForecast(out.forecast, input)
  const explanation = Array.isArray(out.explanation) ? out.explanation : []
  return { data: { forecast, provider: friendlyModelName(r?.model || model), explanation } }
}
