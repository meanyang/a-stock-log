import StockPredictor from '../components/StockPredictor'

export const metadata = {
  title: '股票走势预测'
}

export default function PredictPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <h1 className="mb-1 bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
          {metadata.title}
        </h1>
        <p className="mb-4 text-slate-300">
          输入股票代码或名称（如 600519、贵州茅台）进行日线预测演示。
        </p>
        <StockPredictor />
      </div>
    </div>
  )
}
