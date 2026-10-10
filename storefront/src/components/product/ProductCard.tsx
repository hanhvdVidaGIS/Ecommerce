import Link from 'next/link'
import type { ProductCard as Card } from '@/api/types'
import { Media } from '@/components/ui/Media'
import { Price } from '@/components/ui/Price'

/** Thẻ sản phẩm dùng ở danh sách, trang chủ, sản phẩm liên quan. `action` là chỗ để gắn nút yêu thích (client) mà không biến thẻ thành client component. */
export function ProductCard({ product: p, currency, action, priority }: { product: Card; currency: string; action?: React.ReactNode; priority?: boolean }) {
  return (
    <article className="group relative flex flex-col">
      <Link href={`/products/${p.slug}`} className="block" aria-label={p.name}>
        <div className="relative aspect-square overflow-hidden bg-subtle">
          <Media media={p.image} alt={p.name} priority={priority} sizes="(min-width:1024px) 25vw, 50vw"
            className={`h-full w-full object-cover transition-opacity duration-300 ${p.hoverImage ? 'group-hover:opacity-0' : ''}`} />
          {p.hoverImage ? <Media media={p.hoverImage} alt="" sizes="(min-width:1024px) 25vw, 50vw" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" /> : null}
          <div className="absolute left-2 top-2 flex flex-col gap-1 text-xs font-semibold">
            {!p.inStock ? <span className="rounded bg-ink px-2 py-0.5 text-white">Hết hàng</span> : null}
            {p.inStock && p.isNew ? <span className="rounded bg-brand px-2 py-0.5 text-brand-contrast">Mới</span> : null}
            {p.inStock && p.isBestSeller ? <span className="rounded bg-accent px-2 py-0.5 text-accent-contrast">Bán chạy</span> : null}
          </div>
        </div>
        <div className="mt-3 space-y-1">
          {p.brandName ? <p className="text-xs uppercase tracking-wide text-muted">{p.brandName}</p> : null}
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</h3>
          <Price min={p.minPrice} max={p.maxPrice} compareAt={p.compareAtPrice} currency={currency} className="text-sm" />
        </div>
      </Link>
      {action ? <div className="absolute right-2 top-2">{action}</div> : null}
    </article>
  )
}

export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">{children}</div>
}
