export const dynamic = 'force-dynamic'

import { guard } from '../../../lib/api/guard.js'
import { heuristicPredict } from '../../../lib/services/predictHeuristic.js'
import { getCandlesForPredict } from '../../../lib/services/stocksDaily.js'
import { runLlmPredict } from '../../../lib/services/llm.js'

export async function POST(request) {
  try {
    const g = await guard(request, {
      name: 'predict.unified',
      rateLimits: [
        { scope: 'ip', limit: Number(process.env.LLM_RL_IP_PER_MIN || 10), windowSeconds: 60 },
        { scope: 'subject', limit: Number(process.env.LLM_RL_SUBJECT_PER_MIN || 20), windowSeconds: 60 }
      ],
      dailyQuota: {
        scope: 'subject',
        limit: Number(process.env.LLM_QUOTA_DAILY || 200)
      }
    })
    if (!g.ok) return g.response
    const baseHeaders = { 'content-type': 'application/json', ...(g.headers || {}) }
    const resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: baseHeaders })

    const body = await request.json()
    const symbol = String(body?.symbol || body?.params?.symbol || '').trim()
    const start_date = String(body?.start_date || '').trim()
    const end_date = String(body?.end_date || '').trim()
    const horizon = Number(body?.horizon || body?.params?.horizon || process.env.PREDICT_HORIZON_DAYS || 20)
    const model = String(body?.model || body?.params?.model || 'minimax/minimax-m2.5:free').trim()
    if (!symbol) return resp({ code: -1, msg: 'symbol required' }, 400)

    const candlesRes = await getCandlesForPredict({ symbol, start_date, end_date, backDays: 90, limit: 300 })
    if (candlesRes.error) return resp({ code: -2, msg: candlesRes.error }, candlesRes.status || 502)
    const candles = Array.isArray(candlesRes.data?.candles) ? candlesRes.data.candles : []
    if (!candles.length) return resp({ code: -2, msg: 'no daily data' }, 404)

    const llmInput = {
      action: 'predict',
      data: { candles },
      params: { symbol, horizon, ...(model ? { model } : {}) }
    }
    let forecast = []
    let explanation = []
    let provider = ''
    const llmRequireAuth = String(process.env.LLM_REQUIRE_AUTH || '').toLowerCase() === 'true'
    const allowLlm = !(llmRequireAuth && !g.token)
    if (allowLlm) {
      const r = await runLlmPredict(llmInput)
      if (!r?.error) {
        const d = r?.data || {}
        forecast = Array.isArray(d.forecast) ? d.forecast : []
        explanation = Array.isArray(d.explanation) ? d.explanation : []
        provider = d.provider || ''
      }
    }
    if (forecast.length === 0) {
      const fallback = await heuristicPredict({ symbol, horizonDays: horizon })
      if (fallback.error) return resp({ code: -3, msg: fallback.error }, fallback.status || 500)
      forecast = Array.isArray(fallback.data?.forecast) ? fallback.data.forecast : []
      explanation = ['使用本地规则生成']
      provider = 'heuristic'
    }
    return resp(
      { code: 0, data: { ts_code: candlesRes.data?.ts_code || symbol, candles, forecast, provider, explanation } },
      200
    )
  } catch (e) {
    return new Response(JSON.stringify({ code: 500, msg: e?.message || String(e) }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}
