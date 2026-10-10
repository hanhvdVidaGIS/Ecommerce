import { beforeEach, describe, expect, it } from 'vitest'
import type { Order } from '@/api/types'
import { prefillForUser } from './checkout-prefill'
import { readLastOrder, saveLastOrder, setCartNotice, takeCartNotice } from './checkout-session'
import { needsBankTransfer, orderStatusLabel, paymentStatusLabel } from './order-labels'

const order = { orderNumber: 'ABC123', items: [], status: 'Pending', paymentStatus: 'Unpaid', bankTransfer: { transferContent: 'ABC123' } } as unknown as Order

describe('phiên thanh toán (sessionStorage)', () => {
  beforeEach(() => sessionStorage.clear())
  it('chỉ trả đơn khi mã khớp (không phân biệt hoa thường)', () => {
    saveLastOrder(order)
    expect(readLastOrder('abc123')?.orderNumber).toBe('ABC123')
    expect(readLastOrder('ZZZ999')).toBeNull()
    expect(readLastOrder(null)).toBeNull()
  })
  it('dữ liệu hỏng thì coi như không có', () => {
    sessionStorage.setItem('ccp_last_order', '{không phải json')
    expect(readLastOrder('ABC123')).toBeNull()
  })
  it('thông báo giỏ hàng chỉ đọc được một lần', () => {
    setCartNotice('Hết hàng')
    expect(takeCartNotice()).toBe('Hết hàng')
    expect(takeCartNotice()).toBeNull()
  })
})

describe('nhãn đơn hàng', () => {
  it('nhãn tiếng Việt và giá trị lạ giữ nguyên', () => {
    expect(orderStatusLabel('Shipping')).toBe('Đang giao')
    expect(paymentStatusLabel('Unpaid')).toBe('Chưa thanh toán')
    expect(orderStatusLabel('Mới')).toBe('Mới')
  })
  it('hướng dẫn chuyển khoản chỉ khi chưa trả tiền và đơn còn hiệu lực', () => {
    expect(needsBankTransfer(order)).toBe(true)
    expect(needsBankTransfer({ ...order, paymentStatus: 'Paid' })).toBe(false)
    expect(needsBankTransfer({ ...order, status: 'Cancelled' })).toBe(false)
    expect(needsBankTransfer({ ...order, bankTransfer: null })).toBe(false)
  })
})

describe('prefillForUser', () => {
  const user = { id: 'u', email: 'a@b.vn', fullName: 'An', phoneNumber: '0912345678', roles: [], permissions: [] }
  const addr = (id: string, isDefault: boolean) => ({ id, receiverName: 'Bình', phone: '0987654321', addressLine: 'Số 1', provinceCode: '01', provinceName: 'Hà Nội', wardCode: '00001', wardName: 'P', isDefault })
  it('khách chưa đăng nhập: không điền gì', () => expect(prefillForUser(null, [])).toEqual({}))
  it('không có địa chỉ: dùng thông tin tài khoản', () => expect(prefillForUser(user, [])).toEqual({ customerName: 'An', email: 'a@b.vn', phone: '0912345678' }))
  it('có địa chỉ mặc định: địa chỉ đè họ tên/SĐT', () => {
    const p = prefillForUser(user, [addr('1', false), addr('2', true)])
    expect(p).toMatchObject({ customerName: 'Bình', phone: '0987654321', addressLine: 'Số 1', provinceCode: '01', wardCode: '00001', email: 'a@b.vn' })
  })
})
