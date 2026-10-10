'use client'
import { useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import type { PublicReview } from '@/api/types'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/States'
import { api } from '@/lib/client-api'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { mergeReviews, REVIEW_PAGE_SIZE } from '@/lib/reviews'
import { useSite } from '@/providers/SiteProvider'
import { Stars } from './Stars'

/** Danh sách đánh giá đã duyệt (trang đầu do máy chủ dựng sẵn), "Xem thêm" tải trang kế. Nội dung khách nhập luôn là văn bản thuần. */
export function ReviewList({ slug, initial, total }: { slug: string; initial: PublicReview[]; total: number }) {
  const { timezone, productLabel } = useSite()
  const [items, setItems] = useState(initial)
  const [count, setCount] = useState(total)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  async function more() {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    setError(null)
    try {
      const next = page + 1
      const res = await api.getPage<PublicReview>(`/api/public/products/${encodeURIComponent(slug)}/reviews`, { page: next, pageSize: REVIEW_PAGE_SIZE })
      const merged = mergeReviews(items, res.data)
      setItems(merged)
      setPage(next)
      // Trang rỗng: dừng nút "Xem thêm" thay vì để người dùng bấm mãi.
      setCount(res.data.length === 0 ? merged.length : Math.max(res.meta?.total ?? count, merged.length))
    } catch (e) {
      setError(errorMessage(e, 'Không tải thêm được đánh giá. Vui lòng thử lại.'))
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return <EmptyState icon={<MessageSquare size={36} />} title="Chưa có đánh giá nào" description={`Hãy là người đầu tiên đánh giá ${productLabel.toLowerCase()} này sau khi nhận hàng.`} />
  }

  return (
    <div>
      <ul className="divide-y divide-line border-y border-line" aria-label="Danh sách đánh giá">
        {items.map((r) => (
          <li key={r.id} className="min-w-0 py-5">
            <article>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={r.rating} />
                {r.title ? <h3 className="min-w-0 break-words font-semibold">{r.title}</h3> : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                <span className="break-words font-medium text-ink">{r.authorName}</span> · <time dateTime={r.createdAt}>{formatDate(r.createdAt, timezone)}</time>
              </p>
              {r.content ? <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{r.content}</p> : null}
            </article>
          </li>
        ))}
      </ul>
      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
      {items.length < count ? (
        <div className="mt-6 flex justify-center">
          <button type="button" className="btn btn-outline" onClick={() => void more()} disabled={loading} aria-busy={loading}>
            {loading ? 'Đang tải…' : `Xem thêm đánh giá (${count - items.length})`}
          </button>
        </div>
      ) : null}
    </div>
  )
}
