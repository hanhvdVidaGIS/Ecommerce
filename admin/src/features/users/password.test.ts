import { describe, expect, it } from 'vitest'
import { passwordIssues, validatePassword } from './password'

describe('validatePassword', () => {
  it('chấp nhận mật khẩu đủ dài có chữ và số', () => {
    expect(validatePassword('Passw0rdOK')).toBeNull()
    expect(validatePassword('abcdefg1')).toBeNull() // đúng 8 ký tự
  })

  it('từ chối mật khẩu rỗng', () => {
    expect(validatePassword('')).toBe('Mật khẩu là bắt buộc.')
  })

  it('từ chối mật khẩu quá ngắn', () => {
    expect(validatePassword('abc123')).toBe('Mật khẩu tối thiểu 8 ký tự.')
    expect(validatePassword('abcdef1')).not.toBeNull() // 7 ký tự
  })

  it('từ chối thiếu chữ cái hoặc thiếu chữ số', () => {
    expect(passwordIssues('12345678')).toEqual(['Mật khẩu phải có chữ cái.'])
    expect(passwordIssues('abcdefgh')).toEqual(['Mật khẩu phải có chữ số.'])
  })

  it('không tính chữ có dấu là chữ cái (khớp backend)', () => {
    expect(passwordIssues('ăâêôơư123')).toEqual(['Mật khẩu phải có chữ cái.'])
  })

  it('từ chối mật khẩu dài quá 128 ký tự', () => {
    expect(validatePassword('a1'.repeat(65))).toBe('Mật khẩu tối đa 128 ký tự.')
    expect(validatePassword('a1'.repeat(64))).toBeNull() // đúng 128
  })

  it('gom đủ các lỗi cùng lúc', () => {
    expect(passwordIssues('abc')).toEqual(['Mật khẩu tối thiểu 8 ký tự.', 'Mật khẩu phải có chữ số.'])
  })
})
