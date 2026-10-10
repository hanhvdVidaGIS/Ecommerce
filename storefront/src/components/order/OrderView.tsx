'use client'
import type { ReactNode } from 'react'
import type { Order } from '@/api/types'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/format'
import { needsBankTransfer, orderStatusLabel, orderStatusTone, paymentMethodLabel, paymentStatusLabel } from '@/lib/order-labels'
import { useMoney, useSite } from '@/providers/SiteProvider'
import { BankTransferGuide } from './BankTransferGuide'

function Badge({ className, children }: { className: string; children: string }) {
  return <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-semibold', className)}>{children}</span>
}

/** Chi tiết một đơn hàng: dùng chung cho trang đặt hàng thành công, tra cứu đơn và chi tiết đơn của tài khoản. */
export function OrderView({ order, itemAction }: { order: Order; itemAction?: (item: Order['items'][number]) => ReactNode }) {
  const money = useMoney()
  const { timezone, productLabel } = useSite()
  const method = order.payments[0]?.method
  const history = [...order.history].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const place = [order.shippingAddress, order.wardName, order.provinceName].filter(Boolean).join(', ')

  return (
    <div className="space-y-6">
      <section aria-labelledby="order-summary" className="border border-line p-4 md:p-5">
        <h2 id="order-summary" className="sr-only">Thông tin đơn hàng</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div><dt className="text-sm text-muted">Mã đơn</dt><dd className="break-all text-lg font-bold">{order.orderNumber}</dd></div>
          <div><dt className="text-sm text-muted">Ngày đặt</dt><dd>{formatDateTime(order.placedAt, timezone)}</dd></div>
          <div><dt className="text-sm text-muted">Trạng thái đơn</dt><dd><Badge className={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</Badge></dd></div>
          <div><dt className="text-sm text-muted">Thanh toán</dt><dd className="flex flex-wrap items-center gap-2">{method ? <span>{paymentMethodLabel(method)}</span> : null}<Badge className={order.paymentStatus === 'Paid' ? 'bg-success/10 text-success' : 'bg-subtle text-ink'}>{paymentStatusLabel(order.paymentStatus)}</Badge></dd></div>
        </dl>
      </section>

      {needsBankTransfer(order) ? <BankTransferGuide order={order} /> : null}

      <section aria-labelledby="order-items">
        <h2 id="order-items" className="mb-3 text-base font-semibold">{productLabel} đã đặt</h2>
        <ul className="divide-y divide-line border-y border-line">
          {order.items.map((it) => (
            <li key={it.id} className="flex gap-3 py-3">
              {it.imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={it.imageUrl} alt={it.productName} width={64} height={64} loading="lazy" decoding="async" className="h-16 w-16 shrink-0 bg-subtle object-cover" />
                : <div className="h-16 w-16 shrink-0 bg-subtle" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{it.productName}</p>
                {it.variantName ? <p className="text-sm text-muted">{it.variantName}</p> : null}
                <p className="text-sm text-muted">{money(it.unitPrice)} × {it.quantity}</p>
                {itemAction ? <div className="mt-2">{itemAction(it)}</div> : null}
              </div>
              <p className="shrink-0 font-semibold">{money(it.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-4 max-w-sm space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Tạm tính</dt><dd>{money(order.subtotal)}</dd></div>
          {order.discountTotal > 0 ? <div className="flex justify-between text-success"><dt>Giảm giá{order.couponCode ? ` (${order.couponCode})` : ''}</dt><dd>-{money(order.discountTotal)}</dd></div> : null}
          <div className="flex justify-between"><dt className="text-muted">Phí vận chuyển</dt><dd>{order.shippingFee > 0 ? money(order.shippingFee) : 'Miễn phí'}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Tổng cộng</dt><dd>{money(order.grandTotal)}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="order-ship" className="border border-line p-4 md:p-5">
        <h2 id="order-ship" className="mb-2 text-base font-semibold">Giao tới</h2>
        <address className="space-y-0.5 not-italic">
          <p className="font-medium">{order.customerName}</p>
          <p>{order.phone}{order.email ? ` · ${order.email}` : ''}</p>
          <p>{place}</p>
        </address>
        {order.note ? <p className="mt-2 text-sm text-muted">Ghi chú: {order.note}</p> : null}
      </section>

      {history.length > 0 ? (
        <section aria-labelledby="order-history">
          <h2 id="order-history" className="mb-3 text-base font-semibold">Lịch sử đơn hàng</h2>
          <ol className="relative space-y-4 border-l-2 border-line pl-5">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="relative">
                <span aria-hidden className={cn('absolute -left-[1.62rem] top-1.5 h-2.5 w-2.5 rounded-full', i === history.length - 1 ? 'bg-accent' : 'bg-line')} />
                <p className="font-medium">{orderStatusLabel(h.to)}</p>
                <p className="text-sm text-muted"><time dateTime={h.at}>{formatDateTime(h.at, timezone)}</time></p>
                {h.note ? <p className="text-sm">{h.note}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}
