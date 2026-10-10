import type { Dto } from '@/api/types'

/** Logic thuần của đánh giá sản phẩm (không phụ thuộc React): dễ kiểm thử. */
export type ReviewStatus = Dto<'ReviewStatus'>
export type Eligibility = Dto<'ReviewEligibilityDto'>

export const REVIEW_TITLE_MAX = 200
export const REVIEW_CONTENT_MAX = 4000
export const REVIEW_PAGE_SIZE = 10
/** Số đánh giá đưa vào JSON-LD (đủ cho kết quả tìm kiếm, không phình trang). */
export const REVIEW_LD_LIMIT = 5

export interface RatingBar { stars: number; count: number; percent: number }

/** Phân bố (index 0 = 1 sao) -> các thanh 5→1 sao với phần trăm 0–100. Không có đánh giá: mọi thanh 0% (không chia cho 0). */
export function ratingBars(distribution: readonly number[] | null | undefined): RatingBar[] {
  const counts = [1, 2, 3, 4, 5].map((_, i) => Math.max(0, Math.floor(Number(distribution?.[i]) || 0)))
  const total = counts.reduce((a, b) => a + b, 0)
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = counts[stars - 1]
    return { stars, count, percent: total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0 }
  })
}

/** Làm tròn điểm trung bình 1 chữ số thập phân, kẹp trong 0–5. */
export function roundRating(average: number | null | undefined): number {
  const n = Number(average)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(5, Math.round(n * 10) / 10)
}

/** "4,5" theo kiểu Việt Nam; số nguyên giữ một chữ số lẻ để các thẻ đều nhau ("4,0"). */
export function formatRating(average: number | null | undefined): string {
  return roundRating(average).toFixed(1).replace('.', ',')
}

/** Phần trăm bề rộng lớp sao tô màu (0–100) cho điểm có phần lẻ. */
export function starFillPercent(value: number | null | undefined): number {
  return Math.round((roundRating(value) / 5) * 100)
}

/** Văn bản thay thế của hàng sao, ví dụ "4/5 sao", "4,5/5 sao". */
export function starsLabel(value: number | null | undefined): string {
  const r = roundRating(value)
  return `${Number.isInteger(r) ? r : String(r).replace('.', ',')}/5 sao`
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { Pending: 'Chờ duyệt', Approved: 'Đã đăng', Rejected: 'Bị ẩn' }
export function reviewStatusLabel(s: ReviewStatus): string { return REVIEW_STATUS_LABELS[s] ?? String(s) }
export function reviewStatusTone(s: ReviewStatus): string {
  return s === 'Approved' ? 'bg-success/10 text-success' : s === 'Rejected' ? 'bg-danger/10 text-danger' : 'bg-subtle text-ink'
}

export interface ReviewInput { rating: number; title: string; content: string }
export interface ReviewErrors { rating?: string; title?: string; content?: string }
export type ReviewValidation =
  | { ok: true; value: { rating: number; title: string | null; content: string | null } }
  | { ok: false; errors: ReviewErrors }

/** Kiểm tra form viết đánh giá: bắt buộc 1–5 sao nguyên; tiêu đề ≤200, nội dung ≤4000 (sau khi bỏ khoảng trắng hai đầu); rỗng thì gửi null. */
export function validateReview(input: ReviewInput): ReviewValidation {
  const errors: ReviewErrors = {}
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) errors.rating = 'Vui lòng chọn số sao từ 1 đến 5.'
  const title = input.title.trim()
  const content = input.content.trim()
  if (title.length > REVIEW_TITLE_MAX) errors.title = `Tiêu đề tối đa ${REVIEW_TITLE_MAX} ký tự.`
  if (content.length > REVIEW_CONTENT_MAX) errors.content = `Nội dung tối đa ${REVIEW_CONTENT_MAX} ký tự.`
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { rating: input.rating, title: title || null, content: content || null } }
}

export type EligibilityView = 'form' | 'pending' | 'published' | 'hidden' | 'not_purchased'

/** Từ kết quả kiểm tra quyền đánh giá suy ra giao diện cần hiện. */
export function eligibilityView(e: Eligibility | null | undefined): EligibilityView {
  if (!e) return 'not_purchased'
  if (e.canReview) return 'form'
  if (e.reason === 'already_reviewed' || e.existingStatus) {
    return e.existingStatus === 'Approved' ? 'published' : e.existingStatus === 'Rejected' ? 'hidden' : 'pending'
  }
  return 'not_purchased'
}

/** Gộp trang đánh giá mới vào danh sách cũ, bỏ trùng theo id (đánh giá mới đăng giữa hai lần tải làm lệch trang). */
export function mergeReviews<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  const seen = new Set(current.map((r) => r.id))
  return [...current, ...incoming.filter((r) => !seen.has(r.id))]
}
