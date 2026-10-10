import type { ComponentProps } from 'react'
import type { Badge } from '@/components/ui/primitives'
import type { Dto } from '@/api/types'

export type AdminReview = Dto<'AdminReviewDto'>
export type ReviewStatus = Dto<'ReviewStatus'>

type Tone = NonNullable<ComponentProps<typeof Badge>['tone']>

/** Màu huy hiệu theo trạng thái duyệt; nhãn chữ lấy từ Meta (`ReviewStatus`). */
export const REVIEW_STATUS_TONE: Record<ReviewStatus, Tone> = { Pending: 'warning', Approved: 'success', Rejected: 'danger' }

export function reviewStatusTone(status: string): Tone {
  return (REVIEW_STATUS_TONE as Record<string, Tone>)[status] ?? 'neutral'
}

export interface ReviewFilters {
  page: number
  pageSize: number
  /** Rỗng = tất cả trạng thái. */
  status: string
  /** '' hoặc '1'..'5' (giá trị của <select>). */
  rating: string
  search: string
  sort: { key: string; dir: 'asc' | 'desc' } | null
}

export interface ReviewParams {
  page: number
  pageSize: number
  status?: string
  rating?: number
  q?: string
  sort?: string
}

/** Trạng thái mặc định khi mở trang: việc cần làm là duyệt những đánh giá đang chờ. */
export const DEFAULT_REVIEW_STATUS = 'Pending'

export const REVIEW_SORT_KEYS = ['createdAt', 'rating', 'status'] as const

/** Ghép tham số truy vấn: bỏ giá trị rỗng, số sao không hợp lệ (ngoài 1..5) bị bỏ, sort chỉ nhận trường backend cho phép. */
export function buildReviewParams(f: ReviewFilters): ReviewParams {
  const rating = Number(f.rating)
  const sortOk = f.sort && (REVIEW_SORT_KEYS as readonly string[]).includes(f.sort.key)
  return {
    page: f.page,
    pageSize: f.pageSize,
    status: f.status || undefined,
    rating: f.rating !== '' && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    q: f.search.trim() || undefined,
    sort: sortOk ? `${f.sort!.key}:${f.sort!.dir}` : undefined,
  }
}

export function hasReviewFilters(f: Pick<ReviewFilters, 'status' | 'rating' | 'search'>): boolean {
  return !!f.rating || !!f.search.trim() || f.status !== DEFAULT_REVIEW_STATUS
}

/** Dãy 5 ô sao: true = sao đầy (làm tròn, kẹp trong 0..5). */
export function starCells(rating: number): boolean[] {
  const r = Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0
  return Array.from({ length: 5 }, (_, i) => i < r)
}

/** Nút nhanh theo trạng thái hiện tại: không hiện nút dẫn tới trạng thái đang có. */
export function reviewActions(status: string): { approve: boolean; reject: boolean } {
  return { approve: status !== 'Approved', reject: status !== 'Rejected' }
}

/** Đường dẫn sang danh sách đơn đã lọc theo mã đơn; không có mã thì null. */
export function orderLink(orderNumber: string | null | undefined): string | null {
  const code = orderNumber?.trim()
  return code ? `/orders?q=${encodeURIComponent(code)}` : null
}
