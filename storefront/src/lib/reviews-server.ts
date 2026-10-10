import 'server-only'
import type { PublicReview, RatingSummary } from '@/api/types'
import { apiGet, apiGetPage } from './server-api'
import { REVIEW_PAGE_SIZE } from './reviews'

export interface ReviewsData { summary: RatingSummary | null; reviews: PublicReview[]; total: number }

/**
 * Đánh giá đã duyệt của sản phẩm cho trang chi tiết (đệm ngắn để đánh giá mới duyệt sớm hiện ra).
 * Lỗi tải đánh giá không được làm hỏng cả trang sản phẩm: trả null, trang hiện thông báo trong mục Đánh giá.
 */
export async function loadReviews(slug: string): Promise<ReviewsData | null> {
  const s = encodeURIComponent(slug)
  try {
    const [summary, list] = await Promise.all([
      apiGet<RatingSummary>(`/api/public/products/${s}/rating`, { revalidate: 30 }),
      apiGetPage<PublicReview>(`/api/public/products/${s}/reviews?page=1&pageSize=${REVIEW_PAGE_SIZE}`, { revalidate: 30 }),
    ])
    return { summary, reviews: list.items, total: list.meta.total }
  } catch (e) {
    console.error('Không tải được đánh giá sản phẩm', slug, e)
    return null
  }
}
