 'use client'
import dynamic from 'next/dynamic'

const StockPredictor = dynamic(() => import('./StockPredictor'), {
  ssr: false
})

export default function StockPredictorLoader(props) {
  return <StockPredictor {...props} />
}
