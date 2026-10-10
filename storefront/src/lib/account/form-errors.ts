import { ApiError } from '@/lib/errors'

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>

export interface FormErrors<K extends string = string> {
  /** Lỗi gắn vào từng trường. */
  fields: FieldErrors<K>
  /** Lỗi chung của cả biểu mẫu (không gắn được vào trường nào). */
  general?: string
}

/**
 * Ánh xạ lỗi từ backend sang biểu mẫu.
 * - Mỗi details[].field (không phân biệt hoa thường) trùng một trường đã biết thì gắn vào trường đó.
 * - `codeToField`: mã lỗi nghiệp vụ -> trường (ví dụ email_taken -> email).
 * - Phần còn lại thành lỗi chung bằng thông báo của máy chủ; lỗi không phải ApiError dùng `fallback`.
 */
export function toFormErrors<K extends string>(
  e: unknown,
  fields: readonly K[],
  opts: { codeToField?: Record<string, K>; fallback?: string } = {},
): FormErrors<K> {
  const fallback = opts.fallback ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.'
  if (!(e instanceof ApiError)) return { fields: {}, general: fallback }
  const out: FieldErrors<K> = {}
  let unmapped = false
  for (const d of e.details) {
    const key = fields.find((f) => f.toLowerCase() === d.field.toLowerCase())
    if (key) out[key] ??= d.message
    else unmapped = true
  }
  const byCode = opts.codeToField?.[e.code]
  if (byCode) out[byCode] ??= e.message
  const mapped = Object.keys(out).length > 0
  if (mapped && !unmapped) return { fields: out }
  return { fields: out, general: e.message || fallback }
}

const RATE_LIMITED = 'Bạn thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.'

/** Lỗi giới hạn tần suất (429) dùng chung cho các biểu mẫu xác thực; null nếu không phải. */
export function rateLimitMessage(e: unknown): string | null {
  return e instanceof ApiError && (e.status === 429 || e.code === 'rate_limited') ? RATE_LIMITED : null
}

/** Câu chữ cho lỗi đăng nhập: sai thông tin luôn chung chung (không lộ email có tồn tại), phân biệt khoá tạm / giới hạn tần suất. */
export function loginErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (rateLimitMessage(e)) return RATE_LIMITED
    if (e.code === 'account_locked' || e.status === 423) return 'Tài khoản tạm khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau ít phút.'
    if (e.code === 'account_disabled') return 'Tài khoản đã bị khoá. Vui lòng liên hệ cửa hàng.'
    if (e.status === 0) return e.message
    if (e.code === 'invalid_credentials' || e.status === 401 || e.status === 400) return 'Email hoặc mật khẩu không đúng.'
    return e.message
  }
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.'
}
