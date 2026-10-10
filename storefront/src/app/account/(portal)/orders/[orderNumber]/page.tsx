import type { Metadata } from 'next'
import { OrderDetailClient } from '@/components/account/OrderDetailClient'

export const metadata: Metadata = { title: 'Chi tiết đơn hàng' }

function safeDecode(v: string): string {
  try { return decodeURIComponent(v) } catch { return v }
}

export default async function OrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params
  return <OrderDetailClient orderNumber={safeDecode(orderNumber)} />
}
