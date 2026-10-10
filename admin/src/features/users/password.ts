/**
 * Kiểm tra mật khẩu phía giao diện, phản chiếu quy tắc StrongPassword của backend
 * (8–128 ký tự, có chữ cái A-Z/a-z và chữ số). Chỉ để báo lỗi sớm: backend vẫn là nơi quyết định.
 */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

export function passwordIssues(password: string): string[] {
  const issues: string[] = []
  if (!password) return ['Mật khẩu là bắt buộc.']
  if (password.length < PASSWORD_MIN) issues.push(`Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`)
  if (password.length > PASSWORD_MAX) issues.push(`Mật khẩu tối đa ${PASSWORD_MAX} ký tự.`)
  // Backend dùng [A-Za-z]: chữ có dấu không được tính là chữ cái.
  if (!/[A-Za-z]/.test(password)) issues.push('Mật khẩu phải có chữ cái.')
  if (!/[0-9]/.test(password)) issues.push('Mật khẩu phải có chữ số.')
  return issues
}

/** Lỗi đầu tiên, hoặc null nếu hợp lệ. */
export function validatePassword(password: string): string | null {
  return passwordIssues(password)[0] ?? null
}
