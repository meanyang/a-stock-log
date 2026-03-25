'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'

function ma(values, n) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= n) sum -= values[i - n]
    if (i >= n - 1) out[i] = Number((sum / n).toFixed(2))
  }
  return out
}
function ema(values, n) {
  const out = []
  const a = 2 / (n + 1)
  let prev = values[0]
  out.push(prev)
  for (let i = 1; i < values.length; i++) {
    const v = a * values[i] + (1 - a) * prev
    out.push(v)
    prev = v
  }
  return out
}
function macd(values, s = 12, l = 26, m = 9) {
  const emaS = ema(values, s)
  const emaL = ema(values, l)
  const dif = emaS.map((v, i) => Number((v - emaL[i]).toFixed(3)))
  const dea = ema(dif, m).map(v => Number(v.toFixed(3)))
  const hist = dif.map((v, i) => Number((v - dea[i]).toFixed(3)))
  return { dif, dea, hist }
}
function boll(values, n = 20, k = 2) {
  const mb = ma(values, n)
  const up = new Array(values.length).fill(null)
  const dn = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    if (i >= n - 1) {
      let sum = 0
      for (let j = i - n + 1; j <= i; j++) sum += values[j]
      const mean = sum / n
      let ss = 0
      for (let j = i - n + 1; j <= i; j++) {
        const diff = values[j] - mean
        ss += diff * diff
      }
      const md = Math.sqrt(ss / n)
      up[i] = Number((mean + k * md).toFixed(2))
      dn[i] = Number((mean - k * md).toFixed(2))
    }
  }
  return { mb, up, dn }
}
function nextTradeDay(d) {
  const nd = new Date(d.getTime())
  do { nd.setDate(nd.getDate() + 1) } while (nd.getDay() === 0 || nd.getDay() === 6)
  return nd
}
function fmtDateDash(d) {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function StockPredictor({ variant = 'neo' }) {
  const [symbol, setSymbol] = useState('')
  const [primary, setPrimary] = useState('')
  const [candles, setCandles] = useState([]) // [{date, open, high, low, close, vol}]
  const [forecastLLM, setForecastLLM] = useState([])
  const [forecastLocal, setForecastLocal] = useState([])
  const [analysis, setAnalysis] = useState([])
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [range, setRange] = useState('3M') // '3M' | '6M' | '1Y' | 'RESET'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [llmLatency, setLlmLatency] = useState(0)
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const [isMobile, setIsMobile] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [selectedTsCode, setSelectedTsCode] = useState('')
  const suggestTimer = useRef(null)
  const stepDefs = useMemo(() => ([
    { key: 'fetch', label: '拉取日线数据' },
    { key: 'fetch.req', label: '  • 请求已发送' },
    { key: 'fetch.srv', label: '  • 服务器查询' },
    { key: 'fetch.rx', label: '  • 数据接收' },
    { key: 'ind', label: '计算技术指标' },
    { key: 'ind.ma', label: '  • 移动均线' },
    { key: 'ind.boll', label: '  • 布林带' },
    { key: 'ind.macd', label: '  • MACD' },
    { key: 'prompt', label: '构建预测提示' },
    { key: 'prompt.ctx', label: '  • 整理最近收盘' },
    { key: 'prompt.tpl', label: '  • 生成提示模板' },
    { key: 'llm', label: '调用模型' },
    { key: 'llm.queue', label: '  • 排队中' },
    { key: 'llm.run', label: '  • 生成中' },
    { key: 'parse', label: '解析预测结果' },
    { key: 'cal', label: '校准波动与支撑阻力' },
    { key: 'draw', label: '准备绘图' },
  ]), [])
  const [steps, setSteps] = useState(() => stepDefs.map(s => ({ key: s.key, label: s.label, state: 'pending' })))
  useEffect(() => { setSteps(stepDefs.map(s => ({ key: s.key, label: s.label, state: 'pending' }))) }, [stepDefs])
  function resetSteps() { setSteps(stepDefs.map(s => ({ key: s.key, label: s.label, state: 'pending' }))) }
  function setKeyState(key, state) { setSteps(prev => prev.map(x => (x.key === key ? { ...x, state } : x))) }
  function sleep(ms) { return new Promise(res => setTimeout(res, ms)) }

  useEffect(() => {
    async function loadModels() {
      try {
        const r = await fetch('/api/llm?action=models')
        const j = await r.json()
        const list = (j && j.data && Array.isArray(j.data.models)) ? j.data.models.filter(m => m.enabled !== false) : []
        setModels(list)
        const saved = typeof window !== 'undefined' ? window.localStorage.getItem('selectedModel') : ''
        const id = saved && list.find(m => m.id === saved) ? saved : (list[0]?.id || '')
        setSelectedModel(id)
      } catch (e) {
        setModels([])
      }
    }
    loadModels()
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640)
    onResize()
    if (typeof window !== 'undefined') window.addEventListener('resize', onResize)
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('resize', onResize)
    }
  }, [])

  const viewCount = useMemo(() => {
    if (range === '3M') return 61
    if (range === '6M') return 122
    if (range === '1Y') return 245
    return Math.max(120, candles.length)
  }, [range, candles.length])

  const labels = useMemo(() => {
    const histDates = candles.map(c => c.date)
    const fDates = [...new Set([...(forecastLLM || []).map(f => f.date), ...(forecastLocal || []).map(f => f.date)])]
    const allDates = Array.from(new Set([...histDates, ...fDates])).sort()
    const start = Math.max(0, allDates.length - viewCount)
    return allDates.slice(start)
  }, [candles, forecastLLM, forecastLocal, viewCount])

  const closes = useMemo(() => candles.map(c => c.close), [candles])
  const ma5 = useMemo(() => ma(closes, 5), [closes])
  const ma10 = useMemo(() => ma(closes, 10), [closes])
  const ma20 = useMemo(() => ma(closes, 20), [closes])
  const bollBand = useMemo(() => boll(closes, 20, 2), [closes])
  const macdObj = useMemo(() => macd(closes, 12, 26, 9), [closes])

  const historyValues = useMemo(() => {
    if (!candles.length) return []
    const lastHistDate = candles[candles.length - 1]?.date
    const map = new Map(candles.map(c => [c.date, c.close]))
    return labels.map(d => (d <= lastHistDate && map.has(d) ? map.get(d) : null))
  }, [candles, labels])

  const forecastValuesLLM = useMemo(() => {
    const arr = new Array(labels.length).fill(null)
    if (!candles.length) return arr
    const lastHistDate = candles[candles.length - 1]?.date
    const lastHistClose = candles[candles.length - 1]?.close
    const idxLast = labels.indexOf(lastHistDate)
    if (idxLast >= 0 && lastHistClose != null) arr[idxLast] = lastHistClose
    const idxMap = new Map(labels.map((d, i) => [d, i]))
    for (const p of forecastLLM || []) {
      const i = idxMap.get(p.date)
      if (i != null) arr[i] = p.close
    }
    return arr
  }, [labels, candles, forecastLLM])
  const forecastValuesLocal = useMemo(() => {
    const arr = new Array(labels.length).fill(null)
    if (!candles.length) return arr
    const lastHistDate = candles[candles.length - 1]?.date
    const lastHistClose = candles[candles.length - 1]?.close
    const idxLast = labels.indexOf(lastHistDate)
    if (idxLast >= 0 && lastHistClose != null) arr[idxLast] = lastHistClose
    const idxMap = new Map(labels.map((d, i) => [d, i]))
    for (const p of forecastLocal || []) {
      const i = idxMap.get(p.date)
      if (i != null) arr[i] = p.close
    }
    return arr
  }, [labels, candles, forecastLocal])

  function buildChartConfig() {
    const datasets = [
      {
        label: '历史收盘',
        data: historyValues,
        borderColor: 'rgba(100,116,139,0.9)',
        backgroundColor: 'rgba(100,116,139,0.2)',
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 0
      },
      ...(forecastLLM && forecastLLM.length ? [{
        label: '预测（大模型）',
        data: forecastValuesLLM,
        borderColor: 'rgba(234,88,12,0.95)',
        backgroundColor: 'rgba(251,146,60,0.25)',
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 0
      }] : []),
      ...(forecastLocal && forecastLocal.length ? [{
        label: '预测（本地模型）',
        data: forecastValuesLocal,
        borderColor: 'rgba(59,130,246,0.95)',
        backgroundColor: 'rgba(59,130,246,0.25)',
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 0
      }] : [])
    ]
    return {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
          tooltip: { intersect: false, mode: 'index' }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 10 } },
          y: { beginAtZero: false }
        }
      }
    }
  }

  function sliceToLabels(arr) {
    const totalLen = candles.length + ((forecastLLM?.length || 0) + (forecastLocal?.length || 0))
    const start = Math.max(0, totalLen - labels.length)
    const histPartLen = Math.max(0, labels.length - ((forecastLLM?.length || 0) + (forecastLocal?.length || 0)))
    const slicedHist = arr.slice(-histPartLen)
    const pad = new Array(labels.length - slicedHist.length).fill(null)
    return [...pad, ...slicedHist]
  }

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }
    if (!candles.length || (!((forecastLLM && forecastLLM.length) || (forecastLocal && forecastLocal.length)))) return
    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, buildChartConfig())
    return () => {
      if (chartRef.current) chartRef.current.destroy()
    }
  }, [candles, forecastLLM, forecastLocal, labels])

  function buildLocalAnalysis(candlesArr, maObj, forecastArr) {
    const pts = []
    const last = candlesArr[candlesArr.length - 1] || {}
    const lastClose = Number(last.close || 0)
    const { ma5, ma10, ma20, macd, boll } = maObj
    const nzLast = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) { if (typeof arr[i] === 'number' && !isNaN(arr[i])) return arr[i] }
      return null
    }
    const slopePct = (arr, win) => {
      let idx = arr.length - 1
      while (idx >= 0 && (arr[idx] == null || isNaN(arr[idx]))) idx--
      if (idx < win) return null
      const a = arr[idx - win]
      const b = arr[idx]
      if (a == null || isNaN(a) || b == null || isNaN(b) || a === 0) return null
      return (b - a) / a
    }
    const fmtPct = (v) => `${(v * 100).toFixed(2)}%`
    const ma20Slope = slopePct(ma20, 20)
    if (ma20Slope != null) pts.push(`中期趋势：MA20 ${ma20Slope >= 0 ? '向上' : '向下'}，近20日斜率 ${fmtPct(Math.abs(ma20Slope))}`)
    const lastM5 = nzLast(ma5), lastM10 = nzLast(ma10)
    if (lastM5 != null && lastM10 != null) {
      let cross = ''
      for (let i = ma5.length - 1; i > Math.max(0, ma5.length - 10); i--) {
        const a1 = ma5[i], b1 = ma10[i], a0 = ma5[i - 1], b0 = ma10[i - 1]
        if (a1 != null && b1 != null && a0 != null && b0 != null) {
          if (a1 >= b1 && a0 < b0) { cross = '短期均线金叉'; break }
          if (a1 <= b1 && a0 > b0) { cross = '短期均线死叉'; break }
        }
      }
      if (cross) pts.push(`均线：${cross}（MA5 与 MA10）`)
      else pts.push(`均线：MA5 ${lastM5 >= lastM10 ? '在' : '在'}MA10${lastM5 >= lastM10 ? '上方' : '下方'}`)
    }
    const dif = macd.dif || [], dea = macd.dea || [], hist = macd.hist || []
    const lastDif = nzLast(dif), lastDea = nzLast(dea)
    if (lastDif != null && lastDea != null) {
      pts.push(`MACD：DIF ${lastDif >= lastDea ? '在' : '在'}DEA${lastDif >= lastDea ? '上方' : '下方'}，动能${lastDif >= lastDea ? '偏强' : '偏弱'}`)
    }
    let inc = 0
    for (let i = hist.length - 3; i < hist.length; i++) {
      if (i > 0 && hist[i] != null && hist[i - 1] != null && Math.abs(hist[i]) > Math.abs(hist[i - 1])) inc++
    }
    if (inc >= 2) pts.push('MACD柱状图连续放大，趋势延续概率提升')
    const up = boll.up || [], dn = boll.dn || [], mb = boll.mb || []
    const lastUp = nzLast(up), lastDn = nzLast(dn), lastMb = nzLast(mb)
    if (lastUp != null && lastDn != null && lastMb != null && lastMb !== 0) {
      const width = (lastUp - lastDn) / lastMb
      pts.push(`布林：带宽${width > 0.1 ? '扩大' : '收敛'}，波动性${width > 0.1 ? '提升' : '降低'}`)
      if (lastClose && lastUp && lastDn) {
        if (lastClose >= lastUp) pts.push('价格触及上轨，短线有回落或加速风险')
        else if (lastClose <= lastDn) pts.push('价格触及下轨，短线易反弹或延续弱势')
        else if (lastClose >= lastMb) pts.push('价格位于中轨上方，偏强运行')
        else pts.push('价格位于中轨下方，偏弱运行')
      }
    }
    if (candlesArr.length >= 20) {
      const v5 = candlesArr.slice(-5).reduce((s, c) => s + (Number(c.vol || 0)), 0) / 5
      const v20 = candlesArr.slice(-20).reduce((s, c) => s + (Number(c.vol || 0)), 0) / 20
      if (v20 > 0) {
        const ratio = (v5 - v20) / v20
        pts.push(`量能：近5日均量较20日${ratio >= 0 ? '放大' : '萎缩'} ${fmtPct(Math.abs(ratio))}`)
      }
    }
    if (Array.isArray(forecastArr) && forecastArr.length && lastClose) {
      const firstF = forecastArr[0].close
      const lastF = forecastArr[forecastArr.length - 1].close
      const totalChg = (lastF - lastClose) / lastClose
      const pathChg = (lastF - firstF) / (firstF || lastF)
      pts.push(`预测：末日相对当前${totalChg >= 0 ? '上涨' : '下跌'} ${fmtPct(Math.abs(totalChg))}`)
      if (forecastArr.length > 1) {
        pts.push(`预测路径：整体${pathChg >= 0 ? '向上' : '向下'}，波动${Math.abs(pathChg) < 0.01 ? '较小' : '较明显'}`)
      }
    }
    return pts
  }

  async function fetchDaily(input) {
    const today = new Date()
    const daySpan = range === '3M' ? 100 : range === '6M' ? 200 : 400
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * daySpan)
    const start_date = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, '0')}${String(start.getDate()).padStart(2, '0')}`
    const end_date = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    const raw = String(input || '').trim()
    if (!raw) throw new Error('请输入股票代码或名称')
    const upper = raw.toUpperCase()
    let code = ''
    if (/^\d{6}\.(SH|SZ|BJ)$/.test(upper)) {
      code = upper
    } else if (/^\d{6}$/.test(upper)) {
      if (upper.startsWith('6')) code = `${upper}.SH`
      else if (upper.startsWith('4') || upper.startsWith('8')) code = `${upper}.BJ`
      else code = `${upper}.SZ`
    } else {
      const r = await fetch(`/api/stocks/search?query=${encodeURIComponent(raw)}&limit=10`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`信息接口失败：${r.status}`)
      const j = await r.json()
      const list = j && j.data && Array.isArray(j.data.list) ? j.data.list : []
      if (!list.length) throw new Error('未找到该股票，请从下拉列表选择')
      if (list.length > 1) {
        setSuggestions(list)
        setShowSuggest(true)
        throw new Error('匹配到多个股票，请从下拉列表选择')
      }
      code = list[0].ts_code
    }
    const res = await fetch(`/api/stocks/daily?input=${encodeURIComponent(code)}&start_date=${start_date}&end_date=${end_date}`)
    if (!res.ok) throw new Error(`日线接口失败：${res.status}`)
    const json = await res.json()
    if (json.code !== 0) throw new Error(json.msg || '日线接口返回错误')
    const rows = json.data.rows || []
    const arr = rows.map(r => ({
      date: `${r.date.slice(0,4)}-${r.date.slice(4,6)}-${r.date.slice(6,8)}`,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      vol: Number(r.vol)
    }))
    return { ts_code: json.data.ts_code, candles: arr }
  }

  async function predictLLM(candlesArr, code) {
    const t0 = Date.now()
    const body = {
      action: 'predict',
      data: { candles: candlesArr },
      params: { symbol: code, horizon: 20, model: selectedModel || '' }
    }
    try {
      console.log('[Web] LLM input', {
        symbol: code,
        model: selectedModel || '',
        horizon: 20,
        candles_len: candlesArr.length,
        last_close: candlesArr[candlesArr.length - 1]?.close,
        body_preview: JSON.stringify(body).slice(0, 300)
      })
    } catch {}
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const t1 = Date.now()
      try { console.log('[Web] LLM predict http error', { symbol: code, model: selectedModel, status: res.status, latency_ms: t1 - t0 }) } catch {}
      setLlmLatency(t1 - t0)
      return null
    }
    const json = await res.json()
    const t1 = Date.now()
    if (!json || json.code !== 0) {
      try { console.log('[Web] LLM predict nonzero', { symbol: code, model: selectedModel, code: json?.code, msg: json?.msg, latency_ms: t1 - t0 }) } catch {}
      setLlmLatency(t1 - t0)
      return null
    }
    const d = json.data || {}
    const arr = Array.isArray(d.forecast) ? d.forecast.map(x => ({ date: x.date, close: Number(x.close) })) : []
    const exp = Array.isArray(d.explanation) ? d.explanation.slice(0, 12) : []
    try {
      console.log('[Web] LLM output', {
        symbol: code,
        provider: d.provider,
        model: selectedModel,
        forecast_len: arr.length,
        explanation_len: exp.length,
        first: arr[0] || null,
        last: arr[arr.length - 1] || null,
        exp_preview: exp.slice(0, 3)
      })
    } catch {}
    try { console.log('[Web] LLM predict ok', { symbol: code, provider: d.provider, model: selectedModel, forecast_len: arr.length, explanation_len: exp.length, latency_ms: t1 - t0 }) } catch {}
    setLlmLatency(t1 - t0)
    return { forecast: arr, explanation: exp }
  }

  function predictByIndicators(candlesArr, { ma20, macd, boll }, days) {
    if (!candlesArr.length) return []
    const out = []
    let cur = new Date(candlesArr[candlesArr.length - 1].date)
    let prev = candlesArr[candlesArr.length - 1].close
    const slopeMA = (() => {
      const w = 10
      const i2 = ma20.length - 1, i1 = Math.max(0, i2 - w)
      const v2 = ma20[i2] || prev
      const v1 = ma20[i1] || prev
      return (v2 - v1) / Math.max(1, w)
    })()
    const recentHist = macd && macd.hist && macd.hist[macd.hist.length - 1] ? macd.hist[macd.hist.length - 1] : 0
    const band = (boll && boll.up && boll.dn) ? { up: boll.up[boll.up.length - 1], dn: boll.dn[boll.dn.length - 1] } : { up: null, dn: null }
    for (let i = 0; i < days; i++) {
      cur = nextTradeDay(cur)
      const bias = slopeMA * 0.6 + (recentHist || 0) * 0.2
      const noise = (Math.random() - 0.5) * 0.4
      let next = prev * (1 + (bias / Math.max(1, prev)) + noise / 100)
      if (band.up != null && next > band.up) next = (next * 0.7 + band.up * 0.3)
      if (band.dn != null && next < band.dn) next = (next * 0.7 + band.dn * 0.3)
      next = Math.max(0.01, next)
      out.push({ date: fmtDateDash(cur), close: Number(next.toFixed(2)) })
      prev = next
    }
    return out
  }

  async function fetchSuggest(q) {
    const s = String(q || '').trim()
    if (!s) {
      setSuggestions([])
      setShowSuggest(false)
      return
    }
    try {
      const res = await fetch(`/api/stocks/search?query=${encodeURIComponent(s)}&limit=20`, { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      const list = j && j.data && Array.isArray(j.data.list) ? j.data.list : []
      setSuggestions(list)
      setShowSuggest(list.length > 0)
    } catch {
      setSuggestions([])
      setShowSuggest(false)
    }
  }

  function onChangeSymbol(e) {
    const v = e.target.value
    setSymbol(v)
    setSelectedTsCode('')
    if (suggestTimer.current) {
      clearTimeout(suggestTimer.current)
      suggestTimer.current = null
    }
    suggestTimer.current = setTimeout(() => {
      fetchSuggest(v)
    }, 180)
  }

  function onPickSuggestion(item) {
    setSymbol(item.name || '')
    setSelectedTsCode(item.ts_code || `${item.symbol}.${item.exchange_code}`)
    setShowSuggest(false)
  }

  async function onSearch(e) {
    e.preventDefault()
    const s = (selectedTsCode || symbol).trim()
    if (!s) return
    setLoading(true)
    resetSteps()
    setKeyState('fetch', 'active')
    setKeyState('fetch.req', 'active')
    await sleep(250)
    setKeyState('fetch.req', 'done')
    setKeyState('fetch.srv', 'active')
    setError('')
    setLlmLatency(0)
    try {
      const { ts_code, candles: arr } = await fetchDaily(s)
      setKeyState('fetch.srv', 'done')
      setKeyState('fetch.rx', 'active')
      await sleep(150)
      setKeyState('fetch.rx', 'done')
      setKeyState('fetch', 'done')
      setKeyState('ind', 'active')
      setKeyState('ind.ma', 'active')
      setPrimary(ts_code)
      setCandles(arr)
      const closesArr = arr.map(c => c.close)
      const ma5_ = ma(closesArr, 5)
      const ma10_ = ma(closesArr, 10)
      const ma20_ = ma(closesArr, 20)
      setKeyState('ind.ma', 'done')
      setKeyState('ind.boll', 'active')
      const boll_ = boll(closesArr, 20, 2)
      setKeyState('ind.boll', 'done')
      setKeyState('ind.macd', 'active')
      const macd_ = macd(closesArr, 12, 26, 9)
      setKeyState('ind.macd', 'done')
      setKeyState('ind', 'done')
      setKeyState('prompt', 'active')
      setKeyState('prompt.ctx', 'active')
      await sleep(180)
      setKeyState('prompt.ctx', 'done')
      setKeyState('prompt.tpl', 'active')
      await sleep(180)
      setKeyState('prompt.tpl', 'done')
      setKeyState('prompt', 'done')
      setKeyState('llm', 'active')
      setKeyState('llm.queue', 'active')
      await sleep(300)
      setKeyState('llm.queue', 'done')
      setKeyState('llm.run', 'active')
      const llm = await predictLLM(arr, ts_code).catch(() => null)
      setKeyState('llm.run', 'done')
      setKeyState('llm', 'done')
      setKeyState('parse', 'active')
      let fc = []
      let al = []
      if (llm && Array.isArray(llm.forecast) && llm.forecast.length) {
        fc = llm.forecast
      } else {
        fc = predictByIndicators(arr, { ma20: ma20_, macd: macd_, boll: boll_ }, 20)
      }
      const fcLocal = predictByIndicators(arr, { ma20: ma20_, macd: macd_, boll: boll_ }, 20)
      if (llm && Array.isArray(llm.explanation) && llm.explanation.length) {
        al = llm.explanation
      } else {
        al = buildLocalAnalysis(arr, { ma5: ma5_, ma10: ma10_, ma20: ma20_, macd: macd_, boll: boll_ }, fc)
      }
      setKeyState('parse', 'done')
      setKeyState('cal', 'active')
      await sleep(120)
      setKeyState('cal', 'done')
      setKeyState('draw', 'active')
      if (llm && Array.isArray(llm.forecast) && llm.forecast.length) {
        setForecastLLM(fc)
        setForecastLocal([])
      } else {
        setForecastLLM([])
        setForecastLocal(fcLocal || [])
      }
      setAnalysis(al)
      setKeyState('draw', 'done')
    } catch (err) {
      setError(err.message || '请求失败')
      setCandles([])
      setForecastLLM([])
      setForecastLocal([])
      setAnalysis([])
    } finally {
      setLoading(false)
    }
  }

  function onChangeModel(e) {
    const id = e.target.value
    setSelectedModel(id)
    try { if (typeof window !== 'undefined') window.localStorage.setItem('selectedModel', id) } catch {}
  }

  if (variant === 'classic') {
    return (
      <div className="not-prose" style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>股票走势预测</h2>
        <form
          onSubmit={onSearch}
          style={{ display: 'flex', gap: 8, marginBottom: 12, flexDirection: isMobile ? 'column' : 'row' }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              value={symbol}
              onChange={onChangeSymbol}
              onFocus={() => suggestions.length && setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder="输入股票代码或名称"
              aria-label="股票代码或名称"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg)' }}
            />
            {showSuggest && (
              <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
                {suggestions.map((s, idx) => (
                  <div
                    key={`${s.ts_code}-${idx}`}
                    onMouseDown={() => onPickSuggestion(s)}
                    style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--accents-2)' }}
                  >
                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{s.ts_code}</span>
                    <span style={{ marginLeft: 8 }}>{s.name}</span>
                    {!!s.board && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--accents-5)' }}>{s.board}</span>}
                  </div>
                ))}
                {!suggestions.length && <div style={{ padding: '8px 10px', color: 'var(--accents-5)' }}>无匹配结果</div>}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '8px 14px', borderRadius: 8, width: isMobile ? '100%' : undefined, border: '1px solid var(--color-border)' }}
          >
            {loading ? '预测中…' : '开始预测'}
          </button>
        </form>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <label style={{ color: 'var(--color-muted)' }}>选择AI模型</label>
          <select value={selectedModel} onChange={onChangeModel} style={{ padding: 6, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            {models.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
          </select>
          <label style={{ color: 'var(--color-muted)', marginLeft: 12 }}>数据时长</label>
          <select value={range} onChange={e => setRange(e.target.value)} style={{ padding: 6, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <option value="3M">近3月</option>
            <option value="6M">近半年</option>
            <option value="1Y">近一年</option>
          </select>
        </div>
        {error && <div style={{ color: 'var(--red-500)', marginBottom: 8 }}>错误：{error}</div>}
        <div style={{ position: 'relative', width: '100%', height: 'min(480px, max(220px, 60vw))' }}>
          <canvas ref={canvasRef} />
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.55)' }}>
              <div style={{ width: '86%', maxWidth: 560, border: '1px solid var(--color-border)', borderRadius: 12, padding: 16, background: 'rgba(2,6,23,0.8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--cyan-500)', animation: 'pulse 1s infinite' }} />
                  <div style={{ color: 'var(--accents-6)', fontSize: 14 }}>预测中…</div>
                </div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: 'var(--accents-6)', lineHeight: 1.6 }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ opacity: s.state === 'pending' ? 0.3 : 1 }}>
                      {s.state === 'done' ? '✓' : s.state === 'active' ? '⏳' : '•'} {s.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {!!llmLatency && (
          <div style={{ marginTop: 8, color: 'var(--accents-6)', fontSize: 12 }}>
            耗时：{llmLatency}ms
          </div>
        )}
        {!!analysis.length && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6, color: 'var(--accents-6)' }}>预测依据与分析</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {analysis.map((a, i) => <li key={i} style={{ marginBottom: 2 }}>{a}</li>)}
            </ul>
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--accents-5)', marginTop: 8 }}>
          免责声明：该预测仅用于学习与参考，不构成任何投资建议。股市有风险，投资需谨慎。
        </p>
      </div>
    )
  }

  return (
    <div className="not-prose rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 shadow-lg backdrop-blur md:p-6">
      <h2 className="mt-0 text-lg font-semibold text-slate-100 md:text-xl">股票走势预测</h2>
      <form onSubmit={onSearch} className="mb-3 flex flex-col gap-2 sm:flex-row md:mb-4">
        <div className="relative w-full sm:flex-1">
          <input
            type="text"
            value={symbol}
            onChange={onChangeSymbol}
            onFocus={() => suggestions.length && setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            placeholder="输入股票代码或名称"
            aria-label="股票代码或名称"
            className="w-full rounded-lg border border-cyan-400/40 bg-slate-950/70 px-3 py-2 text-slate-100 placeholder:text-slate-400 outline-none"
          />
          {showSuggest && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/95 shadow-lg">
              {suggestions.map((s, idx) => (
                <div
                  key={`${s.ts_code}-${idx}`}
                  onMouseDown={() => onPickSuggestion(s)}
                  className="cursor-pointer border-b border-slate-800 px-3 py-2 hover:bg-slate-800/60"
                >
                  <span className="font-mono text-slate-100">{s.ts_code}</span>
                  <span className="ml-2 text-slate-200">{s.name}</span>
                  {!!s.board && <span className="ml-2 text-xs text-slate-400">{s.board}</span>}
                </div>
              ))}
              {!suggestions.length && <div className="px-3 py-2 text-slate-400">无匹配结果</div>}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg border border-violet-500/50 bg-gradient-to-r from-cyan-500/20 to-violet-500/20 px-4 py-2 text-slate-100 transition hover:-translate-y-0.5 hover:shadow-lg sm:w-auto"
        >
          {loading ? '预测中…' : '开始预测'}
        </button>
      </form>
      <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center md:mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">选择预测模型</span>
          <select
            value={selectedModel}
            onChange={onChangeModel}
            className="rounded-md border border-slate-600 bg-slate-950/70 px-2 py-1 text-sm text-slate-100"
          >
            {models.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
          </select>
        </div>
        <div className="ml-0 flex items-center gap-2 sm:ml-auto">
          <span className="text-sm text-slate-400">数据时长</span>
          <select
            value={range}
            onChange={e => setRange(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-950/70 px-2 py-1 text-sm text-slate-100"
          >
            <option value="3M">近3月</option>
            <option value="6M">近半年</option>
            <option value="1Y">近一年</option>
          </select>
        </div>
      </div>
      {error && <div className="mb-2 text-sm text-red-400 md:mb-3">错误：{error}</div>}
      <div className="relative w-full h-[220px] sm:h-[320px] lg:h-[480px]">
        <canvas ref={canvasRef} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
            <div className="w-[86%] max-w-[560px] rounded-xl border border-slate-700 bg-slate-950/80 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                <span className="text-sm text-slate-400">预测中…</span>
              </div>
              <div className="font-mono text-[13px] leading-relaxed text-slate-400">
                {steps.map((s, i) => (
                  <div key={i} className={s.state === 'pending' ? 'opacity-30' : 'opacity-100'}>
                    {s.state === 'done' ? '✓' : s.state === 'active' ? '⏳' : '•'} {s.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {!!llmLatency && (
        <div className="mt-2 text-xs text-slate-400 md:mt-3">
          耗时：{llmLatency}ms
        </div>
      )}
      {!!analysis.length && (
        <div className="mt-3 md:mt-4">
          <div className="mb-2 text-sm text-slate-400">预测依据与分析</div>
          <ul className="list-disc pl-5 text-sm text-slate-200">
            {analysis.map((a, i) => <li key={i} className="mb-1">{a}</li>)}
          </ul>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400 md:mt-3">
        免责声明：该预测仅用于学习与参考，不构成任何投资建议。股市有风险，投资需谨慎。
      </p>
    </div>
  )
}
