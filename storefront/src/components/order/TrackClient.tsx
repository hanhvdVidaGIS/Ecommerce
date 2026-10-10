'use client'
import { useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'
import type { Order } from '@/api/types'
import { OrderView } from '@/components/order/OrderView'
import { isValidPhone } from '@/lib/checkout-validation'
import { api } from '@/lib/client-api'
import { ApiError } from '@/lib/errors'
import { trackErrorMessage, validateTrack, type TrackErrors } from '@/lib/track'

export function TrackClient() {
  const initial = useSearchParams().get('order') ?? ''
  const [orderNumber, setOrderNumber] = useState(initial)
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<TrackErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const busy = useRef(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy.current) return
    const found = validateTrack({ orderNumber, phone }, isValidPhone)
    setErrors(found)
    setMessage(null)
    if (found.orderNumber || found.phone) {
      document.getElementById(found.orderNumber ? 'track-order' : 'track-phone')?.focus()
      return
    }
    busy.current = true
    setLoading(true)
    setOrder(null)
    try {
      setOrder(await api.post<Order>('/api/orders/track', { orderNumber: orderNumber.trim().toUpperCase(), phone: phone.trim() }))
    } catch (err) {
      setMessage(trackErrorMessage(err instanceof ApiError ? err : { status: 0, code: 'network_error', message: 'Không tra cứu được. Vui lòng thử lại.' }))
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  return (
    <div className="container-page max-w-3xl py-8 md:py-12">
      <h1 className="text-2xl font-bold md:text-3xl">Tra cứu đơn hàng</h1>
      <p className="mt-2 text-muted">Nhập mã đơn và số điện thoại đã dùng khi đặt hàng.</p>

      <form onSubmit={submit} noValidate className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <div>
          <label htmlFor="track-order" className="mb-1 block text-sm font-medium">Mã đơn hàng <span aria-hidden className="text-danger">*</span></label>
          <input id="track-order" name="orderNumber" className="field uppercase" autoComplete="off" maxLength={30} value={orderNumber}
            onChange={(e) => { setOrderNumber(e.target.value); setErrors((x) => ({ ...x, orderNumber: undefined })) }}
            aria-invalid={errors.orderNumber ? true : undefined} aria-describedby={errors.orderNumber ? 'track-order-error' : undefined} />
          {errors.orderNumber ? <p id="track-order-error" role="alert" className="mt-1 text-sm text-danger">{errors.orderNumber}</p> : null}
        </div>
        <div>
          <label htmlFor="track-phone" className="mb-1 block text-sm font-medium">Số điện thoại <span aria-hidden className="text-danger">*</span></label>
          <input id="track-phone" name="tel" type="tel" inputMode="tel" autoComplete="tel" className="field" value={phone}
            onChange={(e) => { setPhone(e.target.value); setErrors((x) => ({ ...x, phone: undefined })) }}
            aria-invalid={errors.phone ? true : undefined} aria-describedby={errors.phone ? 'track-phone-error' : undefined} />
          {errors.phone ? <p id="track-phone-error" role="alert" className="mt-1 text-sm text-danger">{errors.phone}</p> : null}
        </div>
        <button type="submit" className="btn btn-primary sm:mt-6" disabled={loading} aria-busy={loading || undefined}>{loading ? 'Đang tra cứu…' : 'Tra cứu'}</button>
      </form>

      {message ? <p role="alert" className="mt-5 border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{message}</p> : null}
      {loading ? <div className="skeleton mt-6 h-56" aria-busy="true" aria-label="Đang tra cứu" /> : null}
      {order ? <div className="mt-8" aria-live="polite"><OrderView order={order} /></div> : null}
    </div>
  )
}
