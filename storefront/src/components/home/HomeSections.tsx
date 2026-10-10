import Link from 'next/link'
import type { ProductCard as Card, PublicPostCard, SiteConfig } from '@/api/types'
import { PostCard, PostGrid } from '@/components/blog/PostCard'
import { ProductCard, ProductGrid } from '@/components/product/ProductCard'
import { Media } from '@/components/ui/Media'
import { apiGet } from '@/lib/server-api'
import { setting } from '@/lib/site'
import { HeroSlider } from './HeroSlider'
import { NewsletterForm } from './NewsletterForm'

type Section = SiteConfig['homepageSections'][number]
type Banner = SiteConfig['banners'][number]

interface PublicCategory { id: string; name: string; slug: string; description: string | null; icon: Banner['desktopImage']; banner: Banner['desktopImage']; productCount: number; children: PublicCategory[] }
interface PublicBrand { id: string; name: string; slug: string; logo: Banner['desktopImage']; productCount: number }

const PRODUCT_KIND: Record<string, string> = { NewProducts: 'new', BestSellers: 'bestseller', FeaturedProducts: 'featured', Promotions: 'sale' }

function cfg<T>(section: Section, key: string, fallback: T): T {
  const v = (section.config as Record<string, unknown> | null)?.[key]
  return (v === undefined || v === null ? fallback : v) as T
}

function SectionShell({ section, viewAll, children }: { section: Section; viewAll?: string; children: React.ReactNode }) {
  return (
    <section className="container-page py-10 md:py-14" aria-labelledby={`sec-${section.id}`}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          {section.title ? <h2 id={`sec-${section.id}`} className="text-2xl font-bold md:text-3xl">{section.title}</h2> : null}
          {section.subtitle ? <p className="mt-1 text-muted">{section.subtitle}</p> : null}
        </div>
        {viewAll ? <Link href={viewAll} className="shrink-0 text-sm font-semibold text-accent hover:underline">Xem tất cả →</Link> : null}
      </div>
      {children}
    </section>
  )
}

async function ProductRow({ section, currency }: { section: Section; currency: string }) {
  const kind = PRODUCT_KIND[section.type]
  const limit = Math.min(24, Math.max(1, Number(cfg(section, 'limit', 8)) || 8))
  const products = (await apiGet<Card[]>(`/api/public/home/products?kind=${kind}&limit=${limit}`, { revalidate: 60 })) ?? []
  if (products.length === 0) return null
  const defaultAll = kind === 'sale' ? '/products?flag=sale' : kind === 'featured' ? '/products?flag=featured' : `/products?sort=${kind === 'new' ? 'newest' : 'bestseller'}`
  return (
    <SectionShell section={section} viewAll={cfg(section, 'viewAllUrl', defaultAll)}>
      <ProductGrid>{products.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}</ProductGrid>
    </SectionShell>
  )
}

async function FeaturedCategories({ section }: { section: Section }) {
  const tree = (await apiGet<PublicCategory[]>('/api/public/categories', { revalidate: 120 })) ?? []
  // Có một danh mục gốc duy nhất (ví dụ "Nước hoa") thì nhóm con mới là thứ khách chọn.
  const pool = tree.length === 1 && tree[0].children.length > 0 ? tree[0].children : tree
  const limit = Math.max(1, Number(cfg(section, 'limit', 4)) || 4)
  const items = pool.filter((c) => c.productCount > 0).slice(0, limit)
  if (items.length === 0) return null
  return (
    <SectionShell section={section}>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={`/products?category=${c.slug}`} className="group relative block aspect-[4/5] overflow-hidden bg-subtle">
              <Media media={c.banner ?? c.icon} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                <span className="block text-lg font-semibold">{c.name}</span>
                <span className="text-xs text-white/80">{c.productCount} sản phẩm</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

async function Brands({ section }: { section: Section }) {
  const limit = Math.max(1, Number(cfg(section, 'limit', 8)) || 8)
  const brands = ((await apiGet<PublicBrand[]>('/api/public/brands', { revalidate: 120 })) ?? []).filter((b) => b.productCount > 0).slice(0, limit)
  if (brands.length === 0) return null
  return (
    <SectionShell section={section}>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {brands.map((b) => (
          <li key={b.id}>
            <Link href={`/products?brand=${b.slug}`} className="flex aspect-square flex-col items-center justify-center gap-2 border border-line p-3 text-center transition hover:border-ink">
              {b.logo ? <Media media={b.logo} alt="" className="h-14 w-14 object-contain" /> : null}
              <span className="text-xs font-medium">{b.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

async function BlogRow({ section, timezone }: { section: Section; timezone: string }) {
  const limit = Math.min(12, Math.max(1, Number(cfg(section, 'limit', 3)) || 3))
  const posts = (await apiGet<PublicPostCard[]>(`/api/public/posts/latest?limit=${limit}`, { revalidate: 60 })) ?? []
  if (posts.length === 0) return null
  return (
    <SectionShell section={section} viewAll={cfg(section, 'viewAllUrl', '/blog')}>
      <PostGrid>{posts.map((p) => <PostCard key={p.slug} post={p} timezone={timezone} />)}</PostGrid>
    </SectionShell>
  )
}

function PromoBanners({ section, banners }: { section: Section; banners: Banner[] }) {
  const placement = cfg(section, 'placement', 'promo')
  const items = banners.filter((b) => b.placement === placement)
  if (items.length === 0) return null
  return (
    <SectionShell section={section}>
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((b) => (
          <li key={b.id} className="relative overflow-hidden bg-subtle">
            <Media media={b.desktopImage} alt={b.title} className="h-56 w-full object-cover md:h-64" />
            <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-black/55 to-transparent p-6 text-white">
              <h3 className="text-xl font-bold">{b.title}</h3>
              {b.subtitle ? <p className="mt-1 text-sm text-white/90">{b.subtitle}</p> : null}
              {b.buttonUrl && b.buttonText ? <Link href={b.buttonUrl} className="btn btn-accent mt-4 self-start">{b.buttonText}</Link> : null}
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

function Newsletter({ section }: { section: Section }) {
  return (
    <section className="bg-subtle py-12" aria-labelledby={`sec-${section.id}`}>
      <div className="container-page text-center">
        <h2 id={`sec-${section.id}`} className="text-2xl font-bold">{section.title}</h2>
        {section.subtitle ? <p className="mx-auto mb-6 mt-2 max-w-md text-muted">{section.subtitle}</p> : null}
        <NewsletterForm />
      </div>
    </section>
  )
}

/** Dựng trang chủ theo thứ tự và cấu hình section do quản trị đặt; loại section chưa hỗ trợ được bỏ qua. */
export async function HomeSections({ config }: { config: SiteConfig }) {
  const currency = setting(config, 'store.currency', 'VND')
  const timezone = setting(config, 'store.timezone', 'Asia/Ho_Chi_Minh')
  const heroBanners = config.banners.filter((b) => b.placement === 'hero')
  const sections = [...config.homepageSections].sort((a, b) => a.sortOrder - b.sortOrder)
  return (
    <>
      {sections.map((s) => {
        switch (s.type) {
          case 'Hero': return <HeroSlider key={s.id} banners={heroBanners} autoplay={cfg(s, 'autoplay', true)} intervalMs={Number(cfg(s, 'intervalMs', 6000)) || 6000} />
          case 'FeaturedCategories': return <FeaturedCategories key={s.id} section={s} />
          case 'NewProducts': case 'BestSellers': case 'FeaturedProducts': case 'Promotions': return <ProductRow key={s.id} section={s} currency={currency} />
          case 'Brands': return <Brands key={s.id} section={s} />
          case 'PromoBanners': return <PromoBanners key={s.id} section={s} banners={config.banners} />
          case 'Blog': return <BlogRow key={s.id} section={s} timezone={timezone} />
          case 'Newsletter': return <Newsletter key={s.id} section={s} />
          default: return null
        }
      })}
    </>
  )
}
