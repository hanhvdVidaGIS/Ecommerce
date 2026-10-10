import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { PublicPostCard } from '@/api/types'
import { PostCard, PostGrid } from '@/components/blog/PostCard'
import { AccountPager } from '@/components/account/shared'
import { EmptyState } from '@/components/ui/States'
import { parsePage } from '@/lib/account/paging'
import { apiGetPage } from '@/lib/server-api'
import { getSiteConfig, setting } from '@/lib/site'

type Props = { searchParams: Promise<{ page?: string | string[] }> }

const BASE = '/blog'
const PAGE_SIZE = 9

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePage((await searchParams).page)
  const config = await getSiteConfig()
  const description = setting(config, 'seo.defaultDescription') || setting(config, 'general.description') || undefined
  return {
    title: 'Blog', description,
    alternates: { canonical: page > 1 ? `${BASE}?page=${page}` : BASE },
    openGraph: { title: 'Blog', description },
  }
}

export default async function BlogPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page)
  const [config, list] = await Promise.all([
    getSiteConfig(),
    apiGetPage<PublicPostCard>(`/api/public/posts?page=${page}&pageSize=${PAGE_SIZE}`, { revalidate: 60 }),
  ])
  const { items, meta } = list
  if (items.length === 0 && page > 1) notFound()
  const timezone = setting(config, 'store.timezone', 'Asia/Ho_Chi_Minh')

  return (
    <div className="container-page py-6 md:py-10">
      <nav aria-label="Đường dẫn" className="mb-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/" className="hover:text-accent">Trang chủ</Link></li>
          <li className="flex items-center gap-1"><span aria-hidden>/</span><span aria-current="page" className="text-ink">Blog</span></li>
        </ol>
      </nav>
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">Blog</h1>
      {items.length === 0 ? (
        <EmptyState title="Chưa có bài viết nào" description="Các bài viết mới sẽ xuất hiện tại đây. Hãy quay lại sau nhé." actionHref="/" actionLabel="Về trang chủ" />
      ) : (
        <>
          <PostGrid>{items.map((p, i) => <PostCard key={p.slug} post={p} timezone={timezone} priority={i < 3} />)}</PostGrid>
          <AccountPager page={meta.page} pageSize={meta.pageSize} total={meta.total} basePath={BASE} />
        </>
      )}
    </div>
  )
}
