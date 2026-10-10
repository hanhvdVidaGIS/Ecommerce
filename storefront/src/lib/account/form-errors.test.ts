import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/errors'
import { loginErrorMessage, rateLimitMessage, toFormErrors } from './form-errors'

const FIELDS = ['email', 'password', 'fullName'] as const

describe('toFormErrors', () => {
  it('gắn lỗi theo trường, không phân biệt hoa thường', () => {
    const e = new ApiError(400, 'validation_failed', 'Dữ liệu không hợp lệ.', [
      { field: 'email', message: 'Email không hợp lệ.' },
      { field: 'FullName', message: 'Họ tên là bắt buộc.' },
    ])
    expect(toFormErrors(e, FIELDS)).toEqual({ fields: { email: 'Email không hợp lệ.', fullName: 'Họ tên là bắt buộc.' } })
  })

  it('trường lạ thành lỗi chung bằng thông báo máy chủ', () => {
    const e = new ApiError(400, 'validation_failed', 'Dữ liệu không hợp lệ.', [{ field: 'zzz', message: 'x' }])
    expect(toFormErrors(e, FIELDS)).toEqual({ fields: {}, general: 'Dữ liệu không hợp lệ.' })
  })

  it('có cả trường khớp và trường lạ: giữ cả hai', () => {
    const e = new ApiError(400, 'validation_failed', 'Dữ liệu không hợp lệ.', [{ field: 'email', message: 'a' }, { field: 'zzz', message: 'b' }])
    const r = toFormErrors(e, FIELDS)
    expect(r.fields).toEqual({ email: 'a' })
    expect(r.general).toBe('Dữ liệu không hợp lệ.')
  })

  it('mã lỗi nghiệp vụ gắn vào trường chỉ định (email_taken -> email)', () => {
    const e = new ApiError(409, 'email_taken', 'Email đã được sử dụng.')
    expect(toFormErrors(e, FIELDS, { codeToField: { email_taken: 'email' } })).toEqual({ fields: { email: 'Email đã được sử dụng.' } })
  })

  it('lỗi không phải ApiError dùng thông báo dự phòng', () => {
    expect(toFormErrors(new Error('boom'), FIELDS, { fallback: 'Lỗi!' })).toEqual({ fields: {}, general: 'Lỗi!' })
  })

  it('không có chi tiết: lỗi chung', () => {
    expect(toFormErrors(new ApiError(500, 'x', 'Máy chủ lỗi.'), FIELDS)).toEqual({ fields: {}, general: 'Máy chủ lỗi.' })
  })
})

describe('loginErrorMessage', () => {
  const generic = 'Email hoặc mật khẩu không đúng.'
  it('sai thông tin luôn một câu chung (không lộ email tồn tại hay không)', () => {
    expect(loginErrorMessage(new ApiError(401, 'invalid_credentials', 'bất kỳ'))).toBe(generic)
    expect(loginErrorMessage(new ApiError(401, 'unauthorized', 'khác'))).toBe(generic)
  })
  it('429 và khoá tạm có thông báo riêng', () => {
    expect(loginErrorMessage(new ApiError(429, 'rate_limited', 'x'))).toMatch(/quá nhiều lần/)
    expect(loginErrorMessage(new ApiError(423, 'account_locked', 'x'))).toMatch(/tạm khoá/)
    expect(loginErrorMessage(new ApiError(403, 'account_disabled', 'x'))).toMatch(/bị khoá/)
  })
  it('mất mạng giữ thông báo mạng; lỗi lạ dùng câu dự phòng', () => {
    expect(loginErrorMessage(new ApiError(0, 'network_error', 'Không kết nối được máy chủ.'))).toBe('Không kết nối được máy chủ.')
    expect(loginErrorMessage('?')).toMatch(/Đã có lỗi/)
  })
})

describe('rateLimitMessage', () => {
  it('nhận 429 theo status hoặc mã', () => {
    expect(rateLimitMessage(new ApiError(429, 'x', 'm'))).not.toBeNull()
    expect(rateLimitMessage(new ApiError(400, 'rate_limited', 'm'))).not.toBeNull()
    expect(rateLimitMessage(new ApiError(400, 'x', 'm'))).toBeNull()
  })
})
