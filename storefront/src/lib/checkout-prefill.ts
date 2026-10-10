import type { CurrentUser, Dto } from '@/api/types'
import type { CheckoutValues } from './checkout-validation'

export type SavedAddress = Dto<'CustomerAddressDto'>

/** Điền form từ một địa chỉ đã lưu của tài khoản. */
export function addressToValues(a: SavedAddress): Partial<CheckoutValues> {
  return {
    customerName: a.receiverName,
    phone: a.phone,
    addressLine: a.addressLine,
    provinceCode: a.provinceCode ?? '',
    wardCode: a.wardCode ?? '',
  }
}

/** Giá trị điền sẵn cho người đã đăng nhập: họ tên/SĐT/email từ tài khoản, địa chỉ mặc định (hoặc địa chỉ đầu tiên) đè lên nếu có. */
export function prefillForUser(user: CurrentUser | null, addresses: readonly SavedAddress[]): Partial<CheckoutValues> {
  if (!user) return {}
  const base: Partial<CheckoutValues> = { customerName: user.fullName, email: user.email, ...(user.phoneNumber ? { phone: user.phoneNumber } : {}) }
  const pick = addresses.find((a) => a.isDefault) ?? addresses[0]
  return pick ? { ...base, ...addressToValues(pick) } : base
}
