import { describe, expect, it } from 'vitest'
import { passwordChecks, passwordError } from './password'

// Khớp PasswordRules.StrongPassword ở backend: 8-128 ký tự, có chữ cái ASCII, có chữ số.
describe('passwordError', () => {
  it('chấp nhận mật khẩu hợp lệ', () => {
    expect(passwordError('Qa12345678')).toBeNull()
    expect(passwordError('abcdefg1')).toBeNull()
    expect(passwordError('a'.repeat(127) + '1')).toBeNull() // đúng 128
  })

  it('từ chối theo thứ tự luật của backend, đúng câu chữ', () => {
    expect(passwordError('')).toBe('Mật khẩu là bắt buộc.')
    expect(passwordError('abc1')).toBe('Mật khẩu tối thiểu 8 ký tự.')
    expect(passwordError('a'.repeat(128) + '1')).toBe('Mật khẩu tối đa 128 ký tự.')
    expect(passwordError('12345678')).toBe('Mật khẩu phải có chữ cái.')
    expect(passwordError('abcdefgh')).toBe('Mật khẩu phải có chữ số.')
  })

  it('chữ cái có dấu không tính là chữ cái (backend dùng [A-Za-z])', () => {
    expect(passwordError('ưươươươ1')).toBe('Mật khẩu phải có chữ cái.')
  })

  it('biên độ dài: 7 lỗi, 8 đạt', () => {
    expect(passwordError('abcdef1')).not.toBeNull()
    expect(passwordError('abcdefg1')).toBeNull()
  })
})

describe('passwordChecks', () => {
  it('báo từng luật đạt/chưa đạt', () => {
    expect(passwordChecks('abc').map((c) => c.ok)).toEqual([false, true, false])
    expect(passwordChecks('12345678').map((c) => c.ok)).toEqual([true, false, true])
    expect(passwordChecks('Qa12345678').every((c) => c.ok)).toBe(true)
  })
})
