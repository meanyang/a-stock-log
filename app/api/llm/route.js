export const dynamic = 'force-dynamic'

import { guard } from '../../../lib/api/guard.js'
import { listModels, runLlmPredict } from '../../../lib/services/llm.js'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth.js'

function ok(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...extraHeaders } })
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) return ok({ code: 401, msg: 'login required' }, 401)
    const g = await guard(request, {
      name: 'llm.predict',
      subject: `user:${userId}`,
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
    const okh = (data, status) => ok(data, status, g.headers || {})

    const body = await request.json()
    const action = (body && body.action) || 'predict'
    if (action === 'predict') {
      const r = await runLlmPredict(body)
      if (r.error) return okh({ code: -3, msg: r.error }, r.status || 400)
      return okh({ code: 0, data: r.data })
    }

    return okh({ code: -1, msg: 'unknown action' }, 400)
  } catch (e) {
    return ok({ code: 500, msg: e?.message || String(e) }, 500)
  }
}

export async function GET(request) {
  const url = new URL(request.url)
  const action = (url.searchParams.get('action') || '').toLowerCase()
  if (action === 'models') {
    const models = listModels()
    return ok({ code: 0, data: { models } })
  }
  return ok({ code: -1, msg: 'use POST with action' }, 400)
}
