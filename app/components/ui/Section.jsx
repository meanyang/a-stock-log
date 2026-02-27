export default function Section({ title, children, className = '' }) {
  return (
    <section className={`mb-6 ${className}`}>
      {title ? <h1 className="mb-3 text-3xl font-bold">{title}</h1> : null}
      <div className="space-y-3">{children}</div>
    </section>
  )
}

