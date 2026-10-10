import { describe, expect, it } from 'vitest'
import { bannerSchedule, validateDateRange } from './schedule'

const NOW = new Date('2026-10-09T05:00:00Z')
const base = { status: 'Published' as const, isLive: true, startAt: null, endAt: null }

describe('bannerSchedule', () => {
  it('nháp luôn là "draft", kể cả khi trong khoảng thời gian', () => {
    expect(bannerSchedule({ ...base, status: 'Draft', isLive: false }, NOW)).toBe('draft')
    expect(bannerSchedule({ ...base, status: 'Draft', startAt: '2026-10-01T00:00:00Z', endAt: '2026-10-30T00:00:00Z' }, NOW)).toBe('draft')
  })

  it('đã xuất bản, không giới hạn thời gian => đang hiển thị', () => {
    expect(bannerSchedule(base, NOW)).toBe('live')
  })

  it('chưa tới ngày bắt đầu => chưa tới hạn', () => {
    expect(bannerSchedule({ ...base, isLive: false, startAt: '2026-10-10T00:00:00Z', endAt: '2026-10-20T00:00:00Z' }, NOW)).toBe('scheduled')
    expect(bannerSchedule({ ...base, isLive: false, startAt: '2026-10-10T00:00:00Z' }, NOW)).toBe('scheduled')
  })

  it('đã qua ngày kết thúc => hết hạn', () => {
    expect(bannerSchedule({ ...base, isLive: false, startAt: '2026-09-01T00:00:00Z', endAt: '2026-10-01T00:00:00Z' }, NOW)).toBe('expired')
    expect(bannerSchedule({ ...base, isLive: false, endAt: '2026-10-09T04:59:59Z' }, NOW)).toBe('expired')
  })

  it('isLive do backend tính được ưu tiên khi đang nằm trong khoảng', () => {
    expect(bannerSchedule({ ...base, isLive: true, startAt: '2026-10-01T00:00:00Z', endAt: '2026-10-30T00:00:00Z' }, NOW)).toBe('live')
  })

  it('đúng ngay mốc bắt đầu/kết thúc vẫn tính là đang hiển thị (cùng quy tắc <=, >= của backend)', () => {
    expect(bannerSchedule({ ...base, isLive: false, startAt: NOW.toISOString() }, NOW)).toBe('live')
    expect(bannerSchedule({ ...base, isLive: false, endAt: NOW.toISOString() }, NOW)).toBe('live')
  })
})

describe('validateDateRange', () => {
  it('chấp nhận khi thiếu một đầu', () => {
    expect(validateDateRange('', '')).toBeNull()
    expect(validateDateRange('2026-10-09T10:00', '')).toBeNull()
    expect(validateDateRange('', '2026-10-09T10:00')).toBeNull()
  })

  it('kết thúc phải sau bắt đầu', () => {
    expect(validateDateRange('2026-10-09T10:00', '2026-10-10T10:00')).toBeNull()
    expect(validateDateRange('2026-10-09T10:00', '2026-10-09T10:00')).toMatch(/sau ngày bắt đầu/)
    expect(validateDateRange('2026-10-09T10:00', '2026-10-08T10:00')).toMatch(/sau ngày bắt đầu/)
  })
})
