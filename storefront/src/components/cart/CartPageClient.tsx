'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import type { Cart } from '@/api/types'
import { Media } from '@/components/ui/Media'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { UnitSelect } from '@/components/ui/UnitSelect'
import { amountToFreeShip, checkoutGate, clampQuantity, issueMessage } from '@/lib/cart-logic'
import { takeCartNotice } from '@/lib/checkout-session'
import { cn, discountPercent } from '@/lib/format'
import { useProvinces } from '@/lib/use-address'
import { useShippingQuote } from '@/lib/use-shipping-quote'
import { useCart } from '@/providers/CartProvider'
import { useMoney, useSite } from '@/providers/SiteProvider'
import { CartTotals } from './CartTotals'

type Line = Cart['items'][number]
const DEBOUNCE_MS = 450

function CartSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]" aria-busy="true" aria-label="Đang tải giỏ hàng">
      <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="skeleton h-28" />)}</div>
      <div className="skeleton h-72" />
    </div>
  )
}

function Quantity({ line, value, disabled, onChange }: { line: Line; value: number; disabled: boolean; onChange: (q: number) => void }) {
  const max = line.maxQuantity > 0 ? Math.min(99, line.maxQuantity) : 99
  const unavailable = line.issue === 'unavailable' || line.issue === 'out_of_stock'
  return (
    <div className="inline-flex items-center border border-line" role="group" aria-label={`Số lượng ${line.productName}`}>
      <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-40" disabled={disabled || value <= 1} onClick={() => onChange(clampQuantity(value - 1, line.maxQuantity))} aria-label="Giảm số lượng"><Minus size={16} aria-hidden /></button>
      <span className="w-10 text-center text-sm font-medium" aria-live="polite">{value}</span>
      <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-40" disabled={disabled || unavailable || value >= max} onClick={() => onChange(clampQuantity(value + 1, line.maxQuantity))} aria-label="Tăng số lượng"><Plus size={16} aria-hidden /></button>
    </div>
  )
}

function CartLineRow({ line, quantity, busy, onQuantity, onRemove }: { line: Line; quantity: number; busy: boolean; onQuantity: (q: number) => void; onRemove: () => void }) {
  const money = useMoney()
  const issue = issueMessage(line)
  const pct = discountPercent(line.unitPrice, line.compareAtPrice)
  const href = `/products/${line.productSlug}`
  return (
    <li className={cn('py-4', issue && 'bg-danger/5 -mx-3 px-3')} aria-busy={busy || undefined}>
      <div className="flex gap-3 sm:gap-4">
        <Link href={href} className="block h-20 w-20 shrink-0 overflow-hidden bg-subtle sm:h-24 sm:w-24" tabIndex={-1} aria-hidden>
          <Media media={line.image} alt="" className="h-full w-full object-cover" sizes="96px" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={href} className="font-medium hover:text-accent">{line.productName}</Link>
              {line.variantLabel ? <p className="text-sm text-muted">{line.variantLabel}</p> : null}
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold">{money(line.unitPrice)}</span>
                {pct !== null && line.compareAtPrice ? <del className="text-muted"><span className="sr-only">Giá gốc </span>{money(line.compareAtPrice)}</del> : null}
              </p>
            </div>
            <button type="button" onClick={onRemove} disabled={busy} className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-danger disabled:opacity-40" aria-label={`Xoá ${line.productName} khỏi giỏ hàng`}>
              <Trash2 size={18} aria-hidden />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <Quantity line={line} value={quantity} disabled={busy} onChange={onQuantity} />
            <p className="font-semibold" aria-label={`Thành tiền ${money(line.lineTotal)}`}>{money(line.lineTotal)}</p>
          </div>
        </div>
      </div>
      {issue ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{issue}</p> : null}
    </li>
  )
}

function CouponBox({ onApply }: { onApply: (code: string) => Promise<string | null> }) {
  const { cart, removeCoupon } = useCart()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const value = code.trim()
    if (!value) { setError('Nhập mã giảm giá.'); return }
    setBusy(true)
    const err = await onApply(value)
    setBusy(false)
    setError(err)
    if (!err) setCode('')
  }

  async function remove() {
    setBusy(true)
    await removeCoupon()
    setBusy(false)
    setError(null)
  }

  const applied = cart?.couponCode
  return (
    <section aria-labelledby="coupon-heading">
      <h2 id="coupon-heading" className="mb-2 text-sm font-semibold">Mã giảm giá</h2>
      {applied ? (
        <div className="flex items-center justify-between gap-3 border border-line bg-subtle px-3 py-2.5">
          <p className="text-sm">Đã áp dụng <strong>{applied}</strong></p>
          <button type="button" onClick={remove} disabled={busy} className="min-h-9 text-sm text-muted underline hover:text-danger disabled:opacity-50">Gỡ mã</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="coupon-code" className="sr-only">Nhập mã giảm giá</label>
              <input id="coupon-code" name="coupon" className="field uppercase" placeholder="Nhập mã giảm giá" value={code} maxLength={50} autoComplete="off"
                onChange={(e) => { setCode(e.target.value); if (error) setError(null) }}
                aria-invalid={error ? true : undefined} aria-describedby={error ? 'coupon-error' : undefined} />
            </div>
            <button type="submit" className="btn btn-outline shrink-0" disabled={busy}>{busy ? 'Đang áp dụng…' : 'Áp dụng'}</button>
          </div>
          {error ? <p id="coupon-error" role="alert" className="mt-1.5 text-sm text-danger">{error}</p> : null}
        </form>
      )}
      {cart?.couponError ? <p role="alert" className="mt-1.5 text-sm text-danger">{cart.couponError}</p> : null}
    </section>
  )
}

export function CartPageClient() {
  const { cart, loading, reload, setQuantity, remove, applyCoupon, provinceCode, setProvinceCode } = useCart()
  const { productLabel } = useSite()
  const money = useMoney()
  const provinces = useProvinces()
  const quote = useShippingQuote(provinceCode, cart ? cart.subtotal : null)

  const [notice, setNotice] = useState<string | null>(null)
  // Chỉ ghi khi có nội dung: chế độ Strict của React chạy effect hai lần, lần hai đọc ra null và không được xoá thông báo.
  useEffect(() => { const n = takeCartNotice(); if (n) setNotice(n) }, [])

  // Số lượng người dùng vừa chỉnh nhưng chưa gửi (debounce) để hiển thị ngay mà không gọi API dồn dập.
  const [drafts, setDrafts] = useState<Record<string, number>>({})
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())
  const draftsRef = useRef<Record<string, number>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const cartRef = useRef(cart)
  cartRef.current = cart
  const setQuantityRef = useRef(setQuantity)
  setQuantityRef.current = setQuantity

  const markBusy = useCallback((id: string, on: boolean) => setBusyIds((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n }), [])
  const dropDraft = useCallback((id: string, only?: number) => {
    if (only !== undefined && draftsRef.current[id] !== only) return
    const { [id]: _removed, ...rest } = draftsRef.current
    draftsRef.current = rest
    setDrafts(rest)
  }, [])

  const commit = useCallback(async (id: string, q: number) => {
    delete timers.current[id]
    const current = cartRef.current?.items.find((i) => i.id === id)
    if (!current || current.quantity === q) { dropDraft(id, q); return }
    markBusy(id, true)
    await setQuantityRef.current(id, q)
    markBusy(id, false)
    dropDraft(id, q)
  }, [dropDraft, markBusy])

  const changeQuantity = useCallback((id: string, q: number) => {
    draftsRef.current = { ...draftsRef.current, [id]: q }
    setDrafts(draftsRef.current)
    if (timers.current[id]) clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => { void commit(id, q) }, DEBOUNCE_MS)
  }, [commit])

  // Rời trang khi còn thay đổi chờ gửi: gửi nốt để không mất.
  useEffect(() => () => {
    for (const [id, t] of Object.entries(timers.current)) { clearTimeout(t); const q = draftsRef.current[id]; if (q !== undefined) void commit(id, q) }
  }, [commit])

  const removeLine = useCallback(async (id: string) => {
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
    dropDraft(id)
    markBusy(id, true)
    await remove(id)
    markBusy(id, false)
  }, [dropDraft, markBusy, remove])

  const heading = <h1 className="mb-6 text-2xl font-bold md:text-3xl">Giỏ hàng</h1>

  if (loading && !cart) return <div className="container-page py-6 md:py-10">{heading}<CartSkeleton /></div>
  if (!cart) return <div className="container-page py-6 md:py-10">{heading}<ErrorState message="Không tải được giỏ hàng." onRetry={() => void reload()} /></div>
  if (cart.items.length === 0) {
    return (
      <div className="container-page py-6 md:py-10">
        {heading}
        {notice ? <p role="alert" className="mb-4 border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{notice}</p> : null}
        <EmptyState icon={<ShoppingBag size={48} />} title="Giỏ hàng của bạn đang trống" description={`Hãy chọn vài ${productLabel.toLowerCase()} bạn thích rồi quay lại đây.`} actionHref="/products" actionLabel="Tiếp tục mua sắm" />
      </div>
    )
  }

  const syncing = Object.keys(drafts).length > 0 || busyIds.size > 0
  const gate = checkoutGate(cart, syncing)
  const missing = amountToFreeShip(quote, cart.freeShippingCoupon)

  return (
    <div className="container-page py-6 md:py-10">
      {heading}
      {notice ? <p role="alert" className="mb-4 border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{notice}</p> : null}
      {cart.hasIssues ? <p role="alert" className="mb-4 border border-danger/40 bg-danger/5 p-3 text-sm text-danger">Có {productLabel.toLowerCase()} trong giỏ không thể đặt. Hãy làm theo hướng dẫn ở từng dòng để tiếp tục.</p> : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <ul className="divide-y divide-line border-y border-line" aria-label={`Danh sách ${productLabel.toLowerCase()} trong giỏ`}>
          {cart.items.map((line) => (
            <CartLineRow key={line.id} line={line} quantity={drafts[line.id] ?? line.quantity} busy={busyIds.has(line.id)}
              onQuantity={(q) => changeQuantity(line.id, q)} onRemove={() => void removeLine(line.id)} />
          ))}
        </ul>

        <aside className="space-y-5 border border-line p-4 md:p-5 lg:sticky lg:top-24" aria-label="Tổng kết đơn hàng">
          <CouponBox onApply={applyCoupon} />
          <UnitSelect id="cart-province" label="Tỉnh/thành phố nhận hàng" value={provinceCode ?? ''} onChange={(c) => setProvinceCode(c || null)}
            units={provinces.data} loading={provinces.loading} loadError={provinces.error} onRetry={provinces.retry} placeholder="Chọn để ước tính phí vận chuyển" />
          {missing !== null ? <p className="bg-subtle p-2.5 text-sm" aria-live="polite">Mua thêm <strong>{money(missing)}</strong> để được miễn phí vận chuyển.</p> : null}
          <div aria-live="polite"><CartTotals cart={cart} shippingKnown={provinceCode !== null} /></div>
          {gate.allowed ? (
            <Link href="/checkout" className="btn btn-primary w-full">Thanh toán</Link>
          ) : (
            <>
              <button type="button" className="btn btn-primary w-full" disabled aria-describedby="checkout-reason">Thanh toán</button>
              {gate.reason ? <p id="checkout-reason" className="text-center text-xs text-muted">{gate.reason}</p> : null}
            </>
          )}
          <Link href="/products" className="block text-center text-sm underline hover:text-accent">Tiếp tục mua sắm</Link>
        </aside>
      </div>
    </div>
  )
}
