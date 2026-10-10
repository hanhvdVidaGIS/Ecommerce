import { describe, expect, it } from 'vitest'
import { isValidPhone } from './checkout-validation'
import { trackErrorMessage, validateTrack } from './track'

describe('validateTrack', () => {
  it('thiếu trường', () => expect(validateTrack({ orderNumber: ' ', phone: '' }, isValidPhone)).toEqual({ orderNumber: 'Nhập mã đơn hàng.', phone: 'Nhập số điện thoại.' }))
  it('SĐT sai định dạng', () => expect(validateTrack({ orderNumber: 'AB12', phone: '123' }, isValidPhone).phone).toMatch(/không hợp lệ/))
  it('hợp lệ', () => expect(validateTrack({ orderNumber: 'AB12', phone: '0912345678' }, isValidPhone)).toEqual({}))
})

describe('trackErrorMessage', () => {
  it('404 trung tính', () => expect(trackErrorMessage({ status: 404, code: 'not_found', message: 'Không tìm thấy đơn hàng.' })).toMatch(/^Không tìm thấy đơn với thông tin đã nhập/))
  it('429 báo thử lại sau', () => expect(trackErrorMessage({ status: 429, code: 'rate_limited', message: 'x' })).toMatch(/thử lại sau/))
  it('lỗi khác dùng thông báo gốc', () => expect(trackErrorMessage({ status: 500, code: 'x', message: 'Lỗi 500' })).toBe('Lỗi 500'))
})
