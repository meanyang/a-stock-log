import StockPredictor from '../components/StockPredictor'
import StandaloneStyles from '../components/StandaloneStyles'

export const metadata = {
  title: '股票走势预测'
}

export default function PredictPage() {
  return (
    <>
      <StandaloneStyles />
      <div className="predict-standalone-container">
        <h1 className="predict-title">{metadata.title}</h1>
        <p className="predict-subtitle">
          输入股票代码或名称（如 600519、贵州茅台）进行日线预测演示。
        </p>
        <StockPredictor />
      </div>
    </>
  )
}
