import { describe, expect, it } from 'vitest'
import { amountToFreeShip, checkoutGate, clampQuantity, estimateTotal, issueMessage } from './cart-logic'

const item = (issue: string | null = null) => ({ id: 'l', issue, maxQuantity: 5 }) as never

describe('checkoutGate', () => {
  it('giỏ trống hoặc chưa tải: không cho thanh toán', () => {
    expect(checkoutGate(null, false).allowed).toBe(false)
    expect(checkoutGate({ items: [], hasIssues: false }, false).allowed).toBe(false)
  })
  it('có vấn đề: vô hiệu', () => expect(checkoutGate({ items: [item('out_of_stock')], hasIssues: true }, false).allowed).toBe(false))
  it('đang đồng bộ thay đổi: vô hiệu', () => expect(checkoutGate({ items: [item()], hasIssues: false }, true).allowed).toBe(false))
  it('giỏ ổn: cho phép', () => expect(checkoutGate({ items: [item()], hasIssues: false }, false)).toEqual({ allowed: true, reason: null }))
})

describe('clampQuantity', () => {
  it('giữ trong [1, maxQuantity]', () => {
    expect(clampQuantity(0, 5)).toBe(1)
    expect(clampQuantity(3, 5)).toBe(3)
    expect(clampQuantity(9, 5)).toBe(5)
  })
  it('trần chung 99 và maxQuantity=0 (không rõ) dùng trần chung', () => {
    expect(clampQuantity(500, 200)).toBe(99)
    expect(clampQuantity(50, 0)).toBe(50)
  })
  it('giá trị không hợp lệ về 1', () => expect(clampQuantity(Number.NaN, 5)).toBe(1))
})

describe('issueMessage', () => {
  it('không có vấn đề thì không có thông báo', () => expect(issueMessage({ issue: null, maxQuantity: 3 })).toBeNull())
  it('insufficient_stock nêu số còn lại', () => expect(issueMessage({ issue: 'insufficient_stock', maxQuantity: 3 })).toContain('3'))
  it('unavailable/out_of_stock hướng dẫn xoá', () => {
    expect(issueMessage({ issue: 'unavailable', maxQuantity: 0 })).toMatch(/xoá/)
    expect(issueMessage({ issue: 'out_of_stock', maxQuantity: 0 })).toMatch(/xoá/)
  })
})

describe('estimateTotal / amountToFreeShip', () => {
  it('tổng = tạm tính - giảm + ship, không âm', () => {
    expect(estimateTotal({ subtotal: 1_000_000, discount: 100_000, shippingFee: 30_000 })).toBe(930_000)
    expect(estimateTotal({ subtotal: 50_000, discount: 80_000, shippingFee: 0 })).toBe(0)
  })
  it('còn thiếu bao nhiêu để miễn phí ship', () => {
    expect(amountToFreeShip({ fee: 30_000, amountToFreeShip: 200_000 }, false)).toBe(200_000)
    expect(amountToFreeShip({ fee: 0, amountToFreeShip: null }, false)).toBeNull()
    expect(amountToFreeShip({ fee: 30_000, amountToFreeShip: 200_000 }, true)).toBeNull()
    expect(amountToFreeShip(null, false)).toBeNull()
  })
})
