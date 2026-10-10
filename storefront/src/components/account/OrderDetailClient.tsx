'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { ChevronLeft, Star } from 'lucide-react'
import type { Order } from '@/api/types'
import { OrderView } from '@/components/order/OrderView'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { api } from '@/lib/client-api'
import { ApiError, errorMessage } from '@/lib/errors'
import { useApiQuery } from '@/lib/use-api-query'
import { useToast } from '@/providers/ToastProvider'
import { ListSkeleton } from './shared'

const REASON_MAX = 300

export function OrderDetailClient({ orderNumber }: { orderNumber: string }) {
  const toast = useToast()
  const q = useApiQuery<Order>(() => api.get<Order>(`/api/account/orders/${encodeURIComponent(orderNumber)}`), `order-${orderNumber}`)
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const submitting = useRef(false)
  const order = q.data

  function close() { setConfirming(false); setCancelError(null); setReason('') }

  async function cancel() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setCancelError(null)
    try {
      const updated = await api.post<Order>(`/api/account/orders/${encodeURIComponent(orderNumber)}/cancel`, { reason: reason.trim() || null })
      q.setData(updated)
      toast.show('Đã huỷ đơn hàng.', 'success')
      close()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cannot_cancel') {
        // Trạng thái đã đổi (cửa hàng vừa xác nhận / đã huỷ ở nơi khác): đóng hộp, báo lý do và tải lại để hiện trạng thái mới.
        toast.show(e.message, 'error')
        close()
        q.reload()
      } else setCancelError(errorMessage(e))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <div>
      <Link href="/account/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-accent"><ChevronLeft size={16} aria-hidden />Đơn hàng của tôi</Link>
      <h1 className="mb-5 text-2xl font-bold">Chi tiết đơn hàng</h1>
      {q.loading && !order ? <ListSkeleton rows={3} height="h-32" /> : q.status === 404 ? (
        <EmptyState title="Không tìm thấy đơn hàng" description="Đơn này không tồn tại hoặc không thuộc tài khoản của bạn." actionHref="/account/orders" actionLabel="Về danh sách đơn" />
      ) : q.error && !order ? <ErrorState message={q.error} onRetry={q.reload} /> : order ? (
        <div className="space-y-6">
          {order.canCancel ? (
            <div className="flex flex-col gap-3 border border-line bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">Đơn đang chờ xác nhận, bạn vẫn có thể huỷ.</p>
              <button type="button" className="btn btn-outline shrink-0" onClick={() => setConfirming(true)}>Huỷ đơn</button>
            </div>
          ) : null}
          <OrderView order={order} itemAction={order.status === 'Completed' ? (it) => (
            // OrderItemDto chưa có slug/productId nên không dẫn thẳng tới trang sản phẩm được: mở tìm kiếm theo tên, khách chọn đúng sản phẩm rồi đánh giá ở mục Đánh giá.
            <Link href={it.productSlug ? `/products/${encodeURIComponent(it.productSlug)}#reviews` : `/products?q=${encodeURIComponent(it.productName)}`} className="inline-flex min-h-9 items-center gap-1 border border-line px-2.5 text-xs font-medium hover:border-ink" aria-label={`Đánh giá ${it.productName}`}>
              <Star size={14} aria-hidden />Đánh giá
            </Link>
          ) : undefined} />
        </div>
      ) : null}

      <ConfirmDialog open={confirming} title="Huỷ đơn hàng?" danger busy={busy} error={cancelError}
        description={<>Đơn <strong>{orderNumber}</strong> sẽ bị huỷ và không thể khôi phục.</>}
        confirmLabel="Huỷ đơn" cancelLabel="Giữ đơn" onConfirm={cancel} onCancel={close}>
        <label htmlFor="cancel-reason" className="mt-1 block text-sm font-medium">Lý do huỷ (không bắt buộc)</label>
        <textarea id="cancel-reason" className="field mt-1" rows={3} maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: đặt nhầm sản phẩm" />
        <p className="mt-1 text-right text-xs text-muted">{reason.length}/{REASON_MAX}</p>
      </ConfirmDialog>
    </div>
  )
}
