import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Dto } from '@/api/types'
import { apiGet } from '@/lib/server-api'

type Props = { params: Promise<{ slug: string }> }
type PageData = Dto<'PageDto'>

const load = (slug: string) => apiGet<PageData>(`/api/public/pages/${encodeURIComponent(slug)}`, { revalidate: 120 })

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = await load(slug)
  if (!page) return { title: 'Không tìm thấy trang', robots: { index: false } }
  // Tiêu đề SEO do quản trị nhập là tiêu đề hoàn chỉnh: không nối thêm tên website.
  const title = page.seo.metaTitle || page.title
  return {
    title: page.seo.metaTitle ? { absolute: page.seo.metaTitle } : page.title,
    description: page.seo.metaDescription || undefined,
    alternates: { canonical: page.seo.canonicalUrl || `/pages/${page.slug}` },
    robots: page.seo.noIndex ? { index: false, follow: false } : undefined,
    openGraph: { title, description: page.seo.metaDescription || undefined },
  }
}

/** Trang nội dung tĩnh (chính sách, giới thiệu, FAQ...) do quản trị soạn; HTML đã được backend làm sạch khi lưu. */
export default async function ContentPage({ params }: Props) {
  const { slug } = await params
  const page = await load(slug)
  if (!page) notFound()
  return (
    <article className="container-page max-w-3xl py-8 md:py-12">
      <nav aria-label="Đường dẫn" className="mb-4 text-sm text-muted">
        <Link href="/" className="hover:text-accent">Trang chủ</Link> <span aria-hidden>/</span> <span aria-current="page" className="text-ink">{page.title}</span>
      </nav>
      <h1 className="mb-6 text-3xl font-bold">{page.title}</h1>
      <div className="prose-content" dangerouslySetInnerHTML={{ __html: page.content }} />
    </article>
  )
}
