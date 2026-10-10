'use client'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { MediaRef, PublicProduct } from '@/api/types'
import { Media } from '@/components/ui/Media'
import { Price } from '@/components/ui/Price'
import { cn } from '@/lib/format'
import { defaultSelection, findVariant, isValueAvailable, selectValue, type Selection } from '@/lib/variants'
import { useCart } from '@/providers/CartProvider'
import { useSite } from '@/providers/SiteProvider'
import { WishlistButton } from './WishlistButton'

/** Thư viện ảnh + chọn biến thể + số lượng + thêm giỏ. Ảnh của biến thể (nếu có) được đưa lên đầu khi chọn. */
export function ProductDetailClient({ product }: { product: PublicProduct }) {
  const router = useRouter()
  const cart = useCart()
  const { currency } = useSite()
  const { options, variants } = product

  const [selection, setSelection] = useState<Selection>(() => defaultSelection(options, variants))
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [activeImage, setActiveImage] = useState(0)

  const variant = useMemo(() => findVariant(options, variants, selection), [options, variants, selection])
  const images: MediaRef[] = useMemo(() => {
    const list = [...product.images] as MediaRef[]
    if (variant?.image && !list.some((i) => i.id === variant.image!.id)) list.unshift(variant.image as MediaRef)
    return list
  }, [product.images, variant])

  const max = variant ? Math.max(1, Math.min(variant.maxPurchasable, 99)) : 1
  const canBuy = !!variant && variant.inStock
  const safeQty = Math.min(qty, max)

  function choose(attributeId: string, valueId: string) {
    setSelection((s) => selectValue(options, variants, s, attributeId, valueId))
    setQty(1)
    setActiveImage(0)
  }

  async function add(thenCheckout: boolean) {
    if (!variant || !canBuy) return
    setBusy(true)
    const ok = await cart.add(variant.id, safeQty)
    setBusy(false)
    if (ok && thenCheckout) router.push('/checkout')
  }

  const current = images[Math.min(activeImage, images.length - 1)]
  return (
    <div className="grid gap-8 md:grid-cols-2 lg:gap-12">
      <div>
        <div className="aspect-square overflow-hidden bg-subtle">
          <Media media={current} alt={product.name} priority sizes="(min-width:768px) 50vw, 100vw" className="h-full w-full object-cover" fallbackText="Chưa có ảnh" />
        </div>
        {images.length > 1 ? (
          <ul className="mt-3 grid grid-cols-5 gap-2" aria-label="Ảnh sản phẩm">
            {images.map((img, i) => (
              <li key={img.id}>
                <button type="button" onClick={() => setActiveImage(i)} aria-label={`Xem ảnh ${i + 1}`} aria-current={i === activeImage}
                  className={cn('block aspect-square w-full overflow-hidden border-2 bg-subtle', i === activeImage ? 'border-ink' : 'border-transparent hover:border-line')}>
                  <Media media={img} alt="" className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        {product.brandName ? <p className="text-sm uppercase tracking-wide text-muted">{product.brandName}</p> : null}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold leading-tight md:text-3xl">{product.name}</h1>
          <WishlistButton productId={product.id} className="shrink-0" />
        </div>

        <div className="mt-3 text-xl" aria-live="polite">
          {variant
            ? <Price min={variant.effectivePrice} compareAt={variant.salePrice ? variant.price : null} currency={currency} />
            : <Price min={product.minPrice} max={product.maxPrice} currency={currency} />}
        </div>
        {product.shortDescription ? <p className="mt-4 text-muted">{product.shortDescription}</p> : null}

        {options.map((o) => (
          <fieldset key={o.attributeId} className="mt-6">
            <legend className="mb-2 text-sm font-semibold">{o.name}</legend>
            <div className="flex flex-wrap gap-2">
              {o.values.map((val) => {
                const selected = selection[o.attributeId] === val.id
                const available = isValueAvailable(options, variants, selection, o.attributeId, val.id)
                const isColor = o.dataType === 'Color'
                return (
                  <button key={val.id} type="button" onClick={() => choose(o.attributeId, val.id)} aria-pressed={selected} title={available ? val.label : `${val.label} (hết hàng)`}
                    className={cn(
                      isColor ? 'h-9 w-9 rounded-full border-2 bg-line' : 'min-w-14 border px-4 py-2 text-sm',
                      selected ? 'border-ink ring-2 ring-accent' : 'border-line hover:border-ink',
                      !available && 'opacity-40',
                      !available && !isColor && 'line-through',
                    )}
                    style={isColor && val.colorHex ? { background: val.colorHex } : undefined}>
                    {isColor ? <span className="sr-only">{val.label}</span> : val.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}

        <div className="mt-6 flex items-center gap-3">
          <div className="inline-flex items-center border border-line" role="group" aria-label="Số lượng">
            <button type="button" className="p-3 disabled:opacity-40" onClick={() => setQty(Math.max(1, safeQty - 1))} disabled={safeQty <= 1} aria-label="Giảm số lượng"><Minus size={16} /></button>
            <span className="w-10 text-center text-sm font-medium" aria-live="polite">{safeQty}</span>
            <button type="button" className="p-3 disabled:opacity-40" onClick={() => setQty(Math.min(max, safeQty + 1))} disabled={safeQty >= max || !canBuy} aria-label="Tăng số lượng"><Plus size={16} /></button>
          </div>
          <p className="text-sm text-muted">{!variant ? 'Vui lòng chọn đủ tuỳ chọn' : canBuy ? (variant.maxPurchasable <= 5 ? `Chỉ còn ${variant.maxPurchasable} sản phẩm` : 'Còn hàng') : 'Hết hàng'}</p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" className="btn btn-outline" disabled={!canBuy || busy} onClick={() => add(false)}>Thêm vào giỏ</button>
          <button type="button" className="btn btn-primary" disabled={!canBuy || busy} onClick={() => add(true)}>Mua ngay</button>
        </div>
        {variant ? <p className="mt-4 text-xs text-muted">Mã: {variant.sku}</p> : null}
      </div>
    </div>
  )
}
