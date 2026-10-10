import { describe, expect, it } from 'vitest'
import { FIELD_ORDER, firstErrorField, mapCheckoutError, normalizePhone, toCheckoutRequest, toFormField, validateCheckout, type CheckoutValues } from './checkout-validation'

const valid: CheckoutValues = { customerName: 'QA Nguyễn Văn A', phone: '0912345678', email: '', addressLine: '12 Hàng Bài', provinceCode: '01', wardCode: '00001', note: '', paymentMethod: 'Cod' }
const err = (status: number, code: string, message = 'm', details: { field: string; message: string }[] = []) => ({ status, code, message, details })

describe('normalizePhone', () => {
  it.each([
    ['0912345678', '0912345678'],
    ['091 234 5678', '0912345678'],
    ['091.234.5678', '0912345678'],
    ['+84912345678', '0912345678'],
    ['84912345678', '0912345678'],
    ['0312345678', '0312345678'],
  ])('chấp nhận %s', (raw, expected) => expect(normalizePhone(raw)).toBe(expected))

  it.each(['', '   ', '091234567', '09123456789', '0212345678', '0112345678', 'abcdefghij', '+8491234567', '09123+45678', '1912345678', '+840912345678'])('từ chối "%s"', (raw) => expect(normalizePhone(raw)).toBeNull())
})

describe('validateCheckout', () => {
  it('form hợp lệ không có lỗi', () => expect(validateCheckout(valid)).toEqual({}))
  it('form rỗng báo đủ các trường bắt buộc', () => {
    const e = validateCheckout({ ...valid, customerName: ' ', phone: '', addressLine: '', provinceCode: '', wardCode: '', paymentMethod: '' })
    expect(Object.keys(e).sort()).toEqual(['addressLine', 'customerName', 'paymentMethod', 'phone', 'provinceCode', 'wardCode'])
  })
  it('SĐT sai báo lỗi tại phone', () => expect(validateCheckout({ ...valid, phone: '12345' }).phone).toMatch(/không hợp lệ/))
  it('giới hạn độ dài: tên 200, địa chỉ 300, ghi chú 1000', () => {
    expect(validateCheckout({ ...valid, customerName: 'a'.repeat(200) }).customerName).toBeUndefined()
    expect(validateCheckout({ ...valid, customerName: 'a'.repeat(201) }).customerName).toBeDefined()
    expect(validateCheckout({ ...valid, addressLine: 'a'.repeat(300) }).addressLine).toBeUndefined()
    expect(validateCheckout({ ...valid, addressLine: 'a'.repeat(301) }).addressLine).toBeDefined()
    expect(validateCheckout({ ...valid, note: 'a'.repeat(1000) }).note).toBeUndefined()
    expect(validateCheckout({ ...valid, note: 'a'.repeat(1001) }).note).toBeDefined()
  })
  it('email tuỳ chọn nhưng nếu nhập phải đúng dạng', () => {
    expect(validateCheckout({ ...valid, email: '' }).email).toBeUndefined()
    expect(validateCheckout({ ...valid, email: 'a@b.vn' }).email).toBeUndefined()
    expect(validateCheckout({ ...valid, email: 'khong-phai-email' }).email).toBeDefined()
  })
  it('phương thức thanh toán phải nằm trong danh sách đang bật', () => {
    expect(validateCheckout({ ...valid, paymentMethod: 'BankTransfer' }, ['Cod']).paymentMethod).toBeDefined()
    expect(validateCheckout({ ...valid, paymentMethod: 'Cod' }, ['Cod']).paymentMethod).toBeUndefined()
  })
  it('firstErrorField theo thứ tự trên form', () => {
    expect(firstErrorField({ addressLine: 'x', phone: 'y' })).toBe('phone')
    expect(firstErrorField({})).toBeUndefined()
    expect(FIELD_ORDER).toHaveLength(8)
  })
})

describe('toCheckoutRequest', () => {
  it('cắt khoảng trắng và đổi chuỗi rỗng thành null', () => {
    const r = toCheckoutRequest({ ...valid, customerName: '  An ', email: ' ', note: '' })
    expect(r.customerName).toBe('An')
    expect(r.email).toBeNull()
    expect(r.note).toBeNull()
  })
})

describe('mapCheckoutError', () => {
  it('lỗi validation theo trường (không phân biệt hoa thường, tiền tố $.)', () => {
    const f = mapCheckoutError(err(400, 'validation_failed', 'Dữ liệu không hợp lệ.', [{ field: 'Phone', message: 'Số điện thoại không hợp lệ.' }, { field: '$.wardCode', message: 'Chọn phường/xã.' }, { field: 'unknown', message: 'x' }]))
    expect(f.fieldErrors).toEqual({ phone: 'Số điện thoại không hợp lệ.', wardCode: 'Chọn phường/xã.' })
    expect(f.backToCart).toBe(false)
  })
  it('stock_changed: về giỏ hàng, kèm chi tiết từng dòng', () => {
    const f = mapCheckoutError(err(409, 'stock_changed', 'Một số sản phẩm không đủ.', [{ field: 'items[0]', message: 'Áo chỉ còn 1.' }]))
    expect(f.backToCart).toBe(true)
    expect(f.message).toContain('Áo chỉ còn 1.')
    expect(f.fieldErrors).toEqual({})
  })
  it.each(['coupon_invalid', 'coupon_not_started', 'coupon_expired', 'coupon_min_order', 'coupon_exhausted', 'coupon_user_limit', 'out_of_stock', 'cart_empty'])('%s: về giỏ hàng', (code) => {
    expect(mapCheckoutError(err(code === 'coupon_exhausted' ? 409 : 400, code, 'msg')).backToCart).toBe(true)
  })
  it('429 và csrf_failed ở lại form với thông báo riêng', () => {
    const a = mapCheckoutError(err(429, 'rate_limited'))
    expect(a.backToCart).toBe(false)
    expect(a.message).toMatch(/thử lại sau/)
    expect(mapCheckoutError(err(403, 'csrf_failed')).message).toMatch(/tải lại trang/)
  })
  it('lỗi không rõ trường dùng thông báo của máy chủ', () => expect(mapCheckoutError(err(500, 'unknown_error', 'Lỗi 500')).message).toBe('Lỗi 500'))
  it('toFormField nhận diện đủ tên trường backend', () => {
    for (const f of ['customerName', 'phone', 'email', 'addressLine', 'provinceCode', 'wardCode', 'paymentMethod', 'note']) expect(toFormField(f)).toBe(f)
    expect(toFormField('items[0]')).toBeUndefined()
  })
})
