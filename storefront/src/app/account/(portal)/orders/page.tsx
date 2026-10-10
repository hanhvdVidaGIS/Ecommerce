import type { Metadata } from 'next'
import { OrdersClient } from '@/components/account/OrdersClient'
import { parsePage } from '@/lib/account/paging'

export const metadata: Metadata = { title: 'Đơn hàng của tôi' }

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page } = await searchParams
  return <OrdersClient page={parsePage(page)} />
}
