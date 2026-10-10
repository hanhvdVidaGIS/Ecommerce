import type { ComponentProps } from 'react'
import { P, type PermissionCode } from '@/api/catalog.generated'
import type { Badge } from '@/components/ui/primitives'
import type { Order, OrderHistoryEntry, OrderParams, OrderStatus, PaymentStatus } from './api'

export type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>

/** Màu huy hiệu theo trạng thái đơn: định nghĩa ở MỘT chỗ này; nhãn chữ lấy từ Meta của backend. */
export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  Pending: 'warning',
  Confirmed: 'info',
  Processing: 'info',
  Shipping: 'info',
  Completed: 'success',
  Cancelled: 'danger',
  Refunded: 'neutral',
}

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  Unpaid: 'warning',
  Paid: 'success',
  Failed: 'danger',
  Refunded: 'neutral',
}

export function orderStatusTone(status: string): BadgeTone {
  return (ORDER_STATUS_TONE as Record<string, BadgeTone>)[status] ?? 'neutral'
}

export function paymentStatusTone(status: string): BadgeTone {
  return (PAYMENT_STATUS_TONE as Record<string, BadgeTone>)[status] ?? 'neutral'
}

/* ---------- Bộ lọc danh sách ---------- */
export interface OrderFilters {
  page: number
  pageSize: number
  search: string
  status: string
  paymentStatus: string
  paymentMethod: string
  /** Ngày dạng yyyy-MM-dd theo múi giờ cửa hàng (giá trị của <input type="date">). */
  from: string
  to: string
  sort: { key: string; dir: 'asc' | 'desc' } | null
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs))
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs
  } catch {
    return 0 // múi giờ không hợp lệ: coi như UTC
  }
}

/** 00:00 của ngày `date` (yyyy-MM-dd) tại múi giờ cửa hàng, đổi ra ISO UTC; `addDays` để lấy mốc loại trừ của ngày kết thúc. */
export function dayStartUtc(date: string, timeZone: string, addDays = 0): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return undefined
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + addDays)
  const first = guess - tzOffsetMs(guess, timeZone)
  const ts = guess - tzOffsetMs(first, timeZone)
  return new Date(ts).toISOString()
}

export function sortParam(sort: OrderFilters['sort']): string | undefined {
  return sort ? `${sort.key}:${sort.dir}` : undefined
}

/** Ghép tham số truy vấn gửi API: bỏ giá trị rỗng, ngày "đến" là hết ngày đó (mốc 00:00 hôm sau, loại trừ). */
export function buildOrderParams(f: OrderFilters, timeZone: string): OrderParams {
  return {
    page: f.page,
    pageSize: f.pageSize,
    q: f.search.trim() || undefined,
    status: f.status || undefined,
    paymentStatus: f.paymentStatus || undefined,
    paymentMethod: f.paymentMethod || undefined,
    from: f.from ? dayStartUtc(f.from, timeZone) : undefined,
    to: f.to ? dayStartUtc(f.to, timeZone, 1) : undefined,
    sort: sortParam(f.sort),
  }
}

export function hasActiveFilters(f: Pick<OrderFilters, 'search' | 'status' | 'paymentStatus' | 'paymentMethod' | 'from' | 'to'>): boolean {
  return !!(f.search.trim() || f.status || f.paymentStatus || f.paymentMethod || f.from || f.to)
}

/* ---------- Thao tác trên đơn ---------- */
export interface StatusAction {
  status: OrderStatus
  /** Không hoàn tác được (huỷ, hoàn tiền): phải xác nhận và cho nhập ghi chú. */
  destructive: boolean
}

const DESTRUCTIVE: ReadonlySet<string> = new Set<OrderStatus>(['Cancelled', 'Refunded'])
const REFUND_STATUS: OrderStatus = 'Refunded'

/**
 * Quyết định nút đổi trạng thái: chỉ các trạng thái backend cho phép (nextStatuses), cần Order.Update;
 * "Đã hoàn tiền" cần thêm Order.Refund. Nút huỷ/hoàn tiền xếp sau cùng.
 */
export function statusActions(nextStatuses: readonly OrderStatus[], can: (p: PermissionCode) => boolean): StatusAction[] {
  if (!can(P.OrderUpdate)) return []
  return nextStatuses
    .filter((s) => s !== REFUND_STATUS || can(P.OrderRefund))
    .map((status) => ({ status, destructive: DESTRUCTIVE.has(status) }))
    .sort((a, b) => Number(a.destructive) - Number(b.destructive))
}

const CLOSED: ReadonlySet<string> = new Set<OrderStatus>(['Cancelled', 'Refunded'])

/** "Ghi nhận đã thanh toán": còn khoản chưa thanh toán, đơn chưa huỷ/hoàn, và có quyền Order.Update. */
export function canMarkPaid(order: Pick<Order, 'status' | 'payments'>, can: (p: PermissionCode) => boolean): boolean {
  return can(P.OrderUpdate) && !CLOSED.has(order.status) && order.payments.some((p) => p.status === 'Unpaid')
}

/** Mục lịch sử có from == to là ghi chú nội bộ, không phải chuyển trạng thái. */
export function isNoteEntry(h: Pick<OrderHistoryEntry, 'from' | 'to'>): boolean {
  return h.from !== null && h.from === h.to
}

/** Lỗi 409 mà đơn đã đổi ở nơi khác hoặc bước đi không còn hợp lệ: cần tải lại đơn. */
export function shouldReloadAfter(error: { status?: number; code?: string } | null | undefined): boolean {
  return !!error && error.status === 409 && (error.code === 'invalid_transition' || error.code === 'concurrency_conflict')
}

/** Chỉ hiện hướng dẫn chuyển khoản khi có thông tin và đơn còn khoản chuyển khoản chưa thanh toán. */
export function showBankInstructions(order: Pick<Order, 'bankTransfer' | 'payments' | 'status'>): boolean {
  return !!order.bankTransfer && !CLOSED.has(order.status) && order.payments.some((p) => p.method === 'BankTransfer' && p.status === 'Unpaid')
}
