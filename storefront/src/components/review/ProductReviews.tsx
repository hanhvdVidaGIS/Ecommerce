import { formatRating, ratingBars } from '@/lib/reviews'
import type { ReviewsData } from '@/lib/reviews-server'
import { ReviewList } from './ReviewList'
import { Stars } from './Stars'
import { WriteReview } from './WriteReview'

function Summary({ summary }: { summary: NonNullable<ReviewsData['summary']> }) {
  const bars = ratingBars(summary.distribution)
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <p className="text-4xl font-bold" aria-hidden>{formatRating(summary.average)}</p>
        <div>
          <Stars value={summary.average} size={20} />
          <p className="text-sm text-muted">{summary.count} đánh giá</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5" aria-label="Phân bố số sao">
        {bars.map((b) => (
          <li key={b.stars} className="flex items-center gap-2 text-sm">
            <span className="w-12 shrink-0 whitespace-nowrap">{b.stars} sao</span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded bg-line" aria-hidden>
              <span className="block h-full bg-accent" style={{ width: `${b.percent}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right text-muted">{b.count}<span className="sr-only"> đánh giá, {b.percent}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Mục "Đánh giá" dưới trang chi tiết: tóm tắt + danh sách (máy chủ dựng cho SEO) và khối viết đánh giá (client). */
export function ProductReviews({ product, data }: { product: { id: string; slug: string }; data: ReviewsData | null }) {
  return (
    <section id="reviews" className="mt-16 scroll-mt-24" aria-labelledby="reviews-h">
      <h2 id="reviews-h" className="mb-6 text-2xl font-bold">Đánh giá</h2>
      {data === null ? (
        <p role="status" className="border border-line bg-subtle p-4 text-sm text-muted">Không tải được đánh giá lúc này. Vui lòng tải lại trang sau ít phút.</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[20rem_1fr] lg:gap-12">
          <div className="min-w-0 space-y-6">
            {data.summary && data.summary.count > 0 ? <Summary summary={data.summary} /> : null}
            <WriteReview productId={product.id} />
          </div>
          <div className="min-w-0"><ReviewList slug={product.slug} initial={data.reviews} total={data.total} /></div>
        </div>
      )}
    </section>
  )
}
