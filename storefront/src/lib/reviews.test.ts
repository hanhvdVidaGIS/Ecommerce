import { describe, expect, it } from 'vitest'
import {
  eligibilityView, formatRating, mergeReviews, ratingBars, reviewStatusLabel, roundRating, starFillPercent, starsLabel, validateReview,
} from './reviews'

describe('ratingBars', () => {
  it('xếp 5→1 sao và tính phần trăm', () => {
    const bars = ratingBars([0, 0, 1, 1, 2]) // 1 sao..5 sao, tổng 4
    expect(bars.map((b) => b.stars)).toEqual([5, 4, 3, 2, 1])
    expect(bars.map((b) => b.count)).toEqual([2, 1, 1, 0, 0])
    expect(bars.map((b) => b.percent)).toEqual([50, 25, 25, 0, 0])
  })
  it('0 đánh giá: mọi thanh 0%, không NaN', () => {
    for (const d of [[0, 0, 0, 0, 0], [], null, undefined]) {
      expect(ratingBars(d).every((b) => b.percent === 0 && b.count === 0)).toBe(true)
    }
  })
  it('một loại sao duy nhất = 100%; số âm/lạ bị coi là 0', () => {
    expect(ratingBars([0, 0, 0, 0, 7])[0].percent).toBe(100)
    expect(ratingBars([-3, Number.NaN, 0, 0, 0]).every((b) => b.percent === 0)).toBe(true)
  })
})

describe('roundRating / formatRating / starsLabel', () => {
  it('làm tròn 1 chữ số, kẹp 0–5', () => {
    expect(roundRating(4.26)).toBe(4.3)
    expect(roundRating(4.24)).toBe(4.2)
    expect(roundRating(7)).toBe(5)
    expect(roundRating(-1)).toBe(0)
    expect(roundRating(Number.NaN)).toBe(0)
    expect(roundRating(null)).toBe(0)
  })
  it('định dạng kiểu Việt Nam và nhãn thay thế', () => {
    expect(formatRating(4.5)).toBe('4,5')
    expect(formatRating(4)).toBe('4,0')
    expect(starsLabel(4)).toBe('4/5 sao')
    expect(starsLabel(4.5)).toBe('4,5/5 sao')
    expect(starsLabel(0)).toBe('0/5 sao')
  })
  it('phần trăm tô sao', () => {
    expect(starFillPercent(5)).toBe(100)
    expect(starFillPercent(2.5)).toBe(50)
    expect(starFillPercent(0)).toBe(0)
  })
})

describe('reviewStatusLabel', () => {
  it('ánh xạ Pending/Approved/Rejected', () => {
    expect(reviewStatusLabel('Pending')).toBe('Chờ duyệt')
    expect(reviewStatusLabel('Approved')).toBe('Đã đăng')
    expect(reviewStatusLabel('Rejected')).toBe('Bị ẩn')
  })
})

describe('validateReview', () => {
  it('bắt buộc 1–5 sao nguyên', () => {
    for (const rating of [0, 6, 2.5, Number.NaN, -1]) {
      const r = validateReview({ rating, title: '', content: '' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.rating).toBeTruthy()
    }
    for (const rating of [1, 3, 5]) expect(validateReview({ rating, title: '', content: '' }).ok).toBe(true)
  })
  it('giới hạn độ dài sau khi cắt khoảng trắng; rỗng -> null', () => {
    const ok = validateReview({ rating: 5, title: '  Tuyệt  ', content: '   ' })
    expect(ok).toEqual({ ok: true, value: { rating: 5, title: 'Tuyệt', content: null } })
    expect(validateReview({ rating: 5, title: 'a'.repeat(200), content: 'b'.repeat(4000) }).ok).toBe(true)
    const bad = validateReview({ rating: 5, title: 'a'.repeat(201), content: 'b'.repeat(4001) })
    expect(bad.ok).toBe(false)
    if (!bad.ok) { expect(bad.errors.title).toBeTruthy(); expect(bad.errors.content).toBeTruthy(); expect(bad.errors.rating).toBeUndefined() }
    expect(validateReview({ rating: 5, title: ` ${'a'.repeat(200)} `, content: '' }).ok).toBe(true)
  })
})

describe('eligibilityView', () => {
  it('chọn đúng giao diện', () => {
    expect(eligibilityView({ canReview: true, reason: null, existingStatus: null })).toBe('form')
    expect(eligibilityView({ canReview: false, reason: 'already_reviewed', existingStatus: 'Pending' })).toBe('pending')
    expect(eligibilityView({ canReview: false, reason: 'already_reviewed', existingStatus: 'Approved' })).toBe('published')
    expect(eligibilityView({ canReview: false, reason: 'already_reviewed', existingStatus: 'Rejected' })).toBe('hidden')
    expect(eligibilityView({ canReview: false, reason: 'not_purchased', existingStatus: null })).toBe('not_purchased')
    expect(eligibilityView(null)).toBe('not_purchased')
  })
})

describe('mergeReviews', () => {
  it('bỏ trùng theo id, giữ thứ tự', () => {
    expect(mergeReviews([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})
