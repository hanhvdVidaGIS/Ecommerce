import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/env'
import { apiGet } from '@/lib/server-api'

interface Entry { slug: string; updatedAt: string }
interface SitemapData { products: Entry[]; categories: Entry[]; pages: Entry[]; posts?: Entry[] }

// Sitemap dựng theo yêu cầu (đệm 1 giờ): sản phẩm mới xuất hiện mà không cần dựng lại cả website.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await apiGet<SitemapData>('/api/public/sitemap', { revalidate: 3600 })
  const url = (path: string) => SITE_URL + path
  const entries: MetadataRoute.Sitemap = [
    { url: url('/'), changeFrequency: 'daily', priority: 1 },
    { url: url('/products'), changeFrequency: 'daily', priority: 0.9 },
    { url: url('/blog'), changeFrequency: 'daily', priority: 0.6 },
  ]
  for (const c of data?.categories ?? []) entries.push({ url: url(`/products?category=${encodeURIComponent(c.slug)}`), lastModified: c.updatedAt, changeFrequency: 'weekly', priority: 0.8 })
  for (const p of data?.products ?? []) entries.push({ url: url(`/products/${encodeURIComponent(p.slug)}`), lastModified: p.updatedAt, changeFrequency: 'weekly', priority: 0.7 })
  for (const p of data?.pages ?? []) entries.push({ url: url(`/pages/${encodeURIComponent(p.slug)}`), lastModified: p.updatedAt, changeFrequency: 'monthly', priority: 0.4 })
  for (const p of data?.posts ?? []) entries.push({ url: url(`/blog/${encodeURIComponent(p.slug)}`), lastModified: p.updatedAt, changeFrequency: 'monthly', priority: 0.5 })
  return entries
}
