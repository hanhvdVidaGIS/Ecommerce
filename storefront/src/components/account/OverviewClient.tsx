'use client'
import Link from 'next/link'
import { Heart, MapPin, Package, UserRound } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { api, type PageMeta } from '@/lib/client-api'
import { formatDateTime } from '@/lib/format'
import { useApiQuery } from '@/lib/use-api-query'
import { useAuth } from '@/providers/AuthProvider'
import { useMoney, useSite } from '@/providers/SiteProvider'
import { ListSkeleton, OrderRow, PageHeading, type OrderListItem } from './shared'

const SHORTCUTS = [
  { href: '/account/orders', label: 'Đơn hàng của tôi', hint: 'Xem và theo dõi đơn đã đặt', icon: Package },
  { href: '/account/addresses', label: 'Sổ địa chỉ', hint: 'Quản lý địa chỉ giao hàng', icon: MapPin },
  { href: '/account/wishlist', label: 'Yêu thích', hint: 'Sản phẩm bạn đã lưu', icon: Heart },
  { href: '/account/profile', label: 'Thông tin & mật khẩu', hint: 'Hồ sơ và đổi mật khẩu', icon: UserRound },
] as const

export function OverviewClient() {
  const { user } = useAuth()
  const { productLabel, timezone } = useSite()
  const money = useMoney()
  const q = useApiQuery<{ items: OrderListItem[]; meta: PageMeta | null }>(
    async () => { const r = await api.getPage<OrderListItem>('/api/account/orders', { page: 1, pageSize: 1 }); return { items: r.data, meta: r.meta } },
    'overview-latest-order',
  )
  const latest = q.data?.items[0]

  return (
    <div>
      <PageHeading title={`Xin chào, ${user?.fullName ?? ''}`} description="Quản lý đơn hàng, địa chỉ và thông tin tài khoản của bạn." />

      <section aria-labelledby="latest-order" className="mb-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="latest-order" className="text-lg font-semibold">Đơn hàng gần nhất</h2>
          {q.data?.meta && q.data.meta.total > 1 ? <Link href="/account/orders" className="text-sm text-accent hover:underline">Xem tất cả ({q.data.meta.total})</Link> : null}
        </div>
        {q.loading ? <ListSkeleton rows={1} /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : latest ? (
          <ul><OrderRow order={latest} money={money} dateText={formatDateTime(latest.placedAt, timezone)} /></ul>
        ) : (
          <EmptyState icon={<Package size={40} />} title="Bạn chưa có đơn hàng nào"
            description={`Khi đặt hàng, đơn sẽ hiện ở đây để bạn theo dõi.`} actionHref="/products" actionLabel={`Xem ${productLabel.toLowerCase()}`} />
        )}
      </section>

      <section aria-labelledby="shortcuts">
        <h2 id="shortcuts" className="mb-3 text-lg font-semibold">Lối tắt</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SHORTCUTS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="flex items-center gap-3 border border-line p-4 hover:border-ink">
                <s.icon size={22} className="shrink-0 text-accent" aria-hidden />
                <span><span className="block font-medium">{s.label}</span><span className="block text-sm text-muted">{s.hint}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
