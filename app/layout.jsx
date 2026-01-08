import { Footer, Layout, Navbar, ThemeSwitch } from 'nextra-theme-blog'
import { Banner, Head, Search } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-blog/style.css'

export const metadata = {
    // 网站基本信息
    title: 'AStockLog - A股日志',
    description: '一个A股投资知识管理与日志系统',
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

const banner = (<Banner storageKey="AStockLog-release">AStockLog is released 🎉</Banner>)

export default async function RootLayout({ children }) {
    return (
        <html
            lang="zh-CN"
            suppressHydrationWarning
        >
            <Head backgroundColor={{ dark: '#0f172a', light: '#fefce8' }}>
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
                <Layout banner={banner}>
                    <Navbar pageMap={await getPageMap()}>
                        <Search />
                        <ThemeSwitch />
                    </Navbar>

                    {children}
                    
                    <Footer>MIT {new Date().getFullYear()} © AStockLog.</Footer>
                </Layout>
            </body>
        </html>
    )
}