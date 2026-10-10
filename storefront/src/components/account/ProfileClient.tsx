'use client'
import { useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { PasswordField } from '@/components/ui/Field'
import { rateLimitMessage, toFormErrors, type FieldErrors } from '@/lib/account/form-errors'
import { hasErrors, validateChangePassword, type ChangePasswordField } from '@/lib/account/validation'
import { api } from '@/lib/client-api'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { PasswordRules } from './PasswordRules'
import { PageHeading } from './shared'

const SERVER_FIELDS = ['currentPassword', 'newPassword'] as const
const EMPTY = { currentPassword: '', newPassword: '', confirm: '' }

export function ProfileClient() {
  const { user } = useAuth()
  const toast = useToast()
  const [v, setV] = useState(EMPTY)
  const [errors, setErrors] = useState<FieldErrors<ChangePasswordField>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    const client = validateChangePassword(v)
    setErrors(client)
    setGeneral(null)
    if (hasErrors(client)) return
    submitting.current = true
    setBusy(true)
    try {
      await api.post('/api/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword })
      setV(EMPTY)
      toast.show('Đã đổi mật khẩu.', 'success')
    } catch (err) {
      const rl = rateLimitMessage(err)
      // Sai mật khẩu hiện tại: backend trả invalid_credentials (400) -> gắn vào ô mật khẩu hiện tại.
      const f = toFormErrors(err, SERVER_FIELDS, { codeToField: { invalid_credentials: 'currentPassword' } })
      setErrors(f.fields)
      setGeneral(rl ?? f.general ?? null)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeading title="Thông tin & mật khẩu" />

      <section aria-labelledby="profile-info">
        <h2 id="profile-info" className="mb-3 text-lg font-semibold">Thông tin tài khoản</h2>
        <dl className="grid gap-4 border border-line p-4 sm:grid-cols-2 md:p-5">
          <div><dt className="text-sm text-muted">Họ và tên</dt><dd className="font-medium">{user?.fullName}</dd></div>
          <div><dt className="text-sm text-muted">Email</dt><dd className="break-all font-medium">{user?.email}</dd></div>
          <div><dt className="text-sm text-muted">Số điện thoại</dt><dd className="font-medium">{user?.phoneNumber || <span className="text-muted">Chưa cập nhật</span>}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted">Muốn đổi họ tên, email hoặc số điện thoại? Vui lòng liên hệ cửa hàng để được hỗ trợ.</p>
      </section>

      <section aria-labelledby="profile-password">
        <h2 id="profile-password" className="mb-3 text-lg font-semibold">Đổi mật khẩu</h2>
        <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4 border border-line p-4 md:p-5">
          {general ? <Alert>{general}</Alert> : null}
          <PasswordField label="Mật khẩu hiện tại" name="currentPassword" autoComplete="current-password" required value={v.currentPassword} error={errors.currentPassword} onChange={set('currentPassword')} />
          <PasswordField label="Mật khẩu mới" name="newPassword" autoComplete="new-password" required value={v.newPassword} error={errors.newPassword}
            hint={<PasswordRules value={v.newPassword} />} onChange={set('newPassword')} />
          <PasswordField label="Nhập lại mật khẩu mới" name="confirm" autoComplete="new-password" required value={v.confirm} error={errors.confirm} onChange={set('confirm')} />
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Đổi mật khẩu'}</button>
        </form>
      </section>
    </div>
  )
}
