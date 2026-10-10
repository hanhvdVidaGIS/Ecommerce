import { describe, expect, it } from 'vitest'
import { buildReviewParams, hasReviewFilters, orderLink, reviewActions, reviewStatusTone, starCells, type ReviewFilters } from './model'

const base: ReviewFilters = { page: 1, pageSize: 20, status: 'Pending', rating: '', search: '', sort: null }

describe('buildReviewParams', () => {
  it('bỏ giá trị rỗng, giữ trạng thái mặc định', () => {
    expect(buildReviewParams(base)).toEqual({ page: 1, pageSize: 20, status: 'Pending', rating: undefined, q: undefined, sort: undefined })
  })
  it('"Tất cả" gửi không có status', () => {
    expect(buildReviewParams({ ...base, status: '' }).status).toBeUndefined()
  })
  it('số sao hợp lệ chuyển thành số; ngoài 1..5 hoặc không phải số nguyên bị bỏ', () => {
    expect(buildReviewParams({ ...base, rating: '4' }).rating).toBe(4)
    for (const bad of ['0', '6', '2.5', 'abc', '']) expect(buildReviewParams({ ...base, rating: bad }).rating).toBeUndefined()
  })
  it('tìm kiếm được cắt khoảng trắng', () => {
    expect(buildReviewParams({ ...base, search: '  thơm  ' }).q).toBe('thơm')
    expect(buildReviewParams({ ...base, search: '   ' }).q).toBeUndefined()
  })
  it('sort chỉ nhận trường backend cho phép', () => {
    expect(buildReviewParams({ ...base, sort: { key: 'rating', dir: 'desc' } }).sort).toBe('rating:desc')
    expect(buildReviewParams({ ...base, sort: { key: 'authorName', dir: 'asc' } }).sort).toBeUndefined()
  })
})

describe('hasReviewFilters', () => {
  it('mặc định (Chờ duyệt, không lọc) là chưa lọc', () => {
    expect(hasReviewFilters(base)).toBe(false)
  })
  it('đổi trạng thái, chọn sao hoặc tìm kiếm là đang lọc', () => {
    expect(hasReviewFilters({ ...base, status: '' })).toBe(true)
    expect(hasReviewFilters({ ...base, status: 'Approved' })).toBe(true)
    expect(hasReviewFilters({ ...base, rating: '5' })).toBe(true)
    expect(hasReviewFilters({ ...base, search: 'x' })).toBe(true)
    expect(hasReviewFilters({ ...base, search: '  ' })).toBe(false)
  })
})

describe('starCells', () => {
  it('đủ 5 ô, đầy theo số sao', () => {
    expect(starCells(3)).toEqual([true, true, true, false, false])
    expect(starCells(5)).toEqual([true, true, true, true, true])
  })
  it('giá trị ngoài khoảng được kẹp, NaN là 0', () => {
    expect(starCells(9).filter(Boolean)).toHaveLength(5)
    expect(starCells(-2).filter(Boolean)).toHaveLength(0)
    expect(starCells(Number.NaN).filter(Boolean)).toHaveLength(0)
    expect(starCells(3.6).filter(Boolean)).toHaveLength(4)
  })
})

describe('thao tác nhanh và liên kết', () => {
  it('không hiện nút dẫn tới đúng trạng thái đang có', () => {
    expect(reviewActions('Pending')).toEqual({ approve: true, reject: true })
    expect(reviewActions('Approved')).toEqual({ approve: false, reject: true })
    expect(reviewActions('Rejected')).toEqual({ approve: true, reject: false })
  })
  it('màu trạng thái', () => {
    expect(reviewStatusTone('Pending')).toBe('warning')
    expect(reviewStatusTone('Approved')).toBe('success')
    expect(reviewStatusTone('Rejected')).toBe('danger')
    expect(reviewStatusTone('?')).toBe('neutral')
  })
  it('liên kết đơn mã hoá ký tự đặc biệt, không có mã thì null', () => {
    expect(orderLink('OD261010-CRXZT')).toBe('/orders?q=OD261010-CRXZT')
    expect(orderLink('A&B #1')).toBe('/orders?q=A%26B%20%231')
    expect(orderLink(null)).toBeNull()
    expect(orderLink('  ')).toBeNull()
  })
})
