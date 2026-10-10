'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { PasswordField } from '@/components/ui/Field'
import { rateLimitMessage, toFormErrors, type FieldErrors } from '@/lib/account/form-errors'
import { hasErrors, validateReset, type ResetField } from '@/lib/account/validation'
import { api } from '@/lib/client-api'
import { ApiError } from '@/lib/errors'
import { useToast } from '@/providers/ToastProvider'
import { PasswordRules } from '../PasswordRules'
import { AuthShell } from './AuthShell'

export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [v, setV] = useState({ newPassword: '', confirm: '' })
  const [errors, setErrors] = useState<FieldErrors<ResetField>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [invalidLink, setInvalidLink] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  if (!token || invalidLink) {
    return (
      <AuthShell title="Đặt lại mật khẩu">
        <div className="space-y-4">
          <Alert>{invalidLink ? 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' : 'Thiếu mã đặt lại mật khẩu. Hãy mở đúng liên kết trong email.'}</Alert>
          <Link href="/account/forgot-password" className="btn btn-primary w-full">Yêu cầu liên kết mới</Link>
        </div>
      </AuthShell>
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    const client = validateReset(v)
    setErrors(client)
    setGeneral(null)
    if (hasErrors(client)) return
    submitting.current = true
    setBusy(true)
    try {
      await api.post('/api/auth/reset-password', { token, newPassword: v.newPassword })
      toast.show('Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.', 'success')
      router.replace('/account/login')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_reset_token') setInvalidLink(true)
      else {
        const rl = rateLimitMessage(err)
        const f = toFormErrors(err, ['newPassword'] as const)
        setErrors({ newPassword: f.fields.newPassword })
        setGeneral(rl ?? f.general ?? null)
      }
      setBusy(false)
    } finally {
      submitting.current = false
    }
  }

  return (
    <AuthShell title="Đặt lại mật khẩu" subtitle="Nhập mật khẩu mới cho tài khoản của bạn.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {general ? <Alert>{general}</Alert> : null}
        <PasswordField label="Mật khẩu mới" name="newPassword" autoComplete="new-password" required value={v.newPassword} error={errors.newPassword}
          hint={<PasswordRules value={v.newPassword} />} onChange={(e) => setV((s) => ({ ...s, newPassword: e.target.value }))} />
        <PasswordField label="Nhập lại mật khẩu mới" name="confirm" autoComplete="new-password" required value={v.confirm} error={errors.confirm}
          onChange={(e) => setV((s) => ({ ...s, confirm: e.target.value }))} />
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}</button>
      </form>
    </AuthShell>
  )
}
