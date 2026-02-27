import Link from 'next/link'
import { PostCard } from 'nextra-theme-blog'
import { getPosts, getTags } from './get-posts'
import PageContainer from '../../components/ui/PageContainer'
import Section from '../../components/ui/Section'
 
export const metadata = {
  title: 'Posts'
}
 
export default async function PostsPage() {
  const tags = await getTags()
  const posts = await getPosts()
  const allTags = Object.create(null)
 
  for (const tag of tags) {
    allTags[tag] ??= 0
    allTags[tag] += 1
  }
  return (
    <PageContainer data-pagefind-ignore="all">
      <Section title={metadata.title}>
        <div className="not-prose mb-2 flex flex-wrap gap-2">
          {Object.entries(allTags).map(([tag, count]) => (
            <Link key={tag} href={`/tags/${tag}`} className="nextra-tag">
              {tag} ({count})
            </Link>
          ))}
        </div>
        {posts.map(post => (
          <PostCard key={post.route} post={post} />
        ))}
      </Section>
    </PageContainer>
  )
}
