import { Footer, Layout, Navbar, ThemeSwitch } from 'nextra-theme-blog'
import { Banner, Search } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import ClientOnly from '../components/ClientOnly'
import styles from './layout.module.css'

export const metadata = {
  title: 'AStockLog - A股日志',
  description: '一个A股投资知识管理与日志系统',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' }
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    other: [
      { rel: 'icon', type: 'image/svg+xml', url: '/favicon.svg' },
      { rel: 'android-chrome', sizes: '192x192', url: '/android-chrome-192x192.png' },
      { rel: 'android-chrome', sizes: '512x512', url: '/android-chrome-512x512.png' }
    ]
  }
}

const banner = <Banner storageKey="AStockLog-release">AStockLog is released 🎉</Banner>

export default async function SiteLayout({ children }) {
  return (
    <>
      <a href="#main-content" className={styles.skipLink}>跳到内容</a>
      <Layout banner={banner}>
        <ClientOnly>
          <Navbar pageMap={await getPageMap()}>
            <Search />
            <ThemeSwitch />
          </Navbar>
        </ClientOnly>
        <main id="main-content">{children}</main>
        <Footer>MIT {new Date().getFullYear()} © AStockLog.</Footer>
      </Layout>
    </>
  )
}
