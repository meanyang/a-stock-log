import { PostCard } from 'nextra-theme-blog'
import { getPosts } from '../(site)/posts/get-posts'
import Link from 'next/link'

export const metadata = {
  title: '最新文章'
}

export default async function LatestPosts() {
  const posts = (await getPosts()).slice(0, 3)
  return (
    <div data-pagefind-ignore="all" className="not-prose" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: '8px 0' }}>{metadata.title}</h2>
      {posts.map(post => (
        <PostCard key={post.route} post={post} />
      ))}
      <div style={{ marginTop: 8 }}>
        <Link href="/posts" className="nx-text-primary-600">查看更多 →</Link>
      </div>
    </div>
  )
}

