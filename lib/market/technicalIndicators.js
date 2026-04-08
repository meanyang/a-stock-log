function round(n, digits = 2) {
  const x = Number(n)
  if (!Number.isFinite(x)) return null
  return Number(x.toFixed(digits))
}

function emaSeries(data, period) {
  const xs = Array.isArray(data) ? data : []
  const p = Math.max(1, Math.floor(Number(period) || 1))
  if (xs.length === 0) return []
  const k = 2 / (p + 1)
  let ema = xs[0]
  const out = [ema]
  for (let i = 1; i < xs.length; i++) {
    ema = xs[i] * k + ema * (1 - k)
    out.push(ema)
  }
  return out
}

export function calculateTechnicalIndicators(candles) {
  const rows = Array.isArray(candles) ? candles : []
  const prices = rows.map(r => Number(r?.close)).filter(Number.isFinite)
  if (prices.length === 0) return { error: 'No price data available' }

  const currentPrice = prices[prices.length - 1]

  const fibonacci = (() => {
    const max = Math.max(...prices)
    const min = Math.min(...prices)
    const diff = max - min
    if (!Number.isFinite(diff) || diff <= 0) {
      const v = round(currentPrice, 2)
      return { level_0: v, level_0_236: v, level_0_382: v, level_0_5: v, level_0_618: v, level_0_786: v, level_1: v }
    }
    return {
      level_0: round(min, 2),
      level_0_236: round(min + diff * 0.236, 2),
      level_0_382: round(min + diff * 0.382, 2),
      level_0_5: round(min + diff * 0.5, 2),
      level_0_618: round(min + diff * 0.618, 2),
      level_0_786: round(min + diff * 0.786, 2),
      level_1: round(max, 2)
    }
  })()

  const supportResistance = (() => {
    if (prices.length < 30) return { support: [], resistance: [] }
    const supportLevels = []
    const resistanceLevels = []
    const lookback = 5
    for (let i = lookback; i < prices.length - lookback; i++) {
      let isMin = true
      for (let j = i - lookback; j < i; j++) if (prices[j] <= prices[i]) { isMin = false; break }
      if (isMin) {
        for (let j = i + 1; j <= i + lookback; j++) if (prices[j] <= prices[i]) { isMin = false; break }
      }
      if (isMin) supportLevels.push(prices[i])

      let isMax = true
      for (let j = i - lookback; j < i; j++) if (prices[j] >= prices[i]) { isMax = false; break }
      if (isMax) {
        for (let j = i + 1; j <= i + lookback; j++) if (prices[j] >= prices[i]) { isMax = false; break }
      }
      if (isMax) resistanceLevels.push(prices[i])
    }
    const uniqueSupports = [...new Set(supportLevels.map(p => round(p, 2)).filter(v => v != null))]
    const uniqueResistances = [...new Set(resistanceLevels.map(p => round(p, 2)).filter(v => v != null))]
    return {
      support: uniqueSupports.sort((a, b) => b - a).slice(0, 5),
      resistance: uniqueResistances.sort((a, b) => a - b).slice(0, 5)
    }
  })()

  const bollingerBands = (() => {
    const period = 20
    const stdDev = 2
    if (prices.length < period) return { error: `Need at least ${period} data points` }
    let sma = 0
    for (let i = prices.length - period; i < prices.length; i++) sma += prices[i]
    sma /= period
    let sumSq = 0
    for (let i = prices.length - period; i < prices.length; i++) sumSq += (prices[i] - sma) ** 2
    const std = Math.sqrt(sumSq / period)
    const upper = sma + stdDev * std
    const lower = sma - stdDev * std
    return { upper: round(upper, 2), middle: round(sma, 2), lower: round(lower, 2) }
  })()

  const macd = (() => {
    const fast = 12
    const slow = 26
    const signal = 9
    if (prices.length < slow + signal) return { error: `Need at least ${slow + signal} data points` }
    const fastEma = emaSeries(prices, fast)
    const slowEma = emaSeries(prices, slow)
    const difSeries = fastEma.map((v, i) => v - slowEma[i])
    const deaSeries = emaSeries(difSeries, signal)
    const dif = difSeries[difSeries.length - 1]
    const dea = deaSeries[deaSeries.length - 1]
    const histogram = dif - dea
    return { dif: round(dif, 4), dea: round(dea, 4), histogram: round(histogram, 4) }
  })()

  const summary = (() => {
    const bullishFactors = []
    const bearishFactors = []

    if (!bollingerBands.error && Number.isFinite(bollingerBands.upper) && Number.isFinite(bollingerBands.lower)) {
      if (currentPrice > bollingerBands.upper) bearishFactors.push('价格高于布林带上轨 — 可能超买')
      else if (currentPrice < bollingerBands.lower) bullishFactors.push('价格低于布林带下轨 — 可能超卖')
    }

    if (!macd.error && Number.isFinite(macd.dif) && Number.isFinite(macd.dea)) {
      if (macd.dif > macd.dea) bullishFactors.push('MACD 线位于信号线之上 — 看涨信号')
      else bearishFactors.push('MACD 线位于信号线之下 — 看跌信号')
    }

    if (supportResistance.support.length && supportResistance.resistance.length && Number.isFinite(currentPrice) && currentPrice > 0) {
      const supports = supportResistance.support.filter(n => Number.isFinite(n))
      const resistances = supportResistance.resistance.filter(n => Number.isFinite(n))
      let closestSupport = null
      let minSupportDist = Infinity
      for (const sup of supports) {
        if (sup < currentPrice) {
          const dist = currentPrice - sup
          if (dist < minSupportDist) { minSupportDist = dist; closestSupport = sup }
        }
      }
      let closestResistance = null
      let minResistanceDist = Infinity
      for (const res of resistances) {
        if (res > currentPrice) {
          const dist = res - currentPrice
          if (dist < minResistanceDist) { minResistanceDist = dist; closestResistance = res }
        }
      }
      if (closestSupport != null) {
        const pct = (minSupportDist / currentPrice) * 100
        if (pct < 5) bullishFactors.push(`价格接近支撑位 ${closestSupport.toFixed(2)}（距离 ${pct.toFixed(2)}%）— 可能反弹`)
      }
      if (closestResistance != null) {
        const pct = (minResistanceDist / currentPrice) * 100
        if (pct < 5) bearishFactors.push(`价格接近阻力位 ${closestResistance.toFixed(2)}（距离 ${pct.toFixed(2)}%）— 可能回调`)
      }
    }

    const fibValues = Object.values(fibonacci).filter(Number.isFinite).sort((a, b) => a - b)
    if (fibValues.length > 1 && Number.isFinite(currentPrice) && currentPrice > 0) {
      for (let i = 0; i < fibValues.length - 1; i++) {
        const lo = fibValues[i]
        const hi = fibValues[i + 1]
        if (currentPrice >= lo && currentPrice <= hi) {
          const lowerDistPct = ((currentPrice - lo) / currentPrice) * 100
          if (lowerDistPct < 2) {
            const fibName = ['0%', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%'][Math.min(i, 6)]
            bullishFactors.push(`价格接近斐波那契支撑位 ${fibName}（距离 ${lowerDistPct.toFixed(2)}%）`)
          }
          const upperDistPct = ((hi - currentPrice) / currentPrice) * 100
          if (upperDistPct < 2) {
            const fibName = ['0%', '23.6%', '38.2%', '50%', '61.8%', '78.6%', '100%'][Math.min(i + 1, 6)]
            bearishFactors.push(`价格接近斐波那契阻力位 ${fibName}（距离 ${upperDistPct.toFixed(2)}%）`)
          }
          break
        }
      }
    }

    const recommendation = bullishFactors.length > bearishFactors.length ? '看涨' : bearishFactors.length > bullishFactors.length ? '看跌' : '中性'
    return { recommendation, bullishFactors, bearishFactors }
  })()

  return {
    currentPrice: round(currentPrice, 2),
    timestamp: new Date().toISOString(),
    dataPoints: prices.length,
    fibonacci,
    supportResistance,
    bollingerBands,
    macd,
    summary
  }
}
