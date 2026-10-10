import { describe, expect, it } from 'vitest'
import { formatBytes, formatMoney, fromLocalInput, toLocalInput } from './format'

describe('formatMoney', () => {
  it('định dạng VND không có số lẻ và có ký hiệu', () => {
    expect(formatMoney(1950000)).toMatch(/1\.950\.000/)
    expect(formatMoney(1950000)).toMatch(/₫/)
  })
  it('hiển thị gạch ngang khi không có giá trị', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
  })
  it('rơi về chuỗi an toàn khi mã tiền tệ không hợp lệ', () => {
    expect(formatMoney(10, 'KHONGCO')).toContain('10')
  })
})

describe('formatBytes', () => {
  it.each([[512, '512 B'], [2048, '2.0 KB'], [5 * 1024 * 1024, '5.0 MB']])('%i → %s', (n, expected) => expect(formatBytes(n)).toBe(expected))
})

describe('datetime-local ↔ ISO', () => {
  it('đi vòng không đổi giá trị (đến phút)', () => {
    const iso = fromLocalInput('2026-10-09T14:30')!
    expect(toLocalInput(iso)).toBe('2026-10-09T14:30')
  })
  it('chuỗi rỗng hoặc sai định dạng cho giá trị rỗng/null', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('khong-phai-ngay')).toBeNull()
    expect(toLocalInput(null)).toBe('')
    expect(toLocalInput('khong-phai-ngay')).toBe('')
  })
})
