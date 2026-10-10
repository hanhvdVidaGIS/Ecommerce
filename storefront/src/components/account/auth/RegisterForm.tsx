'use client'
import Link from 'next/link'
import { useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { PasswordField, TextField } from '@/components/ui/Field'
import { rateLimitMessage, toFormErrors, type FieldErrors } from '@/lib/account/form-errors'
import { safeNext } from '@/lib/account/safe-next'
import { hasErrors, validateRegister, type RegisterField } from '@/lib/account/validation'
import { useAuth } from '@/providers/AuthProvider'
import { useSite } from '@/providers/SiteProvider'
import { useToast } from '@/providers/ToastProvider'
import { PasswordRules } from '../PasswordRules'
import { AuthShell } from './AuthShell'

const SERVER_FIELDS = ['fullName', 'email', 'phoneNumber', 'password'] as const

export function RegisterForm({ next }: { next?: string }) {
  const { register } = useAuth()
  const { siteName } = useSite()
  const toast = useToast()
  const [v, setV] = useState({ fullName: '', email: '', phoneNumber: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    const client = validateRegister(v)
    setErrors(client)
    setGeneral(null)
    if (hasErrors(client)) return
    submitting.current = true
    setBusy(true)
    try {
      await register({ email: v.email.trim(), password: v.password, fullName: v.fullName.trim(), phoneNumber: v.phoneNumber.trim() || null })
      toast.show('Tạo tài khoản thành công.', 'success') // AuthShell chuyển hướng khi phiên được thiết lập
    } catch (err) {
      const rl = rateLimitMessage(err)
      if (rl) setGeneral(rl)
      else {
        const f = toFormErrors(err, SERVER_FIELDS, { codeToField: { email_taken: 'email' } })
        setErrors(f.fields)
        setGeneral(f.general ?? null)
      }
      setBusy(false)
    } finally {
      submitting.current = false
    }
  }

  const query = next && safeNext(next, '') ? `?next=${encodeURIComponent(safeNext(next))}` : ''
  return (
    <AuthShell title="Tạo tài khoản" subtitle={`Đăng ký để theo dõi đơn hàng và lưu địa chỉ tại ${siteName}.`} next={next}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {general ? <Alert>{general}</Alert> : null}
        <TextField label="Họ và tên" name="fullName" autoComplete="name" required value={v.fullName} error={errors.fullName} onChange={set('fullName')} />
        <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required value={v.email} error={errors.email} onChange={set('email')} />
        <TextField label="Số điện thoại" name="phoneNumber" type="tel" autoComplete="tel" inputMode="tel" value={v.phoneNumber} error={errors.phoneNumber}
          hint="Không bắt buộc." onChange={set('phoneNumber')} />
        <PasswordField label="Mật khẩu" name="password" autoComplete="new-password" required value={v.password} error={errors.password}
          hint={<PasswordRules value={v.password} />} onChange={set('password')} />
        <PasswordField label="Nhập lại mật khẩu" name="confirm" autoComplete="new-password" required value={v.confirm} error={errors.confirm} onChange={set('confirm')} />
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Đã có tài khoản? <Link href={`/account/login${query}`} className="font-medium text-accent hover:underline">Đăng nhập</Link></p>
    </AuthShell>
  )
}
