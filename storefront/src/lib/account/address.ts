import type { Dto } from '@/api/types'
import type { FieldErrors } from './form-errors'

export type CustomerAddress = Dto<'CustomerAddressDto'>

/** Giới hạn của backend (AccountService.MaxAddresses). */
export const MAX_ADDRESSES = 10

/**
 * Chuẩn hoá số điện thoại Việt Nam, khớp PhoneRules.Normalize của backend:
 * 0xxxxxxxxx (10 số, đầu số 03-09), +84xxxxxxxxx hoặc 84xxxxxxxxx (11 số); bỏ khoảng trắng/dấu chấm/gạch. Trả null nếu không hợp lệ.
 */
export function normalizeVnPhone(phone: string | null | undefined): string | null {
  if (!phone || !phone.trim()) return null
  let digits = [...phone].filter((c) => /[0-9+]/.test(c)).join('')
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3)
  else if (digits.startsWith('84') && digits.length === 11) digits = '0' + digits.slice(2)
  if (digits.includes('+')) return null
  return digits.length === 10 && digits[0] === '0' && digits[1] >= '3' && digits[1] <= '9' ? digits : null
}

export const isValidVnPhone = (phone: string) => normalizeVnPhone(phone) !== null

/** "Số nhà, đường, Phường/Xã, Tỉnh/Thành" - bỏ phần trống. */
export function formatAddress(a: Pick<CustomerAddress, 'addressLine' | 'wardName' | 'provinceName'>): string {
  return [a.addressLine, a.wardName, a.provinceName].map((s) => s?.trim()).filter(Boolean).join(', ')
}

export interface AddressForm {
  receiverName: string
  phone: string
  provinceCode: string
  wardCode: string
  addressLine: string
  isDefault: boolean
}
export type AddressField = 'receiverName' | 'phone' | 'provinceCode' | 'wardCode' | 'addressLine'
export const ADDRESS_FIELDS: readonly AddressField[] = ['receiverName', 'phone', 'provinceCode', 'wardCode', 'addressLine']

export function emptyAddressForm(isDefault = false): AddressForm {
  return { receiverName: '', phone: '', provinceCode: '', wardCode: '', addressLine: '', isDefault }
}

export function addressToForm(a: CustomerAddress): AddressForm {
  return { receiverName: a.receiverName, phone: a.phone, provinceCode: a.provinceCode ?? '', wardCode: a.wardCode ?? '', addressLine: a.addressLine, isDefault: a.isDefault }
}

/** Kiểm tra phía client theo SaveAddressRequestValidator của backend. */
export function validateAddress(v: AddressForm): FieldErrors<AddressField> {
  const e: FieldErrors<AddressField> = {}
  if (!v.receiverName.trim()) e.receiverName = 'Vui lòng nhập họ tên người nhận.'
  else if (v.receiverName.trim().length > 200) e.receiverName = 'Họ tên tối đa 200 ký tự.'
  if (!v.phone.trim()) e.phone = 'Vui lòng nhập số điện thoại.'
  else if (!isValidVnPhone(v.phone)) e.phone = 'Số điện thoại không hợp lệ.'
  if (!v.provinceCode) e.provinceCode = 'Chọn tỉnh/thành phố.'
  if (!v.wardCode) e.wardCode = 'Chọn phường/xã.'
  if (!v.addressLine.trim()) e.addressLine = 'Vui lòng nhập số nhà, tên đường.'
  else if (v.addressLine.trim().length > 300) e.addressLine = 'Địa chỉ tối đa 300 ký tự.'
  return e
}
