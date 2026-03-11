export const dynamic = 'force-dynamic'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const DEBUG = String(process.env.LLM_DEBUG || '').toLowerCase() === 'true'

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

function preprocess(candles, ctxDays, horizon) {
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
async function translateExplanation(provider, model, sysPrompt, explanation) {
  const system = (sysPrompt || '') + ' 将以下要点翻译为简洁中文要点。仅输出 JSON：{"explanation":["要点1","要点2",...]}。'
  const user = JSON.stringify({ explanation })
  const temperature = 0.1
  const maxTokens = 256
  if (provider === 'openai') {
    const headers = { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`, 'Content-Type': 'application/json' }
    const body = { model: model || (process.env.OPENAI_MODEL || 'gpt-4o-mini'), messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens }
    const res = await fetch(OPENAI_URL, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) return explanation
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content || ''
    return parseTranslation(text)
  } else if (provider === 'deepseek') {
    const headers = { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`, 'Content-Type': 'application/json' }
    const body = { model: model || (process.env.DEEPSEEK_MODEL || 'deepseek-chat'), messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens }
    const res = await fetch(DEEPSEEK_URL, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) return explanation
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
    const body = { model: model || (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'), messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens }
    const res = await fetch(OPENROUTER_URL, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) return explanation
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content || ''
    return parseTranslation(text)
  }
}

function buildPrompt(input, horizon, sysPrompt) {
  const header = [
    `Predict only the next ${horizon} trading days closing prices.`,
    `Output strictly JSON with keys "forecast" and "explanation":`,
    `{"forecast":[{"date":"YYYY-MM-DD","close":number},...],"explanation":["要点1","要点2",...]}.`,
    `Return exactly ${horizon} future trading days starting after last_date; do not include any historical items.`,
    `Skip weekends; base continuity from last_close.`,
  ].join(' ')
  const recent = input.series.slice(-120).map(s => ({ date: s.date, close: s.close }))
  const payload = {
    last_date: input.series[input.series.length - 1].date,
    last_close: input.series[input.series.length - 1].close,
    horizon,
    recent_closes: recent,
    summary: input.summary
  }
  return { system: sysPrompt || '', user: header + '\n' + JSON.stringify(payload) }
}

function parseOutput(text, lastDate, horizon) {
  let obj = null
  try { obj = JSON.parse(text) } catch { obj = null }
  if (obj && typeof obj === 'object') {
    const fc = Array.isArray(obj.forecast) ? obj.forecast.map(x => ({ date: x.date, close: Number(x.close) })) : []
    let exp = []
    if (Array.isArray(obj.explanation)) exp = obj.explanation.map(s => String(s)).filter(Boolean)
    else if (typeof obj.explanation === 'string') exp = String(obj.explanation).split(/\n+/).map(s => s.trim()).filter(Boolean)
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
    if (qs) explanation = qs.map(s => s.replace(/^"|"$/g, '')).filter(Boolean)
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

async function callOpenRouter(input, horizon, model, sysPrompt) {
  const apiKey = process.env.OPENROUTER_API_KEY || ''
  const referer = process.env.OPENROUTER_HTTP_REFERER || 'https://a-stock-log.vercel.app'
  const title = process.env.OPENROUTER_APP_TITLE || 'a-stock-log'
  const temperature = Number(process.env.OPENROUTER_TEMPERATURE || 0.2)
  const maxTokens = Number(process.env.OPENROUTER_MAX_TOKENS || 1024)
  const prompt = buildPrompt(input, horizon, sysPrompt)
  if (DEBUG) try {
    console.log('[llm] openrouter input', {
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
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(referer ? { 'HTTP-Referer': referer } : {}),
    ...(title ? { 'X-Title': title } : {})
  }
  const body = {
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    temperature,
    max_tokens: maxTokens
  }
  const res = await fetch(OPENROUTER_URL, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    let errText = ''
    try { errText = await res.text() } catch {}
    if (DEBUG) try { console.log('[llm] openrouter error', { status: res.status, body: String(errText).slice(0, 300) }) } catch {}
    return { error: `openrouter http ${res.status}${errText ? `: ${String(errText).slice(0, 120)}` : ''}` }
  }
  const json = await res.json()
  const choice = json && json.choices && json.choices[0]
  const text = choice && choice.message && choice.message.content || ''
  if (DEBUG) try { console.log('[llm] openrouter raw', String(text).slice(0, 300)) } catch {}
  if (DEBUG) try {
    console.log('[llm] openrouter output', {
      text_len: String(text).length,
      text_preview: String(text).slice(0, 300),
      usage: json.usage || null
    })
  } catch {}
  const out = parseOutput(text, input.series[input.series.length - 1].date, horizon)
  return { output: out, model: model, usage: json.usage || null }
}
async function callOpenAI(input, horizon, model, sysPrompt) {
  const apiKey = process.env.OPENAI_API_KEY || ''
  const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.2)
  const maxTokens = Number(process.env.OPENAI_MAX_TOKENS || 1024)
  const prompt = buildPrompt(input, horizon, sysPrompt)
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
  const res = await fetch(OPENAI_URL, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) return { error: `openai http ${res.status}` }
  const json = await res.json()
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
async function callDeepseek(input, horizon, model, sysPrompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY || ''
  const temperature = Number(process.env.DEEPSEEK_TEMPERATURE || 0.2)
  const maxTokens = Number(process.env.DEEPSEEK_MAX_TOKENS || 1024)
  const prompt = buildPrompt(input, horizon, sysPrompt)
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
  const res = await fetch(DEEPSEEK_URL, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) return { error: `deepseek http ${res.status}` }
  const json = await res.json()
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

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

export async function POST(request) {
  try {
    const t0 = Date.now()
    const body = await request.json()
    const action = (body && body.action) || 'predict'
    if (action === 'predict') {
      const candles = Array.isArray(body?.data?.candles) ? body.data.candles : []
      const symbol = (body?.params?.symbol) || ''
      const horizon = Number(body?.params?.horizon || process.env.PREDICT_HORIZON_DAYS || 20)
      const ctxDays = Number(process.env.CONTEXT_WINDOW_DAYS || 300)
      if (!candles.length) return ok({ code: -2, msg: 'empty candles' }, 400)
      const input = preprocess(candles, ctxDays, horizon)
      const provider = process.env.LLM_PROVIDER || 'openrouter'
      let model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
      let sysPrompt = process.env.OPENROUTER_SYSTEM_PROMPT || ''
      if (provider === 'deepseek') { model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'; sysPrompt = process.env.DEEPSEEK_SYSTEM_PROMPT || '' }
      if (provider === 'openai') { model = process.env.OPENAI_MODEL || 'gpt-4o-mini'; sysPrompt = process.env.OPENAI_SYSTEM_PROMPT || '' }
      if (body?.params?.model) model = body.params.model
      try { console.log('[llm] predict start', { symbol, provider, model, horizon, ctx_days: input.series.length }) } catch {}
      let r
      if (provider === 'openai') r = await callOpenAI(input, horizon, model, sysPrompt)
      else if (provider === 'deepseek') r = await callDeepseek(input, horizon, model, sysPrompt)
      else r = await callOpenRouter(input, horizon, model, sysPrompt)
      if (r && r.error) return ok({ code: -3, msg: r.error }, 502)
      const out = r.output || { forecast: [], explanation: [] }
      const forecast = calibrateForecast(out.forecast, input)
      let explanation = Array.isArray(out.explanation) ? out.explanation : []
      if (needZh(explanation) && explanation.length) {
        const t2 = Date.now()
        try { console.log('[llm] translate start', { provider, model, count: explanation.length }) } catch {}
        const zh = await translateExplanation(provider, model, sysPrompt, explanation).catch(() => explanation)
        if (Array.isArray(zh) && zh.length) explanation = zh
        const t3 = Date.now()
        try { console.log('[llm] translate done', { before: out.explanation.length, after: explanation.length, latency_ms: t3 - t2 }) } catch {}
      }
      const t1 = Date.now()
      try {
        console.log('[llm] predict done', {
          provider: r.model,
          forecast_count: forecast.length,
          explanation_count: explanation.length,
          latency_ms: t1 - t0
        })
      } catch {}
      return ok({ code: 0, data: { forecast, provider: r.model, explanation } })
    }
    if (action === 'metrics') {
      return ok({ code: 0, msg: 'ok' })
    }
    if (action === 'models') {
      const models = [
        { id: 'arcee-ai/trinity-large-preview:free', name: 'Arcee AI: Trinity', type: 'chat', enabled: true }
      ]
      return ok({ code: 0, data: { models } })
    }
    if (action === 'backtest') {
      return ok({ code: 0, msg: 'not_implemented' })
    }
    return ok({ code: -1, msg: 'unknown action' }, 400)
  } catch (e) {
    return ok({ code: 500, msg: e?.message || String(e) }, 500)
  }
}

export async function GET(request) {
  const url = new URL(request.url)
  const action = (url.searchParams.get('action') || '').toLowerCase()
  if (action === 'models') {
    const models = [
     { id: 'arcee-ai/trinity-large-preview:free', name: 'Arcee AI: Trinity Large Preview', type: 'chat', enabled: true },
     { id: 'stepfun/step-3.5-flash:free', name: 'StepFun: Step-3.5-Flash', type: 'chat', enabled: true }
    ]
    return ok({ code: 0, data: { models } })
  }
  return ok({ code: -1, msg: 'use POST with action' }, 400)
}
