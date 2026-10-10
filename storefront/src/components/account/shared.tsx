import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Dto } from '@/api/types'
import { pageWindow } from '@/components/product/Pagination'
import { orderStatusLabel, orderStatusTone, paymentStatusLabel } from '@/lib/order-labels'
import { totalPages } from '@/lib/account/paging'

export type OrderListItem = Dto<'OrderListItemDto'>

export function PageHeading({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function StatusBadge({ status }: { status: OrderListItem['status'] }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${orderStatusTone(status)}`}>{orderStatusLabel(status)}</span>
}

/** Một đơn trong danh sách (dùng ở tổng quan và danh sách đơn). */
export function OrderRow({ order, money, dateText }: { order: OrderListItem; money: (v: number) => string; dateText: string }) {
  const others = order.itemCount - 1
  return (
    <li>
      <Link href={`/account/orders/${encodeURIComponent(order.orderNumber)}`} className="flex gap-3 border border-line p-3 hover:border-ink sm:p-4">
        {order.firstItemImage
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={order.firstItemImage} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-16 w-16 shrink-0 bg-subtle object-cover" />
          : <div className="h-16 w-16 shrink-0 bg-subtle" aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="whitespace-nowrap font-semibold">{order.orderNumber}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 truncate text-sm text-muted">
            {order.firstItemName ?? 'Đơn hàng'}{others > 0 ? ` và ${others} sản phẩm khác` : ''}
          </p>
          <p className="mt-0.5 text-xs text-muted">{dateText}{order.status === 'Cancelled' ? '' : ` · ${paymentStatusLabel(order.paymentStatus)}`}</p>
          <p className="mt-1 font-semibold sm:hidden">{money(order.grandTotal)}</p>
        </div>
        <p className="hidden shrink-0 self-center text-right font-semibold sm:block">{money(order.grandTotal)}</p>
      </Link>
    </li>
  )
}

/** Phân trang bằng liên kết ?page=n (giữ nguyên đường dẫn). */
export function AccountPager({ page, pageSize, total, basePath }: { page: number; pageSize: number; total: number; basePath: string }) {
  const pages = totalPages(total, pageSize)
  if (pages <= 1) return null
  const href = (p: number) => (p <= 1 ? basePath : `${basePath}?page=${p}`)
  const item = 'flex h-10 min-w-10 items-center justify-center border border-line px-3 text-sm'
  return (
    <nav aria-label="Phân trang" className="mt-8 flex flex-wrap justify-center gap-1">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className={`${item} hover:border-ink`}>‹ Trước</Link> : null}
      {pageWindow(page, pages).map((p, i) => p === '…'
        ? <span key={`gap${i}`} className={`${item} border-transparent`} aria-hidden>…</span>
        : <Link key={p} href={href(p)} aria-current={p === page ? 'page' : undefined} className={`${item} ${p === page ? 'border-ink bg-ink text-white' : 'hover:border-ink'}`}>{p}</Link>)}
      {page < pages ? <Link href={href(page + 1)} rel="next" className={`${item} hover:border-ink`}>Sau ›</Link> : null}
    </nav>
  )
}

export function ListSkeleton({ rows = 3, height = 'h-24' }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: rows }, (_, i) => <div key={i} className={`skeleton ${height}`} aria-hidden />)}
    </div>
  )
}
