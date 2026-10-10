import type { Order } from '@/api/types'

/** Dữ liệu tạm giữa các trang trong cùng một tab (sessionStorage); mọi thao tác đều chịu được trình duyệt chặn lưu trữ. */
export const LAST_ORDER_KEY = 'ccp_last_order'
export const CART_NOTICE_KEY = 'ccp_cart_notice'

export function saveLastOrder(order: Order): void {
  try { sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order)) } catch { /* không lưu được: trang thành công sẽ dùng phương án dự phòng */ }
}

/** Đơn vừa đặt, chỉ trả về khi khớp mã trong URL. */
export function readLastOrder(orderNumber: string | null | undefined): Order | null {
  if (!orderNumber) return null
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Order
    return o && typeof o === 'object' && o.orderNumber?.toUpperCase() === orderNumber.trim().toUpperCase() && Array.isArray(o.items) ? o : null
  } catch { return null }
}

export function setCartNotice(message: string): void {
  try { sessionStorage.setItem(CART_NOTICE_KEY, message) } catch { /* bỏ qua */ }
}

/** Đọc rồi xoá thông báo cho trang giỏ hàng (chỉ hiện một lần). */
export function takeCartNotice(): string | null {
  try {
    const m = sessionStorage.getItem(CART_NOTICE_KEY)
    if (m) sessionStorage.removeItem(CART_NOTICE_KEY)
    return m
  } catch { return null }
}
