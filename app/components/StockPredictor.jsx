'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'

function buildChartConfig(labels, historyData, forecastData) {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '历史收盘',
          data: historyData,
          borderColor: 'rgba(100,116,139,0.9)',
          backgroundColor: 'rgba(100,116,139,0.2)',
          tension: 0.2,
          borderWidth: 2,
          pointRadius: 0,
        },
        {
          label: '预测',
          data: forecastData,
          borderColor: 'rgba(234,88,12,0.95)',
          backgroundColor: 'rgba(251,146,60,0.25)',
          tension: 0.2,
          borderWidth: 2,
          pointRadius: 0,
        }
      ]
    },
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

export default function StockPredictor() {
  const [symbol, setSymbol] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const [isMobile, setIsMobile] = useState(false)

  const labels = useMemo(() => {
    if (!data) return []
    const hist = data.history.map(d => d.date)
    const fc = data.forecast.map(d => d.date)
    return [...hist, ...fc]
  }, [data])

  const histValues = useMemo(() => (data ? data.history.map(d => d.close) : []), [data])
  const forecastValues = useMemo(() => {
    if (!data) return []
    const pad = new Array(data.history.length - 1).fill(null)
    return [...pad, data.history[data.history.length - 1].close, ...data.forecast.map(d => d.close)]
  }, [data])

  useEffect(() => {
    const onResize = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }
    if (!data) return
    const ctx = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(ctx, buildChartConfig(labels, histValues, forecastValues))
    return () => {
      if (chartRef.current) chartRef.current.destroy()
    }
  }, [data, labels, histValues, forecastValues])

  async function onSearch(e) {
    e.preventDefault()
    const s = symbol.trim()
    if (!s) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/predict?symbol=${encodeURIComponent(s)}`)
      if (!res.ok) throw new Error(`请求失败：${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err.message || '未知错误')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="not-prose" style={{ border: '1px solid var(--accents-2)', borderRadius: 10, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>股票走势预测</h2>
      <form
        onSubmit={onSearch}
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 12,
          flexDirection: isMobile ? 'column' : 'row'
        }}
      >
        <input
          type="text"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          placeholder="输入股票代码或名称"
          aria-label="股票代码或名称"
          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--accents-2)', borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '8px 14px', borderRadius: 8, width: isMobile ? '100%' : undefined }}
        >
          {loading ? '预测中…' : '开始预测'}
        </button>
      </form>
      {error && (
        <div style={{ color: 'var(--red-500)', marginBottom: 8 }}>错误：{error}</div>
      )}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 'min(480px, max(220px, 60vw))'
        }}
      >
        <canvas ref={canvasRef} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--accents-5)', marginTop: 8 }}>
        免责声明：该预测仅用于学习与参考，不构成任何投资建议。股市有风险，投资需谨慎。
      </p>
    </div>
  )
}
