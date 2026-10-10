/** Định dạng tiền theo mã tiền tệ cấu hình (VND không có phần lẻ). */
export function formatMoney(value: number | null | undefined, currency = 'VND'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: currency === 'VND' ? 0 : 2 }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value)
}

export function formatDateTime(value: string | Date, timeZone = 'Asia/Ho_Chi_Minh'): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone }).format(d)
}

export function formatDate(value: string | Date, timeZone = 'Asia/Ho_Chi_Minh'): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone }).format(d)
}

/** Phần trăm giảm giá làm tròn; null nếu không có giá gốc cao hơn. */
export function discountPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null
  return Math.round(((compareAt - price) / compareAt) * 100)
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
