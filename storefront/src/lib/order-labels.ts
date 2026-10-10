import type { Order } from '@/api/types'

/** Nhãn hiển thị tiếng Việt cho trạng thái đơn, trạng thái thanh toán và phương thức thanh toán. Định nghĩa một chỗ, dùng khắp nơi. */
export type OrderStatus = Order['status']
export type PaymentStatus = Order['paymentStatus']
export type PaymentMethod = 'Cod' | 'BankTransfer'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  Pending: 'Chờ xác nhận',
  Confirmed: 'Đã xác nhận',
  Processing: 'Đang xử lý',
  Shipping: 'Đang giao',
  Completed: 'Hoàn thành',
  Cancelled: 'Đã huỷ',
  Refunded: 'Đã hoàn tiền',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  Unpaid: 'Chưa thanh toán',
  Paid: 'Đã thanh toán',
  Failed: 'Thất bại',
  Refunded: 'Đã hoàn tiền',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  Cod: 'Thanh toán khi nhận hàng (COD)',
  BankTransfer: 'Chuyển khoản ngân hàng',
}

/** Mô tả ngắn dưới nhãn phương thức ở trang thanh toán. */
export const PAYMENT_METHOD_HINTS: Record<PaymentMethod, string> = {
  Cod: 'Trả tiền mặt cho nhân viên giao hàng khi nhận được đơn.',
  BankTransfer: 'Chuyển khoản theo hướng dẫn sau khi đặt hàng; đơn được xử lý khi nhận được tiền.',
}

// Giá trị lạ từ backend (thêm trạng thái mới) vẫn hiện được thay vì rỗng.
export const orderStatusLabel = (s: string): string => (ORDER_STATUS_LABELS as Record<string, string>)[s] ?? s
export const paymentStatusLabel = (s: string): string => (PAYMENT_STATUS_LABELS as Record<string, string>)[s] ?? s
export const paymentMethodLabel = (m: string): string => (PAYMENT_METHOD_LABELS as Record<string, string>)[m] ?? m
export const paymentMethodHint = (m: string): string | undefined => (PAYMENT_METHOD_HINTS as Record<string, string>)[m]

/** Huy hiệu màu theo trạng thái (lớp Tailwind dùng token chung). */
export function orderStatusTone(s: OrderStatus): string {
  switch (s) {
    case 'Completed': return 'bg-success/10 text-success'
    case 'Cancelled':
    case 'Refunded': return 'bg-danger/10 text-danger'
    case 'Pending': return 'bg-subtle text-ink'
    default: return 'bg-accent/15 text-ink'
  }
}

/** Có cần hiện hướng dẫn chuyển khoản không: chuyển khoản, chưa trả tiền, đơn chưa huỷ/hoàn. */
export function needsBankTransfer(order: Pick<Order, 'bankTransfer' | 'paymentStatus' | 'status'>): boolean {
  return !!order.bankTransfer && order.paymentStatus === 'Unpaid' && order.status !== 'Cancelled' && order.status !== 'Refunded'
}
