import type { ErrorDetail } from './errors'

/** Luật kiểm tra form thanh toán, khớp CheckoutRequestValidator và PhoneRules của backend (backend vẫn là nguồn quyết định cuối). */
export interface CheckoutValues {
  customerName: string
  phone: string
  email: string
  addressLine: string
  provinceCode: string
  wardCode: string
  note: string
  paymentMethod: string
}
export type CheckoutField = keyof CheckoutValues
export type FieldErrors = Partial<Record<CheckoutField, string>>

export const LIMITS = { name: 200, email: 255, address: 300, note: 1000 } as const
/** Thứ tự các ô trên form: dùng để đưa focus tới ô lỗi đầu tiên. */
export const FIELD_ORDER: CheckoutField[] = ['customerName', 'phone', 'email', 'provinceCode', 'wardCode', 'addressLine', 'paymentMethod', 'note']

/** Chuẩn hoá SĐT Việt Nam về dạng 0xxxxxxxxx (10 số, đầu 03-09); null nếu không hợp lệ. Giống PhoneRules.Normalize ở backend. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null
  let digits = [...raw].filter((c) => (c >= '0' && c <= '9') || c === '+').join('')
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3)
  else if (digits.startsWith('84') && digits.length === 11) digits = '0' + digits.slice(2)
  if (digits.includes('+')) return null
  return /^0[3-9]\d{8}$/.test(digits) ? digits : null
}

export const isValidPhone = (raw: string): boolean => normalizePhone(raw) !== null

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCheckout(v: CheckoutValues, allowedMethods: readonly string[] = ['Cod', 'BankTransfer']): FieldErrors {
  const e: FieldErrors = {}
  const name = v.customerName.trim()
  if (!name) e.customerName = 'Nhập họ tên.'
  else if (name.length > LIMITS.name) e.customerName = `Họ tên tối đa ${LIMITS.name} ký tự.`

  if (!v.phone.trim()) e.phone = 'Nhập số điện thoại.'
  else if (!isValidPhone(v.phone)) e.phone = 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0 hoặc +84).'

  const email = v.email.trim()
  if (email && (!EMAIL.test(email) || email.length > LIMITS.email)) e.email = 'Email không hợp lệ.'

  if (!v.provinceCode) e.provinceCode = 'Chọn tỉnh/thành phố.'
  if (!v.wardCode) e.wardCode = 'Chọn phường/xã.'

  const addr = v.addressLine.trim()
  if (!addr) e.addressLine = 'Nhập địa chỉ giao hàng.'
  else if (addr.length > LIMITS.address) e.addressLine = `Địa chỉ tối đa ${LIMITS.address} ký tự.`

  if (!allowedMethods.includes(v.paymentMethod)) e.paymentMethod = 'Chọn phương thức thanh toán.'
  if (v.note.length > LIMITS.note) e.note = `Ghi chú tối đa ${LIMITS.note} ký tự.`
  return e
}

export function firstErrorField(errors: FieldErrors): CheckoutField | undefined {
  return FIELD_ORDER.find((f) => errors[f])
}

export function toCheckoutRequest(v: CheckoutValues) {
  return {
    customerName: v.customerName.trim(),
    phone: v.phone.trim(),
    email: v.email.trim() || null,
    addressLine: v.addressLine.trim(),
    provinceCode: v.provinceCode,
    wardCode: v.wardCode,
    note: v.note.trim() || null,
    paymentMethod: v.paymentMethod,
  }
}

// ---------- ánh xạ lỗi backend ----------
const FIELD_LOOKUP: Record<string, CheckoutField> = Object.fromEntries(FIELD_ORDER.map((f) => [f.toLowerCase(), f]))

/** Tên trường từ backend ("CustomerName", "$.phone") về tên trường của form; undefined nếu không thuộc form. */
export function toFormField(field: string): CheckoutField | undefined {
  return FIELD_LOOKUP[field.replace(/^\$\./, '').toLowerCase()]
}

export interface CheckoutFailure {
  fieldErrors: FieldErrors
  /** Thông báo chung hiện đầu form (hoặc trên giỏ hàng nếu phải quay lại). */
  message: string
  /** Lỗi do nội dung giỏ (tồn kho, mã giảm giá, giỏ trống): cần quay về /cart để sửa. */
  backToCart: boolean
}

interface ErrorLike { status: number; code: string; message: string; details: ErrorDetail[] }

/** Chuyển lỗi của POST /api/orders/checkout thành thông tin hiển thị: lỗi theo ô, thông báo chung, có cần về giỏ hàng. */
export function mapCheckoutError(e: ErrorLike): CheckoutFailure {
  const cartProblem = e.code === 'stock_changed' || e.code === 'out_of_stock' || e.code === 'insufficient_stock' || e.code === 'cart_empty' || e.code.startsWith('coupon_')
  if (cartProblem) {
    const lines = e.code === 'stock_changed' ? e.details.map((d) => d.message).filter(Boolean) : []
    const message = lines.length ? `${e.message} ${lines.join(' ')}` : e.message
    return { fieldErrors: {}, message, backToCart: true }
  }
  if (e.code === 'rate_limited' || e.status === 429) return { fieldErrors: {}, message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.', backToCart: false }
  if (e.code === 'csrf_failed') return { fieldErrors: {}, message: 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang rồi thử lại.', backToCart: false }

  const fieldErrors: FieldErrors = {}
  for (const d of e.details) {
    const f = toFormField(d.field)
    if (f && !fieldErrors[f]) fieldErrors[f] = d.message
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, message: 'Vui lòng kiểm tra lại các thông tin được đánh dấu.', backToCart: false }
  return { fieldErrors, message: e.message, backToCart: false }
}
