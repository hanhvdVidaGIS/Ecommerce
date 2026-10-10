'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { Order } from '@/api/types'
import { OrderView } from '@/components/order/OrderView'
import { readLastOrder } from '@/lib/checkout-session'
import { needsBankTransfer } from '@/lib/order-labels'
import { useSite } from '@/providers/SiteProvider'

type State = { kind: 'loading' } | { kind: 'found'; order: Order } | { kind: 'missing' }

export function SuccessClient() {
  const code = useSearchParams().get('order')
  const { siteName, productLabel } = useSite()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const order = readLastOrder(code)
    setState(order ? { kind: 'found', order } : { kind: 'missing' })
  }, [code])

  if (state.kind === 'loading') return <div className="container-page max-w-3xl py-8"><div className="skeleton h-48" aria-busy="true" aria-label="Đang tải" /></div>

  const links = (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Link href="/products" className="btn btn-primary">Tiếp tục mua sắm</Link>
      <Link href={code ? `/track?order=${encodeURIComponent(code)}` : '/track'} className="btn btn-outline">Tra cứu đơn hàng</Link>
    </div>
  )

  if (state.kind === 'missing') {
    return (
      <div className="container-page max-w-3xl py-8 md:py-12">
        <h1 className="text-2xl font-bold md:text-3xl">{code ? 'Đơn hàng của bạn' : 'Không có đơn hàng để hiển thị'}</h1>
        {code ? (
          <>
            <p className="mt-3">Mã đơn: <strong className="break-all">{code}</strong></p>
            <p className="mt-2 text-muted">Chi tiết đơn chỉ hiện ngay sau khi đặt hàng trên thiết bị này. Để xem lại, hãy tra cứu bằng mã đơn và số điện thoại đã dùng khi đặt hàng.</p>
          </>
        ) : (
          <p className="mt-2 text-muted">Hãy chọn vài {productLabel.toLowerCase()} tại {siteName} hoặc tra cứu đơn đã đặt.</p>
        )}
        {links}
      </div>
    )
  }

  const { order } = state
  const method = order.payments[0]?.method
  return (
    <div className="container-page max-w-3xl py-8 md:py-12">
      <div className="mb-6 flex items-start gap-3" role="status">
        <CheckCircle2 className="mt-1 shrink-0 text-success" size={28} aria-hidden />
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Đặt hàng thành công</h1>
          <p className="mt-1 text-muted">
            Cảm ơn {order.customerName} đã mua hàng tại {siteName}.{' '}
            {method === 'Cod' ? `Chúng tôi sẽ liên hệ xác nhận đơn qua số ${order.phone}. Bạn thanh toán khi nhận hàng.` : null}
            {needsBankTransfer(order) ? 'Vui lòng chuyển khoản theo hướng dẫn bên dưới để đơn được xử lý.' : null}
          </p>
        </div>
      </div>
      <OrderView order={order} />
      {links}
    </div>
  )
}
