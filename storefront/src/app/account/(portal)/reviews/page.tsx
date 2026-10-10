import type { Metadata } from 'next'
import { ReviewsClient } from '@/components/account/ReviewsClient'

export const metadata: Metadata = { title: 'Đánh giá của tôi' }

export default function ReviewsPage() {
  return <ReviewsClient />
}
