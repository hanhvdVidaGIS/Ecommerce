import type { Dto } from '@/api/types'

type BannerLike = Pick<Dto<'BannerDto'>, 'status' | 'isLive' | 'startAt' | 'endAt'>

export type BannerSchedule = 'live' | 'scheduled' | 'expired' | 'draft'

export const SCHEDULE_LABEL: Record<BannerSchedule, string> = {
  live: 'Đang hiển thị',
  scheduled: 'Chưa tới hạn',
  expired: 'Hết hạn',
  draft: 'Nháp',
}

export const SCHEDULE_TONE: Record<BannerSchedule, 'success' | 'info' | 'warning' | 'neutral'> = {
  live: 'success',
  scheduled: 'info',
  expired: 'warning',
  draft: 'neutral',
}

/**
 * Suy trạng thái lịch của banner. `isLive` do backend tính theo giờ máy chủ nên được ưu tiên;
 * khi không live thì dựa vào ngày để biết là chưa tới hạn hay đã hết hạn.
 */
export function bannerSchedule(b: BannerLike, now: Date = new Date()): BannerSchedule {
  if (b.status !== 'Published') return 'draft'
  if (b.isLive) return 'live'
  const start = b.startAt ? new Date(b.startAt).getTime() : null
  const end = b.endAt ? new Date(b.endAt).getTime() : null
  if (start !== null && start > now.getTime()) return 'scheduled'
  if (end !== null && end < now.getTime()) return 'expired'
  // Đã xuất bản, nằm trong khoảng thời gian nhưng backend chưa coi là live (lệch đồng hồ): coi là đang hiển thị.
  return 'live'
}

/**
 * Kiểm tra ngày kết thúc phải sau ngày bắt đầu (giá trị của <input type="datetime-local">).
 * Trả thông báo lỗi hoặc null. Chỉ kiểm tra khi có đủ cả hai.
 */
export function validateDateRange(startLocal: string, endLocal: string): string | null {
  if (!startLocal || !endLocal) return null
  const start = new Date(startLocal).getTime()
  const end = new Date(endLocal).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return end > start ? null : 'Ngày kết thúc phải sau ngày bắt đầu.'
}
