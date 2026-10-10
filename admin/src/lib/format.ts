/** Định dạng tiền tệ theo mã tiền (lấy từ cấu hình website), mặc định VND. */
export function formatMoney(value: number | null | undefined, currency = 'VND'): string {
  if (value === null || value === undefined) return '—'
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: currency === 'VND' ? 0 : 2 }).format(value)
  } catch {
    return `${value.toLocaleString('vi-VN')} ${currency}`
  }
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('vi-VN')
}

export function formatDateTime(value: string | Date | null | undefined, timeZone = 'Asia/Ho_Chi_Minh'): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone }).format(d)
  } catch {
    return d.toLocaleString('vi-VN')
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Chuyển giá trị của <input type="datetime-local"> (giờ địa phương) sang ISO UTC để gửi lên API và ngược lại. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
