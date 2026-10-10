import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { PublicPost, PublicPostCard } from '@/api/types'
import { PostCard, PostGrid } from '@/components/blog/PostCard'
import { CopyButton } from '@/components/ui/CopyButton'
import { Media } from '@/components/ui/Media'
import { SITE_URL } from '@/lib/env'
import { formatDate } from '@/lib/format'
import { breadcrumbLd, ld } from '@/lib/json-ld'
import { blogPostingLd } from '@/lib/seo-ld'
import { apiGet } from '@/lib/server-api'
import { getSiteConfig, setting } from '@/lib/site'

type Props = { params: Promise<{ slug: string }> }

const load = (slug: string) => apiGet<PublicPost>(`/api/public/posts/${encodeURIComponent(slug)}`, { revalidate: 60 })

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await load(slug)
  if (!post) return { title: 'Không tìm thấy bài viết', robots: { index: false } }
  const title = post.seo.metaTitle || post.title
  const description = post.seo.metaDescription || post.summary || undefined
  const cover = post.cover
  return {
    // Tiêu đề SEO do quản trị nhập là tiêu đề hoàn chỉnh: không nối thêm tên website.
    title: post.seo.metaTitle ? { absolute: post.seo.metaTitle } : post.title, description,
    keywords: post.seo.keywords || undefined,
    alternates: { canonical: post.seo.canonicalUrl || `/blog/${post.slug}` },
    robots: post.seo.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'article', title, description, url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt, modifiedTime: post.updatedAt ?? undefined,
      images: cover ? [{ url: cover.url, width: cover.width ?? undefined, height: cover.height ?? undefined, alt: cover.altText ?? post.title }] : undefined,
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await load(slug)
  if (!post) notFound()
  const [config, latest] = await Promise.all([
    getSiteConfig(),
    apiGet<PublicPostCard[]>('/api/public/posts/latest?limit=4', { revalidate: 60 }).catch(() => null),
  ])
  const timezone = setting(config, 'store.timezone', 'Asia/Ho_Chi_Minh')
  const siteName = setting(config, 'general.siteName', 'Website')
  const url = `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`
  const recent = (latest ?? []).filter((p) => p.slug !== post.slug).slice(0, 3)

  const postLd = blogPostingLd({ title: post.title, slug: post.slug, summary: post.summary, imageUrl: post.cover?.url, publishedAt: post.publishedAt, updatedAt: post.updatedAt }, SITE_URL, siteName)
  const crumbsLd = breadcrumbLd([
    { name: 'Trang chủ', url: SITE_URL + '/' },
    { name: 'Blog', url: SITE_URL + '/blog' },
    { name: post.title, url },
  ])

  return (
    <div className="container-page py-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={ld(postLd)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={ld(crumbsLd)} />

      <article className="mx-auto max-w-3xl">
        <nav aria-label="Đường dẫn" className="mb-4 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:text-accent">Trang chủ</Link></li>
            <li className="flex items-center gap-1"><span aria-hidden>/</span><Link href="/blog" className="hover:text-accent">Blog</Link></li>
            <li className="flex min-w-0 items-center gap-1"><span aria-hidden>/</span><span aria-current="page" className="min-w-0 break-words text-ink">{post.title}</span></li>
          </ol>
        </nav>

        <header>
          <h1 className="break-words text-3xl font-bold leading-tight md:text-4xl">{post.title}</h1>
          <p className="mt-3 text-sm text-muted">Đăng ngày <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, timezone)}</time></p>
          {post.summary ? <p className="mt-4 break-words text-lg text-muted">{post.summary}</p> : null}
        </header>

        {post.cover ? <Media media={post.cover} alt={post.cover.altText ?? post.title} priority className="mt-6 h-auto w-full bg-subtle" /> : null}

        {/* Nội dung đã được backend làm sạch (HtmlSanitizer) khi lưu. */}
        <div className="prose-content mt-6 min-w-0 overflow-x-auto break-words" dangerouslySetInnerHTML={{ __html: post.content }} />

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <span className="text-sm font-medium">Chia sẻ bài viết</span>
          <CopyButton text={url} label="liên kết bài viết" />
        </div>
      </article>

      {recent.length > 0 ? (
        <section className="mt-14 border-t border-line pt-10" aria-labelledby="recent-posts">
          <h2 id="recent-posts" className="mb-6 text-2xl font-bold">Bài viết gần đây</h2>
          <PostGrid>{recent.map((p) => <PostCard key={p.slug} post={p} timezone={timezone} />)}</PostGrid>
        </section>
      ) : null}
    </div>
  )
}
