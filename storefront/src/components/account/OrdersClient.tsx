'use client'
import { Package } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { api, type PageMeta } from '@/lib/client-api'
import { formatDateTime } from '@/lib/format'
import { useApiQuery } from '@/lib/use-api-query'
import { useMoney, useSite } from '@/providers/SiteProvider'
import { AccountPager, ListSkeleton, OrderRow, PageHeading, type OrderListItem } from './shared'

const PAGE_SIZE = 10

export function OrdersClient({ page }: { page: number }) {
  const { productLabel, timezone } = useSite()
  const money = useMoney()
  const q = useApiQuery<{ items: OrderListItem[]; meta: PageMeta | null }>(
    async () => { const r = await api.getPage<OrderListItem>('/api/account/orders', { page, pageSize: PAGE_SIZE }); return { items: r.data, meta: r.meta } },
    `orders-${page}`,
  )
  const items = q.data?.items ?? []
  const total = q.data?.meta?.total ?? 0

  return (
    <div>
      <PageHeading title="Đơn hàng của tôi" description={q.data && total > 0 ? `${total} đơn hàng` : undefined} />
      {q.loading ? <ListSkeleton rows={4} /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : items.length === 0 ? (
        page > 1
          ? <EmptyState title="Trang này không có đơn hàng" description="Có thể đơn đã được thay đổi." actionHref="/account/orders" actionLabel="Về trang đầu" />
          : <EmptyState icon={<Package size={40} />} title="Bạn chưa có đơn hàng nào" description="Khi đặt hàng, đơn sẽ hiện ở đây để bạn theo dõi."
              actionHref="/products" actionLabel={`Xem ${productLabel.toLowerCase()}`} />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((o) => <OrderRow key={o.id} order={o} money={money} dateText={formatDateTime(o.placedAt, timezone)} />)}
          </ul>
          <AccountPager page={page} pageSize={PAGE_SIZE} total={total} basePath="/account/orders" />
        </>
      )}
    </div>
  )
}
