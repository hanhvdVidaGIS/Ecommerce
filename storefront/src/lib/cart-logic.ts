import type { Cart } from '@/api/types'

type Line = Cart['items'][number]

/** Hướng dẫn cho từng loại vấn đề của dòng giỏ hàng. */
export function issueMessage(line: Pick<Line, 'issue' | 'maxQuantity'>): string | null {
  switch (line.issue) {
    case null:
    case undefined:
    case '': return null
    case 'unavailable': return 'Sản phẩm này không còn được bán. Hãy xoá khỏi giỏ hàng.'
    case 'out_of_stock': return 'Sản phẩm này đã hết hàng. Hãy xoá khỏi giỏ hàng.'
    case 'insufficient_stock': return line.maxQuantity > 0 ? `Kho chỉ còn ${line.maxQuantity}. Hãy giảm số lượng xuống ${line.maxQuantity} hoặc ít hơn.` : 'Kho không đủ số lượng. Hãy giảm số lượng hoặc xoá khỏi giỏ hàng.'
    default: return 'Dòng này có vấn đề. Hãy giảm số lượng hoặc xoá khỏi giỏ hàng.'
  }
}

/** Giới hạn số lượng chỉnh được cho một dòng: tối thiểu 1, tối đa theo tồn kho (maxQuantity) và trần chung. */
export function clampQuantity(requested: number, maxQuantity: number, hardCap = 99): number {
  const cap = Math.max(1, Math.min(hardCap, maxQuantity > 0 ? maxQuantity : hardCap))
  if (!Number.isFinite(requested)) return 1
  return Math.min(cap, Math.max(1, Math.trunc(requested)))
}

export interface CheckoutGate { allowed: boolean; reason: string | null }

/** Nút "Thanh toán" chỉ bật khi giỏ có hàng, không có vấn đề và không còn thay đổi chưa đồng bộ. */
export function checkoutGate(cart: Pick<Cart, 'items' | 'hasIssues'> | null, syncing: boolean): CheckoutGate {
  if (!cart || cart.items.length === 0) return { allowed: false, reason: 'Giỏ hàng đang trống.' }
  if (cart.hasIssues) return { allowed: false, reason: 'Hãy xử lý các sản phẩm có cảnh báo trước khi thanh toán.' }
  if (syncing) return { allowed: false, reason: 'Đang cập nhật giỏ hàng…' }
  return { allowed: true, reason: null }
}

/** Tổng cuối từ các thành phần (dùng để kiểm tra/hiển thị ước tính; số chốt luôn do máy chủ tính). */
export function estimateTotal(parts: { subtotal: number; discount: number; shippingFee: number }): number {
  return Math.max(0, parts.subtotal - parts.discount) + parts.shippingFee
}

/** Số tiền còn thiếu để được miễn phí vận chuyển; null nếu không áp dụng (đã miễn phí, không có ngưỡng, hoặc mã giảm giá miễn phí ship). */
export function amountToFreeShip(quote: { fee: number; amountToFreeShip: number | null } | null, freeShippingCoupon: boolean): number | null {
  if (!quote || freeShippingCoupon || quote.fee <= 0) return null
  return quote.amountToFreeShip !== null && quote.amountToFreeShip > 0 ? quote.amountToFreeShip : null
}
