import type { Metadata } from 'next'
import Link from 'next/link'
import type { Dto, ProductCard as Card } from '@/api/types'
import { Pagination } from '@/components/product/Pagination'
import { ProductCard, ProductGrid } from '@/components/product/ProductCard'
import { ProductFilters } from '@/components/product/ProductFilters'
import { SortSelect } from '@/components/product/SortSelect'
import { FLAG_LABELS, PAGE_SIZE, hasActiveFilters, parseFilters, toApiQuery, withFilters, type SearchParams } from '@/lib/filters'
import { apiGet, apiGetPage } from '@/lib/server-api'
import { getSiteConfig, setting } from '@/lib/site'

type Props = { searchParams: Promise<SearchParams> }
type Category = Dto<'PublicCategoryDetailDto'>
type Facets = Dto<'FacetsDto'>

const BASE = '/products'

async function loadCategory(slug: string | undefined): Promise<Category | null> {
  return slug ? apiGet<Category>(`/api/public/categories/${encodeURIComponent(slug)}`, { revalidate: 120 }) : null
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams)
  const config = await getSiteConfig()
  const category = await loadCategory(f.category)
  const title = category?.seo.metaTitle || category?.name || (f.q ? `Tìm kiếm: ${f.q}` : setting(config, 'store.productLabel', 'Sản phẩm'))
  const description = category?.seo.metaDescription || category?.description || undefined
  // Bộ lọc phụ và tìm kiếm tạo vô số URL gần trùng nhau: chỉ danh mục (và trang) được lập chỉ mục.
  const index = !f.q && !hasActiveFilters(f) && !f.sort && !category?.seo.noIndex
  return {
    title: category?.seo.metaTitle ? { absolute: category.seo.metaTitle } : title, description,
    alternates: { canonical: withFilters(BASE, { brands: [], attrs: {}, category: f.category, page: f.page }) },
    robots: index ? undefined : { index: false, follow: true },
    openGraph: { title, description },
  }
}

export default async function ProductsPage({ searchParams }: Props) {
  const f = parseFilters(await searchParams)
  const config = await getSiteConfig()
  const currency = setting(config, 'store.currency', 'VND')
  const productLabel = setting(config, 'store.productLabel', 'Sản phẩm')

  const [category, list, facets] = await Promise.all([
    loadCategory(f.category),
    apiGetPage<Card>(`/api/public/products?${toApiQuery(f, { page: f.page, pageSize: PAGE_SIZE })}`, { revalidate: 30 }),
    apiGet<Facets>(`/api/public/products/facets?${toApiQuery(f)}`, { revalidate: 30 }),
  ])

  const heading = category?.name ?? (f.q ? `Kết quả cho “${f.q}”` : f.flag ? FLAG_LABELS[f.flag] : productLabel)
  const { items, meta } = list

  return (
    <div className="container-page py-6 md:py-10">
      <nav aria-label="Đường dẫn" className="mb-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/" className="hover:text-accent">Trang chủ</Link></li>
          {(category?.breadcrumb ?? []).map((b, i, arr) => (
            <li key={b.slug} className="flex items-center gap-1">
              <span aria-hidden>/</span>
              {i === arr.length - 1 ? <span aria-current="page" className="text-ink">{b.name}</span> : <Link href={`${BASE}?category=${b.slug}`} className="hover:text-accent">{b.name}</Link>}
            </li>
          ))}
          {!category ? <li className="flex items-center gap-1"><span aria-hidden>/</span><span aria-current="page" className="text-ink">{heading}</span></li> : null}
        </ol>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl">{heading}</h1>
        {category?.description ? <p className="mt-2 max-w-2xl text-muted">{category.description}</p> : null}
        {category && category.children.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {category.children.map((c) => <li key={c.id}><Link href={`${BASE}?category=${c.slug}`} className="inline-block border border-line px-3 py-1.5 text-sm hover:border-ink">{c.name}</Link></li>)}
          </ul>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr] lg:gap-10">
        <div>{facets ? <ProductFilters facets={facets} filters={f} basePath={BASE} /> : null}</div>
        <div>
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">{meta.total} {productLabel.toLowerCase()}</p>
            <SortSelect filters={f} basePath={BASE} />
          </div>
          {items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-lg font-medium">Không có {productLabel.toLowerCase()} phù hợp</p>
              <p className="mt-1 text-muted">Hãy thử bỏ bớt bộ lọc hoặc dùng từ khoá khác.</p>
              <Link href={f.category ? `${BASE}?category=${f.category}` : BASE} className="btn btn-outline mt-6">Xoá bộ lọc</Link>
            </div>
          ) : (
            <ProductGrid>{items.map((p, i) => <ProductCard key={p.id} product={p} currency={currency} priority={i < 4} />)}</ProductGrid>
          )}
          <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} filters={f} basePath={BASE} />
        </div>
      </div>
    </div>
  )
}
