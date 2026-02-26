import crypto from 'node:crypto'

export const dynamic = 'force-dynamic'

function checkSignature(token, timestamp, nonce, signature) {
  const str = [token, timestamp, nonce].sort().join('')
  const sha = crypto.createHash('sha1').update(str).digest('hex')
  return sha === signature
}

function pick(tag, xml) {
  const r1 = new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`)
  const r2 = new RegExp(`<${tag}>([^<]*)</${tag}>`)
  const m1 = xml.match(r1)
  if (m1 && m1[1] != null) return m1[1]
  const m2 = xml.match(r2)
  if (m2 && m2[1] != null) return m2[1]
  return ''
}

function buildTextReply(to, from, content) {
  const t = Math.floor(Date.now() / 1000)
  return `<xml>
<ToUserName><![CDATA[${to}]]></ToUserName>
<FromUserName><![CDATA[${from}]]></FromUserName>
<CreateTime>${t}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
</xml>`
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const signature = searchParams.get('signature') || ''
  const timestamp = searchParams.get('timestamp') || ''
  const nonce = searchParams.get('nonce') || ''
  const echostr = searchParams.get('echostr') || ''
  const token = process.env.WECHAT_TOKEN || ''
  if (!token) {
    return new Response(JSON.stringify({ error: 'WECHAT_TOKEN missing' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
  if (checkSignature(token, timestamp, nonce, signature)) {
    return new Response(echostr, { headers: { 'content-type': 'text/plain' } })
  }
  return new Response('invalid signature', { status: 401, headers: { 'content-type': 'text/plain' } })
}

export async function POST(request) {
  const token = process.env.WECHAT_TOKEN || ''
  if (!token) {
    return new Response(JSON.stringify({ error: 'WECHAT_TOKEN missing' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
  const url = new URL(request.url)
  const signature = url.searchParams.get('signature') || ''
  const timestamp = url.searchParams.get('timestamp') || ''
  const nonce = url.searchParams.get('nonce') || ''
  if (!checkSignature(token, timestamp, nonce, signature)) {
    return new Response('invalid signature', { status: 401, headers: { 'content-type': 'text/plain' } })
  }
  const xml = await request.text()
  const toUser = pick('ToUserName', xml)
  const fromUser = pick('FromUserName', xml)
  const msgType = (pick('MsgType', xml) || 'text').toLowerCase()
  if (msgType !== 'text') {
    return new Response('success', { headers: { 'content-type': 'text/plain' } })
  }
  const content = pick('Content', xml) || ''
  const reply = buildTextReply(fromUser, toUser, `收到消息：${content}`)
  return new Response(reply, { headers: { 'content-type': 'text/xml' } })
}

