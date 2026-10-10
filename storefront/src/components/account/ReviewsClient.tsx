'use client'
import Link from 'next/link'
import { Star } from 'lucide-react'
import type { MyReview } from '@/api/types'
import { Stars } from '@/components/review/Stars'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { api } from '@/lib/client-api'
import { formatDate } from '@/lib/format'
import { reviewStatusLabel, reviewStatusTone } from '@/lib/reviews'
import { useApiQuery } from '@/lib/use-api-query'
import { useSite } from '@/providers/SiteProvider'
import { ListSkeleton, PageHeading } from './shared'

export function ReviewsClient() {
  const { timezone, productLabel } = useSite()
  const q = useApiQuery<MyReview[]>(() => api.get<MyReview[]>('/api/account/reviews'), 'my-reviews')
  const items = q.data ?? []

  return (
    <div>
      <PageHeading title="Đánh giá của tôi" description={items.length > 0 ? `${items.length} đánh giá` : undefined} />
      {q.loading && !q.data ? <ListSkeleton rows={3} height="h-28" /> : q.error && !q.data ? <ErrorState message={q.error} onRetry={q.reload} /> : items.length === 0 ? (
        <EmptyState icon={<Star size={40} />} title="Bạn chưa viết đánh giá nào"
          description={`Sau khi nhận ${productLabel.toLowerCase()}, bạn có thể đánh giá từ trang chi tiết đơn hàng.`} actionHref="/account/orders" actionLabel="Xem đơn hàng" />
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="min-w-0 border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/products/${encodeURIComponent(r.productSlug)}#reviews`} className="min-w-0 break-words font-semibold hover:text-accent">{r.productName}</Link>
                <span className={`inline-block shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${reviewStatusTone(r.status)}`}>{reviewStatusLabel(r.status)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={r.rating} />
                <time dateTime={r.createdAt} className="text-sm text-muted">{formatDate(r.createdAt, timezone)}</time>
              </div>
              {r.title ? <p className="mt-2 break-words font-medium">{r.title}</p> : null}
              {r.content ? <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{r.content}</p> : null}
              {r.status === 'Pending' ? <p className="mt-2 text-xs text-muted">Đánh giá sẽ hiển thị công khai sau khi được cửa hàng duyệt.</p> : null}
              {r.status === 'Rejected' ? <p className="mt-2 text-xs text-muted">Đánh giá này không được hiển thị công khai.</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
