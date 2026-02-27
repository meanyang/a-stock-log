import { PostCard } from 'nextra-theme-blog'
import { getPosts, getTags } from '../../posts/get-posts'
import PageContainer from '../../../components/ui/PageContainer'
import Section from '../../../components/ui/Section'
 
export async function generateMetadata(props) {
  const params = await props.params
  return {
    title: `${decodeURIComponent(params.tag)} - AStockLog`
  }
}
 
export async function generateStaticParams() {
  const allTags = await getTags()
  return [...new Set(allTags)].map(tag => ({ tag }))
}
 
export default async function TagPage(props) {
  const params = await props.params
  const { title } = await generateMetadata({ params })
  const posts = await getPosts()
  return (
    <PageContainer>
      <Section title={title}>
        {posts
          .filter(post =>
            post.frontMatter.tags.includes(decodeURIComponent(params.tag))
          )
          .map(post => (
            <PostCard key={post.route} post={post} />
          ))}
      </Section>
    </PageContainer>
  )
}
