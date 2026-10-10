/** Luật mật khẩu khớp backend (Ccp.Application/Auth/AuthDtos.cs, PasswordRules.StrongPassword). Đổi một nơi phải đổi nơi kia. */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

export interface PasswordCheck { id: string; label: string; ok: boolean }

/** Danh sách luật kèm trạng thái đạt/chưa đạt, để hiển thị gợi ý ngay khi nhập. */
export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { id: 'length', label: `Từ ${PASSWORD_MIN} đến ${PASSWORD_MAX} ký tự`, ok: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX },
    { id: 'letter', label: 'Có chữ cái (A-Z, a-z)', ok: /[A-Za-z]/.test(pw) },
    { id: 'digit', label: 'Có chữ số (0-9)', ok: /[0-9]/.test(pw) },
  ]
}

/** Thông báo lỗi đầu tiên (cùng câu chữ với backend) hoặc null nếu hợp lệ. */
export function passwordError(pw: string): string | null {
  if (!pw) return 'Mật khẩu là bắt buộc.'
  if (pw.length < PASSWORD_MIN) return `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`
  if (pw.length > PASSWORD_MAX) return `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.`
  if (!/[A-Za-z]/.test(pw)) return 'Mật khẩu phải có chữ cái.'
  if (!/[0-9]/.test(pw)) return 'Mật khẩu phải có chữ số.'
  return null
}
