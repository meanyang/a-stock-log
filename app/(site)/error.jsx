'use client'

export default function Error({ error, reset }) {
  return (
    <div role="alert" style={{ padding: 16 }}>
      页面出错：{error?.message || '未知错误'}
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => reset()}
          style={{
            padding: '0 16px',
            height: 40,
            borderRadius: 8,
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none'
          }}
        >
          重试
        </button>
      </div>
    </div>
  )
}
