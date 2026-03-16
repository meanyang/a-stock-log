import Image from 'next/image'
import Link from 'next/link'
import styles from './HomeHero.module.css'

export default function HomeHero() {
  return (
    <section aria-labelledby="home-hero-title" className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.content}>
          <h1 id="home-hero-title" className={styles.title}>
            AStockLog · 个人投资日志与知识库
          </h1>
          <p className={styles.subtitle}>
            记录市场观察、策略与实践，提供快速、可靠与可访问的阅读体验。
          </p>
          <div className={styles.actions}>
            <Link href="/predict" className={styles.primary} aria-label="打开股票走势预测页面">
              开始预测
            </Link>
            <Link href="/posts" className={styles.secondary} aria-label="查看最新文章">
              浏览文章
            </Link>
          </div>
        </div>
        <div className={styles.image} aria-hidden="true">
          <Image
            src="/a-stock-log-avatar.svg"
            width={320}
            height={320}
            priority
            alt=""
            sizes="(max-width: 767px) 70vw, (max-width: 1023px) 40vw, 320px"
          />
        </div>
      </div>
    </section>
  )
}
