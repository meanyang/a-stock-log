import { PostCard } from 'nextra-theme-blog'
import { getPosts } from '../(site)/posts/get-posts'
import Link from 'next/link'
import styles from './LatestPosts.module.css'

export const metadata = {
  title: '最新文章'
}

export default async function LatestPosts() {
  const posts = (await getPosts()).slice(0, 3)
  return (
    <section aria-labelledby="latest-posts-title" data-pagefind-ignore="all" className={`not-prose ${styles.wrap}`}>
      <h2 id="latest-posts-title" className={styles.title}>{metadata.title}</h2>
      {posts.map(post => (
        <PostCard key={post.route} post={post} />
      ))}
      <div className={styles.more}>
        <Link href="/posts" className="nx-text-primary-600">查看更多 →</Link>
      </div>
    </section>
  )
}
