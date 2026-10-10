import { describe, expect, it } from 'vitest'
import { addressToForm, emptyAddressForm, formatAddress, isValidVnPhone, normalizeVnPhone, validateAddress, type AddressForm } from './address'

describe('normalizeVnPhone (khớp PhoneRules.Normalize của backend)', () => {
  it.each([
    ['0912345678', '0912345678'],
    ['091 234 5678', '0912345678'],
    ['091.234.5678', '0912345678'],
    ['091-234-5678', '0912345678'],
    ['+84912345678', '0912345678'],
    ['84912345678', '0912345678'],
    ['+84 912 345 678', '0912345678'],
  ])('%s -> %s', (raw, want) => { expect(normalizeVnPhone(raw)).toBe(want) })

  it.each([[''], ['  '], ['abc'], ['091234567'], ['09123456789'], ['0212345678'], ['0112345678'], ['1912345678'], ['0912+345678'], ['849123456']])('từ chối %j', (raw) => {
    expect(normalizeVnPhone(raw)).toBeNull()
    expect(isValidVnPhone(raw)).toBe(false)
  })
  it('null/undefined', () => {
    expect(normalizeVnPhone(null)).toBeNull()
    expect(normalizeVnPhone(undefined)).toBeNull()
  })
})

describe('formatAddress', () => {
  it('nối các phần không rỗng bằng dấu phẩy', () => {
    expect(formatAddress({ addressLine: '12 Lê Lợi', wardName: 'Phường Bến Nghé', provinceName: 'TP. Hồ Chí Minh' })).toBe('12 Lê Lợi, Phường Bến Nghé, TP. Hồ Chí Minh')
  })
  it('bỏ phần thiếu/trống và cắt khoảng trắng', () => {
    expect(formatAddress({ addressLine: ' 12 Lê Lợi ', wardName: null, provinceName: '  ' })).toBe('12 Lê Lợi')
  })
})

describe('validateAddress', () => {
  const ok: AddressForm = { receiverName: 'Nguyễn A', phone: '0912345678', provinceCode: '79', wardCode: '26734', addressLine: '12 Lê Lợi', isDefault: false }
  it('hợp lệ', () => { expect(validateAddress(ok)).toEqual({}) })
  it('form trống báo đủ 5 trường', () => {
    expect(Object.keys(validateAddress(emptyAddressForm())).sort()).toEqual(['addressLine', 'phone', 'provinceCode', 'receiverName', 'wardCode'])
  })
  it('SĐT sai, độ dài vượt', () => {
    expect(validateAddress({ ...ok, phone: '12345' }).phone).toBe('Số điện thoại không hợp lệ.')
    expect(validateAddress({ ...ok, receiverName: 'a'.repeat(201) }).receiverName).toBeDefined()
    expect(validateAddress({ ...ok, addressLine: 'a'.repeat(301) }).addressLine).toBeDefined()
    expect(validateAddress({ ...ok, addressLine: 'a'.repeat(300) }).addressLine).toBeUndefined()
  })
})

describe('addressToForm', () => {
  it('địa chỉ cũ thiếu mã tỉnh/phường thành chuỗi rỗng để buộc chọn lại', () => {
    const f = addressToForm({ id: 'x', receiverName: 'A', phone: '0912345678', addressLine: 'L', provinceCode: null, provinceName: null, wardCode: null, wardName: null, isDefault: true })
    expect(f).toMatchObject({ provinceCode: '', wardCode: '', isDefault: true })
    expect(Object.keys(validateAddress(f))).toEqual(['provinceCode', 'wardCode'])
  })
})
