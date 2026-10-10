'use client'
import type { Cart } from '@/api/types'
import { useMoney } from '@/providers/SiteProvider'

/** Bảng tổng kết tiền của giỏ: dùng ở trang giỏ hàng và tóm tắt đơn ở trang thanh toán. */
export function CartTotals({ cart, shippingKnown }: { cart: Pick<Cart, 'subtotal' | 'discount' | 'couponCode' | 'shippingFee' | 'total'>; shippingKnown: boolean }) {
  const money = useMoney()
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-3"><dt className="text-muted">Tạm tính</dt><dd>{money(cart.subtotal)}</dd></div>
      {cart.discount > 0 ? (
        <div className="flex justify-between gap-3 text-success"><dt>Giảm giá{cart.couponCode ? ` (${cart.couponCode})` : ''}</dt><dd>-{money(cart.discount)}</dd></div>
      ) : null}
      <div className="flex justify-between gap-3">
        <dt className="text-muted">Phí vận chuyển{shippingKnown ? '' : ' (ước tính)'}</dt>
        <dd>{cart.shippingFee > 0 ? money(cart.shippingFee) : 'Miễn phí'}</dd>
      </div>
      <div className="flex justify-between gap-3 border-t border-line pt-3 text-base font-bold"><dt>Tổng cộng</dt><dd>{money(cart.total)}</dd></div>
    </dl>
  )
}
