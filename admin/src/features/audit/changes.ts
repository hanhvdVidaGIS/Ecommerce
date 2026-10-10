/** Giới hạn ký tự hiển thị để một bản ghi quá lớn không làm đơ trình duyệt. */
export const MAX_CHANGES_CHARS = 20_000

export interface FormattedChanges {
  text: string
  /** false nếu chuỗi không phải JSON hợp lệ (hiển thị nguyên văn). */
  valid: boolean
  truncated: boolean
}

// Ký tự điều khiển và ký tự đảo chiều văn bản (bidi) có thể làm lệch cách đọc nội dung; thay bằng dạng escape nhìn thấy được.
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

function escapeUnsafe(s: string): string {
  return s.replace(UNSAFE, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

/**
 * Chuẩn hoá `changes` của nhật ký để hiển thị: JSON được thụt lề đẹp, JSON hỏng giữ nguyên văn.
 * Kết quả chỉ dùng làm TEXT (trong <pre>), không bao giờ làm HTML.
 */
export function formatChanges(raw: string | null | undefined): FormattedChanges | null {
  if (raw == null || raw.trim() === '') return null
  let text: string
  let valid = true
  try {
    text = JSON.stringify(JSON.parse(raw), null, 2) ?? raw
  } catch {
    text = raw
    valid = false
  }
  text = escapeUnsafe(text)
  const truncated = text.length > MAX_CHANGES_CHARS
  if (truncated) text = text.slice(0, MAX_CHANGES_CHARS) + '\n… (đã cắt bớt)'
  return { text, valid, truncated }
}
