'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, signOut } from 'next-auth/react'
import { useSession } from 'next-auth/react'
import PageContainer from '../../components/ui/PageContainer'
import Section from '../../components/ui/Section'

function normalizeError(code) {
  const c = String(code || '')
  if (!c) return ''
  if (c === 'CredentialsSignin') return '邮箱或密码错误'
  if (c === 'Configuration') return '登录服务未配置完成'
  return '登录失败'
}

export default function LoginPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const { data: session } = useSession()
  const nextUrl = useMemo(() => {
    const n = sp.get('next') || ''
    return n && n.startsWith('/') ? n : '/predict'
  }, [sp])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(normalizeError(sp.get('error')))

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await signIn('credentials', { email, password, callbackUrl: nextUrl })
    } catch (e2) {
      setError(e2?.message || '登录失败')
      setSubmitting(false)
    }
  }

  async function onLogout() {
    setSubmitting(true)
    try {
      await signOut({ callbackUrl: '/' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageContainer className="py-8">
      <Section title="登录">
        {session?.user ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-sm text-slate-600 dark:text-slate-300">已登录：{session.user.email}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(nextUrl)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
              >
                继续
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={onLogout}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
              >
                退出登录
              </button>
            </div>
          </div>
        ) : (
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
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="至少 8 位"
              required
            />
            {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
              >
                {submitting ? '登录中…' : '登录'}
              </button>
              <a href={`/register?next=${encodeURIComponent(nextUrl)}`} className="text-sm text-slate-600 underline dark:text-slate-300">
                没有账号？去注册
              </a>
            </div>
          </form>
        )}
      </Section>
    </PageContainer>
  )
}

