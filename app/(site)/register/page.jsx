'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import PageContainer from '../../components/ui/PageContainer'
import Section from '../../components/ui/Section'

export default function RegisterPage() {
  const sp = useSearchParams()
  const nextUrl = useMemo(() => {
    const n = sp.get('next') || ''
    return n && n.startsWith('/') ? n : '/predict'
  }, [sp])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      if (password !== password2) {
        setError('两次输入的密码不一致')
        setSubmitting(false)
        return
      }
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json || json.code !== 0) {
        const msg = json?.msg || `注册失败：${res.status}`
        setError(msg === 'email already registered' ? '该邮箱已注册' : msg)
        setSubmitting(false)
        return
      }
      await signIn('credentials', { email, password, callbackUrl: nextUrl })
    } catch (e2) {
      setError(e2?.message || '注册失败')
      setSubmitting(false)
    }
  }

  return (
    <PageContainer className="py-8">
      <Section title="注册">
        <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder="name@example.com"
            required
          />
          <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder="至少 8 位"
            required
          />
          <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">确认密码</label>
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder="再输入一次"
            required
          />
          {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              {submitting ? '注册中…' : '注册并登录'}
            </button>
            <a href={`/login?next=${encodeURIComponent(nextUrl)}`} className="text-sm text-slate-600 underline dark:text-slate-300">
              已有账号？去登录
            </a>
          </div>
        </form>
      </Section>
    </PageContainer>
  )
}

