import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { PublicProduct } from '@/api/types'
import { ProductCard, ProductGrid } from '@/components/product/ProductCard'
import { ProductDetailClient } from '@/components/product/ProductDetailClient'
import { ProductReviews } from '@/components/review/ProductReviews'
import { SITE_URL } from '@/lib/env'
import { breadcrumbLd as buildBreadcrumbLd, ld } from '@/lib/json-ld'
import { REVIEW_LD_LIMIT } from '@/lib/reviews'
import { loadReviews } from '@/lib/reviews-server'
import { aggregateRatingLd, reviewsLd } from '@/lib/seo-ld'
import { apiGet } from '@/lib/server-api'
import { getSiteConfig, setting } from '@/lib/site'

type Props = { params: Promise<{ slug: string }> }

const load = (slug: string) => apiGet<PublicProduct>(`/api/public/products/${encodeURIComponent(slug)}`, { revalidate: 60 })

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const p = await load(slug)
  if (!p) return { title: 'Không tìm thấy sản phẩm', robots: { index: false } }
  const title = p.seo.metaTitle || p.name
  const description = p.seo.metaDescription || p.shortDescription || undefined
  const image = p.images[0]
  return {
    title: p.seo.metaTitle ? { absolute: p.seo.metaTitle } : p.name, description,
    keywords: p.seo.keywords || undefined,
    alternates: { canonical: p.seo.canonicalUrl || `/products/${p.slug}` },
    robots: p.seo.noIndex ? { index: false, follow: false } : undefined,
    openGraph: { type: 'website', title, description, url: `/products/${p.slug}`, images: image ? [{ url: image.url, width: image.width ?? undefined, height: image.height ?? undefined, alt: image.altText ?? p.name }] : undefined },
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  const p = await load(slug)
  if (!p) notFound()
  const [config, reviews] = await Promise.all([getSiteConfig(), loadReviews(p.slug)])
  const currency = setting(config, 'store.currency', 'VND')
  const abs = (url: string) => (url.startsWith('http') ? url : SITE_URL + url)

  const productLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.variants[0]?.sku,
    description: p.shortDescription || undefined,
    image: p.images.map((i) => abs(i.url)),
    brand: p.brandName ? { '@type': 'Brand', name: p.brandName } : undefined,
    offers: {
      '@type': 'AggregateOffer', priceCurrency: currency, lowPrice: p.minPrice, highPrice: p.maxPrice, offerCount: p.variants.length,
      availability: p.variants.some((v) => v.inStock) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}/products/${p.slug}`,
    },
    // Chỉ có khi đã có đánh giá được duyệt; danh sách review lấy tối đa vài bài mới nhất.
    aggregateRating: aggregateRatingLd(reviews?.summary),
    review: reviewsLd(reviews?.reviews, REVIEW_LD_LIMIT),
  }
  const crumbs = [{ name: 'Trang chủ', url: SITE_URL + '/' }, ...p.breadcrumb.map((b) => ({ name: b.name, url: `${SITE_URL}/products?category=${b.slug}` })), { name: p.name, url: `${SITE_URL}/products/${p.slug}` }]
  const breadcrumbLd = buildBreadcrumbLd(crumbs)

  return (
    <div className="container-page py-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={ld(productLd)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={ld(breadcrumbLd)} />

      <nav aria-label="Đường dẫn" className="mb-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/" className="hover:text-accent">Trang chủ</Link></li>
          {p.breadcrumb.map((b) => <li key={b.slug} className="flex items-center gap-1"><span aria-hidden>/</span><Link href={`/products?category=${b.slug}`} className="hover:text-accent">{b.name}</Link></li>)}
          <li className="flex items-center gap-1"><span aria-hidden>/</span><span aria-current="page" className="text-ink">{p.name}</span></li>
        </ol>
      </nav>

      <ProductDetailClient product={p} />

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_22rem]">
        {p.description ? (
          <section aria-labelledby="desc">
            <h2 id="desc" className="mb-3 text-xl font-bold">Mô tả</h2>
            {/* Nội dung đã được backend làm sạch (HtmlSanitizer) khi lưu. */}
            <div className="prose-content" dangerouslySetInnerHTML={{ __html: p.description }} />
          </section>
        ) : <span />}
        {p.attributes.length > 0 ? (
          <section aria-labelledby="specs">
            <h2 id="specs" className="mb-3 text-xl font-bold">Thông tin</h2>
            <dl className="divide-y divide-line border-y border-line text-sm">
              {p.attributes.map((a) => (
                <div key={a.code} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted">{a.name}</dt>
                  <dd className="text-right font-medium">{a.values.join(', ')}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>

      <ProductReviews product={{ id: p.id, slug: p.slug }} data={reviews} />

      {p.related.length > 0 ? (
        <section className="mt-16" aria-labelledby="related">
          <h2 id="related" className="mb-6 text-2xl font-bold">Có thể bạn cũng thích</h2>
          <ProductGrid>{p.related.slice(0, 4).map((r) => <ProductCard key={r.id} product={r} currency={currency} />)}</ProductGrid>
        </section>
      ) : null}
    </div>
  )
}
