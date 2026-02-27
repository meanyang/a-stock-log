import { useMDXComponents as getBlogMDXComponents } from 'nextra-theme-blog'

const blogComponents = getBlogMDXComponents({
  h1: ({ children }) => (
    <h1 className="bg-gradient-to-r from-violet-600 to-pink-500 bg-clip-text text-transparent">
      {children}
    </h1>
  ),
  wrapper: ({ children }) => (
    <div className="prose prose-slate max-w-none dark:prose-invert">{children}</div>
  ),
  DateFormatter: ({ date }) =>
    `Last updated at ${date.toLocaleDateString('en', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })}`
})

export function useMDXComponents(components) {
  return {
    ...blogComponents,
    ...components
  }
}
