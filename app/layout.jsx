import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Banner, Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
 
export const metadata = {
  // 网站基本信息
  title: 'AStockLog - 个人股票投资知识管理系统',
  description: '一个基于Next.js和Nextra的个人股票投资知识管理与日志系统',
  // 添加favicon配置
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'icon', type: 'image/svg+xml', url: '/favicon.svg' },
      { rel: 'android-chrome', sizes: '192x192', url: '/android-chrome-192x192.png' },
      { rel: 'android-chrome', sizes: '512x512', url: '/android-chrome-512x512.png' },
    ],
  },
}
 
const banner = <Banner storageKey="some-key">AStockLog is released 🎉</Banner>
const navbar = (
  <Navbar
    logo={
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img 
          src="/a-stock-log-avatar.svg" 
          alt="AStockLog Logo" 
          width="64" 
          height="64" 
          style={{ marginRight: '8px' }} 
        />
        <span style={{ fontWeight: 'bold' }}>AStockLog</span>
      </div>
    }
    // ... Your additional navbar options
  />
)
const footer = <Footer>MIT {new Date().getFullYear()} © AStockLog.</Footer>
 
export default async function RootLayout({ children }) {
  return (
    <html
      // Not required, but good for SEO
      lang="zh-CN"
      // Required to be set
      dir="ltr"
      // Suggested by `next-themes` package https://github.com/pacocoursey/next-themes#with-app
      suppressHydrationWarning
    >
      <Head>
        {/* 添加favicon链接标签 */}
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="android-chrome" href="/android-chrome-192x192.png" sizes="192x192" />
        <link rel="android-chrome" href="/android-chrome-512x512.png" sizes="512x512" />
        <link rel="shortcut icon" href="/favicon.ico" />
      </Head>
      <body>
        <Layout
          banner={banner}
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/shuding/nextra/tree/main/docs"
          footer={footer}
          // ... Your additional layout options
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}