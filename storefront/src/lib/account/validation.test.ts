import { describe, expect, it } from 'vitest'
import { emailError, hasErrors, validateChangePassword, validateLogin, validateRegister, validateReset } from './validation'

describe('emailError', () => {
  it('hợp lệ / không hợp lệ', () => {
    expect(emailError('qa.sf.1@example.test')).toBeNull()
    expect(emailError('  a@b.co ')).toBeNull()
    for (const bad of ['', '  ', 'abc', 'a@b', 'a b@c.d', '@x.com']) expect(emailError(bad)).not.toBeNull()
    expect(emailError('a'.repeat(251) + '@b.co')).not.toBeNull()
  })
})

describe('validateLogin', () => {
  it('cần email hợp lệ và mật khẩu', () => {
    expect(validateLogin({ email: 'a@b.co', password: 'x' })).toEqual({})
    expect(validateLogin({ email: '', password: '' })).toEqual({ email: 'Vui lòng nhập email.', password: 'Vui lòng nhập mật khẩu.' })
  })
})

describe('validateRegister', () => {
  const ok = { fullName: 'Nguyễn Văn A', email: 'a@b.co', phoneNumber: '', password: 'Qa12345678', confirm: 'Qa12345678' }
  it('hợp lệ', () => { expect(validateRegister(ok)).toEqual({}) })
  it('SĐT tuỳ chọn nhưng nếu nhập phải đúng ký tự cho phép', () => {
    expect(validateRegister({ ...ok, phoneNumber: '+84 912-345.678' })).toEqual({})
    expect(validateRegister({ ...ok, phoneNumber: '09abc' }).phoneNumber).toBeDefined()
    expect(validateRegister({ ...ok, phoneNumber: '1'.repeat(31) }).phoneNumber).toBeDefined()
  })
  it('mật khẩu theo luật backend và phải nhập lại khớp', () => {
    expect(validateRegister({ ...ok, password: 'abcdefgh', confirm: 'abcdefgh' }).password).toBe('Mật khẩu phải có chữ số.')
    expect(validateRegister({ ...ok, confirm: 'khac' }).confirm).toBe('Mật khẩu nhập lại không khớp.')
  })
  it('họ tên bắt buộc, tối đa 200', () => {
    expect(validateRegister({ ...ok, fullName: '  ' }).fullName).toBeDefined()
    expect(validateRegister({ ...ok, fullName: 'a'.repeat(201) }).fullName).toBeDefined()
    expect(validateRegister({ ...ok, fullName: 'a'.repeat(200) }).fullName).toBeUndefined()
  })
})

describe('validateChangePassword / validateReset', () => {
  it('đổi mật khẩu', () => {
    expect(validateChangePassword({ currentPassword: 'old', newPassword: 'Qa12345678', confirm: 'Qa12345678' })).toEqual({})
    expect(validateChangePassword({ currentPassword: '', newPassword: 'Qa12345678', confirm: 'Qa12345678' }).currentPassword).toBeDefined()
    expect(validateChangePassword({ currentPassword: 'Qa12345678', newPassword: 'Qa12345678', confirm: 'Qa12345678' }).newPassword).toMatch(/khác/)
    expect(validateChangePassword({ currentPassword: 'old', newPassword: 'short1', confirm: 'short1' }).newPassword).toMatch(/tối thiểu/)
  })
  it('đặt lại mật khẩu', () => {
    expect(validateReset({ newPassword: 'Qa12345678', confirm: 'Qa12345678' })).toEqual({})
    expect(validateReset({ newPassword: 'Qa12345678', confirm: 'x' }).confirm).toBeDefined()
  })
  it('hasErrors', () => {
    expect(hasErrors({})).toBe(false)
    expect(hasErrors({ a: 'x' })).toBe(true)
  })
})
