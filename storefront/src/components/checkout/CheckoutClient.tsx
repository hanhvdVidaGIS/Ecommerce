'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Order } from '@/api/types'
import { CartTotals } from '@/components/cart/CartTotals'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { UnitSelect } from '@/components/ui/UnitSelect'
import { checkoutGate } from '@/lib/cart-logic'
import { addressToValues, prefillForUser, type SavedAddress } from '@/lib/checkout-prefill'
import { saveLastOrder, setCartNotice } from '@/lib/checkout-session'
import { LIMITS, firstErrorField, mapCheckoutError, toCheckoutRequest, validateCheckout, type CheckoutField, type CheckoutValues, type FieldErrors } from '@/lib/checkout-validation'
import { api } from '@/lib/client-api'
import { ApiError, errorMessage } from '@/lib/errors'
import { paymentMethodHint, paymentMethodLabel } from '@/lib/order-labels'
import { useProvinces, useWards } from '@/lib/use-address'
import { useAuth } from '@/providers/AuthProvider'
import { useCart } from '@/providers/CartProvider'
import { useMoney } from '@/providers/SiteProvider'
import { useToast } from '@/providers/ToastProvider'

const EMPTY: CheckoutValues = { customerName: '', phone: '', email: '', addressLine: '', provinceCode: '', wardCode: '', note: '', paymentMethod: '' }

interface FieldProps {
  id: string
  label: string
  error?: string
  required?: boolean
  hint?: string
  children: (aria: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode
}

/** Nhãn + ô nhập + lỗi gắn đúng ô (aria-invalid, aria-describedby, role=alert). */
function Field({ id, label, error, required, hint, children }: FieldProps) {
  const errId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}{required ? <span aria-hidden className="text-danger"> *</span> : <span className="font-normal text-muted"> (tuỳ chọn)</span>}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint ? <p id={hintId} className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <p id={errId} role="alert" className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  )
}

function usePaymentMethods() {
  const [state, setState] = useState<{ methods: string[] | null; error: string | null }>({ methods: null, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    api.get<string[]>('/api/public/payment-methods').then(
      (methods) => { if (live) setState({ methods, error: null }) },
      (e) => { if (live) setState({ methods: null, error: errorMessage(e, 'Không tải được phương thức thanh toán.') }) },
    )
    return () => { live = false }
  }, [attempt])
  const retry = useCallback(() => { setState({ methods: null, error: null }); setAttempt((n) => n + 1) }, [])
  return { ...state, retry }
}

function useSavedAddresses(enabled: boolean): SavedAddress[] {
  const [list, setList] = useState<SavedAddress[]>([])
  useEffect(() => {
    if (!enabled) { setList([]); return }
    let live = true
    api.get<SavedAddress[]>('/api/account/addresses').then((a) => { if (live) setList(a) }, () => { /* địa chỉ đã lưu chỉ là tiện ích: lỗi thì để khách tự nhập */ })
    return () => { live = false }
  }, [enabled])
  return list
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]" aria-busy="true" aria-label="Đang tải">
      <div className="space-y-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14" />)}</div>
      <div className="skeleton h-64" />
    </div>
  )
}

export function CheckoutClient() {
  const router = useRouter()
  const toast = useToast()
  const money = useMoney()
  const { cart, loading, reload, clearLocal, provinceCode, setProvinceCode } = useCart()
  const { user } = useAuth()
  const methods = usePaymentMethods()
  const provinces = useProvinces()
  const saved = useSavedAddresses(!!user)

  const [values, setValues] = useState<CheckoutValues>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [savedChoice, setSavedChoice] = useState('')
  const wards = useWards(values.provinceCode || null)

  const submittingRef = useRef(false)
  const placedRef = useRef(false)
  const dirtyRef = useRef(false) // người dùng đã tự nhập: không ghi đè bằng dữ liệu điền sẵn
  const alertRef = useRef<HTMLParagraphElement>(null)

  const patch = useCallback((p: Partial<CheckoutValues>, byUser = true) => {
    if (byUser) dirtyRef.current = true
    setValues((v) => ({ ...v, ...p }))
    setErrors((e) => { const n = { ...e }; for (const k of Object.keys(p) as CheckoutField[]) delete n[k]; return n })
  }, [])

  // Điền sẵn cho người đã đăng nhập (một lần, chỉ khi chưa tự nhập).
  const prefilled = useRef(false)
  useEffect(() => {
    if (!user || prefilled.current || dirtyRef.current) return
    const p = prefillForUser(user, saved)
    if (Object.keys(p).length === 0) return
    prefilled.current = saved.length > 0 // chờ danh sách địa chỉ tới rồi mới coi là xong
    setValues((v) => ({ ...v, ...p }))
    const def = saved.find((a) => a.isDefault) ?? saved[0]
    if (def) { setSavedChoice(def.id); if (def.provinceCode) setProvinceCode(def.provinceCode) }
  }, [user, saved, setProvinceCode])

  // Tỉnh đã chọn ở giỏ hàng là điểm xuất phát.
  useEffect(() => { if (provinceCode) setValues((v) => (v.provinceCode ? v : { ...v, provinceCode })) }, [provinceCode])
  // Phương thức thanh toán mặc định: phương thức đầu tiên đang bật.
  useEffect(() => { if (methods.methods?.length) setValues((v) => (v.paymentMethod && methods.methods!.includes(v.paymentMethod) ? v : { ...v, paymentMethod: methods.methods![0] })) }, [methods.methods])
  // Phường/xã không thuộc tỉnh đang chọn thì bỏ.
  useEffect(() => {
    if (!wards.loading && !wards.error && values.wardCode && !wards.data.some((w) => w.code === values.wardCode)) setValues((v) => ({ ...v, wardCode: '' }))
  }, [wards.loading, wards.error, wards.data, values.wardCode])
  // Giỏ trống thì về giỏ hàng (trừ khi vừa đặt xong).
  useEffect(() => { if (!loading && cart && cart.items.length === 0 && !placedRef.current) router.replace('/cart') }, [loading, cart, router])

  function focusField(f: CheckoutField) {
    const target = document.getElementById(f === 'paymentMethod' ? `co-pay-${values.paymentMethod || methods.methods?.[0] || ''}` : `co-${f}`)
    target?.focus()
  }

  function changeProvince(code: string) {
    patch({ provinceCode: code, wardCode: '' })
    setSavedChoice('')
    setProvinceCode(code || null) // giỏ hàng tính lại phí vận chuyển theo tỉnh
  }

  function chooseSaved(id: string) {
    setSavedChoice(id)
    const a = saved.find((x) => x.id === id)
    if (!a) return
    patch(addressToValues(a))
    if (a.provinceCode) setProvinceCode(a.provinceCode)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current || !cart) return
    const found = validateCheckout(values, methods.methods ?? [])
    setErrors(found)
    setFormError(null)
    const first = firstErrorField(found)
    if (first) { setFormError('Vui lòng kiểm tra lại các thông tin được đánh dấu.'); focusField(first); return }

    submittingRef.current = true
    setSubmitting(true)
    try {
      const order = await api.post<Order>('/api/orders/checkout', toCheckoutRequest(values))
      saveLastOrder(order)
      placedRef.current = true
      router.push(`/checkout/success?order=${encodeURIComponent(order.orderNumber)}`)
      clearLocal()
    } catch (err) {
      if (err instanceof ApiError) {
        const f = mapCheckoutError(err)
        if (f.backToCart) {
          setCartNotice(f.message)
          toast.show(f.message, 'error')
          void reload()
          router.push('/cart')
          return
        }
        setErrors(f.fieldErrors)
        setFormError(f.message)
        const ff = firstErrorField(f.fieldErrors)
        if (ff) focusField(ff)
        else alertRef.current?.focus()
      } else {
        setFormError('Không đặt được hàng. Vui lòng thử lại.')
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const heading = <h1 className="mb-6 text-2xl font-bold md:text-3xl">Thanh toán</h1>
  if (loading && !cart) return <div className="container-page py-6 md:py-10">{heading}<CheckoutSkeleton /></div>
  if (!cart) return <div className="container-page py-6 md:py-10">{heading}<ErrorState message="Không tải được giỏ hàng." onRetry={() => void reload()} /></div>
  if (cart.items.length === 0) return <div className="container-page py-6 md:py-10">{heading}<EmptyState title="Giỏ hàng đang trống" description="Hãy thêm sản phẩm vào giỏ trước khi thanh toán." actionHref="/products" actionLabel="Mua sắm" /></div>

  const gate = checkoutGate(cart, false)
  const bad = cart.hasIssues
  return (
    <div className="container-page py-6 md:py-10">
      {heading}
      {bad ? (
        <p role="alert" className="mb-4 border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          Giỏ hàng có sản phẩm không thể đặt. <Link href="/cart" className="underline">Quay lại giỏ hàng để sửa</Link>.
        </p>
      ) : null}

      <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start">
        <div className="space-y-8">
          {formError ? <p ref={alertRef} tabIndex={-1} role="alert" className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{formError}</p> : null}

          <section aria-labelledby="co-ship" className="space-y-4">
            <h2 id="co-ship" className="text-lg font-semibold">Thông tin giao hàng</h2>

            {saved.length > 0 ? (
              <div>
                <label htmlFor="co-saved" className="mb-1 block text-sm font-medium">Địa chỉ đã lưu</label>
                <select id="co-saved" className="field" value={savedChoice} onChange={(e) => chooseSaved(e.target.value)}>
                  <option value="">Nhập địa chỉ khác</option>
                  {saved.map((a) => <option key={a.id} value={a.id}>{a.receiverName} – {a.addressLine}{a.isDefault ? ' (mặc định)' : ''}</option>)}
                </select>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="co-customerName" label="Họ và tên" required error={errors.customerName}>
                {(a) => <input {...a} name="name" className="field" autoComplete="name" maxLength={LIMITS.name} value={values.customerName} onChange={(e) => patch({ customerName: e.target.value })} />}
              </Field>
              <Field id="co-phone" label="Số điện thoại" required error={errors.phone}>
                {(a) => <input {...a} name="tel" className="field" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={(e) => patch({ phone: e.target.value })} />}
              </Field>
            </div>
            <Field id="co-email" label="Email" error={errors.email} hint="Dùng để gửi xác nhận đơn hàng.">
              {(a) => <input {...a} name="email" className="field" type="email" inputMode="email" autoComplete="email" maxLength={LIMITS.email} value={values.email} onChange={(e) => patch({ email: e.target.value })} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <UnitSelect id="co-provinceCode" name="province" label="Tỉnh/thành phố" required value={values.provinceCode} onChange={changeProvince} units={provinces.data} loading={provinces.loading}
                loadError={provinces.error} onRetry={provinces.retry} placeholder="Chọn tỉnh/thành phố" error={errors.provinceCode} />
              <UnitSelect id="co-wardCode" name="ward" label="Phường/xã" required value={values.wardCode} onChange={(c) => patch({ wardCode: c })} units={wards.data} loading={!!values.provinceCode && wards.loading}
                loadError={wards.error} onRetry={wards.retry} placeholder={values.provinceCode ? 'Chọn phường/xã' : 'Chọn tỉnh/thành phố trước'} disabled={!values.provinceCode} error={errors.wardCode} />
            </div>
            <Field id="co-addressLine" label="Địa chỉ (số nhà, đường)" required error={errors.addressLine}>
              {(a) => <input {...a} name="address" className="field" autoComplete="address-line1" maxLength={LIMITS.address} value={values.addressLine} onChange={(e) => patch({ addressLine: e.target.value })} />}
            </Field>
            <Field id="co-note" label="Ghi chú cho đơn hàng" error={errors.note}>
              {(a) => <textarea {...a} name="note" className="field" rows={3} maxLength={LIMITS.note} value={values.note} onChange={(e) => patch({ note: e.target.value })} />}
            </Field>
          </section>

          <fieldset className="space-y-3" aria-describedby={errors.paymentMethod ? 'co-pay-error' : undefined}>
            <legend className="mb-3 text-lg font-semibold">Phương thức thanh toán</legend>
            {methods.error ? <ErrorState message={methods.error} onRetry={methods.retry} />
              : !methods.methods ? <div className="skeleton h-16" aria-busy="true" aria-label="Đang tải phương thức thanh toán" />
              : methods.methods.length === 0 ? <p role="alert" className="text-danger">Cửa hàng chưa bật phương thức thanh toán nào. Vui lòng quay lại sau.</p>
              : methods.methods.map((m) => (
                <label key={m} htmlFor={`co-pay-${m}`} className={`flex cursor-pointer items-start gap-3 border p-3.5 ${values.paymentMethod === m ? 'border-ink bg-subtle' : 'border-line'}`}>
                  <input id={`co-pay-${m}`} type="radio" name="paymentMethod" value={m} checked={values.paymentMethod === m} onChange={() => patch({ paymentMethod: m })} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span>
                    <span className="block font-medium">{paymentMethodLabel(m)}</span>
                    {paymentMethodHint(m) ? <span className="block text-sm text-muted">{paymentMethodHint(m)}</span> : null}
                  </span>
                </label>
              ))}
            {errors.paymentMethod ? <p id="co-pay-error" role="alert" className="text-sm text-danger">{errors.paymentMethod}</p> : null}
          </fieldset>
        </div>

        <aside className="space-y-4 border border-line p-4 md:p-5 lg:sticky lg:top-24" aria-labelledby="co-summary">
          <h2 id="co-summary" className="text-lg font-semibold">Đơn hàng của bạn</h2>
          <ul className="divide-y divide-line">
            {cart.items.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{l.productName}</p>
                  {l.variantLabel ? <p className="text-muted">{l.variantLabel}</p> : null}
                  <p className="text-muted">SL: {l.quantity}</p>
                </div>
                <p className="shrink-0">{money(l.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <div aria-live="polite"><CartTotals cart={cart} shippingKnown={!!values.provinceCode} /></div>
          <button type="submit" className="btn btn-accent w-full" disabled={submitting || !gate.allowed || !methods.methods?.length} aria-busy={submitting || undefined}>
            {submitting ? 'Đang đặt hàng…' : `Đặt hàng · ${money(cart.total)}`}
          </button>
          <p className="text-center text-xs text-muted">Bằng việc đặt hàng, bạn đồng ý để cửa hàng liên hệ xác nhận đơn.</p>
          <Link href="/cart" className="block text-center text-sm underline hover:text-accent">Sửa giỏ hàng</Link>
        </aside>
      </form>
    </div>
  )
}
