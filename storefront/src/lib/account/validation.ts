import type { FieldErrors } from './form-errors'
import { passwordError } from './password'

export const EMAIL_MAX = 255
export const NAME_MAX = 200

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailError(email: string): string | null {
  const v = email.trim()
  if (!v) return 'Vui lòng nhập email.'
  if (v.length > EMAIL_MAX || !EMAIL_RE.test(v)) return 'Email không hợp lệ.'
  return null
}

/** Số điện thoại ở form đăng ký: backend chỉ kiểm tra ký tự cho phép và độ dài (khác số điện thoại giao hàng). */
export function profilePhoneError(phone: string): string | null {
  const v = phone.trim()
  if (!v) return null
  if (v.length > 30 || !/^[0-9+\-\s().]*$/.test(v)) return 'Số điện thoại không hợp lệ.'
  return null
}

export type LoginField = 'email' | 'password'
export function validateLogin(v: { email: string; password: string }): FieldErrors<LoginField> {
  const e: FieldErrors<LoginField> = {}
  const em = emailError(v.email); if (em) e.email = em
  if (!v.password) e.password = 'Vui lòng nhập mật khẩu.'
  return e
}

export type RegisterField = 'fullName' | 'email' | 'phoneNumber' | 'password' | 'confirm'
export function validateRegister(v: { fullName: string; email: string; phoneNumber: string; password: string; confirm: string }): FieldErrors<RegisterField> {
  const e: FieldErrors<RegisterField> = {}
  if (!v.fullName.trim()) e.fullName = 'Vui lòng nhập họ tên.'
  else if (v.fullName.trim().length > NAME_MAX) e.fullName = `Họ tên tối đa ${NAME_MAX} ký tự.`
  const em = emailError(v.email); if (em) e.email = em
  const ph = profilePhoneError(v.phoneNumber); if (ph) e.phoneNumber = ph
  const pw = passwordError(v.password); if (pw) e.password = pw
  if (!e.password && v.confirm !== v.password) e.confirm = 'Mật khẩu nhập lại không khớp.'
  return e
}

export type ChangePasswordField = 'currentPassword' | 'newPassword' | 'confirm'
export function validateChangePassword(v: { currentPassword: string; newPassword: string; confirm: string }): FieldErrors<ChangePasswordField> {
  const e: FieldErrors<ChangePasswordField> = {}
  if (!v.currentPassword) e.currentPassword = 'Vui lòng nhập mật khẩu hiện tại.'
  const pw = passwordError(v.newPassword)
  if (pw) e.newPassword = pw
  else if (v.newPassword === v.currentPassword) e.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại.'
  if (!e.newPassword && v.confirm !== v.newPassword) e.confirm = 'Mật khẩu nhập lại không khớp.'
  return e
}

export type ResetField = 'newPassword' | 'confirm'
export function validateReset(v: { newPassword: string; confirm: string }): FieldErrors<ResetField> {
  const e: FieldErrors<ResetField> = {}
  const pw = passwordError(v.newPassword)
  if (pw) e.newPassword = pw
  else if (v.confirm !== v.newPassword) e.confirm = 'Mật khẩu nhập lại không khớp.'
  return e
}

export const hasErrors = (e: object) => Object.keys(e).length > 0
