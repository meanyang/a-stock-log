export default function PageContainer({ children, className = '' }) {
  return (
    <div className={`mx-auto w-full max-w-3xl px-4 sm:px-6 md:px-8 ${className}`}>
      {children}
    </div>
  )
}

