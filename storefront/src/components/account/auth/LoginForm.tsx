'use client'
import Link from 'next/link'
import { useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { PasswordField, TextField } from '@/components/ui/Field'
import { loginErrorMessage } from '@/lib/account/form-errors'
import { safeNext } from '@/lib/account/safe-next'
import { hasErrors, validateLogin, type LoginField } from '@/lib/account/validation'
import type { FieldErrors } from '@/lib/account/form-errors'
import { useAuth } from '@/providers/AuthProvider'
import { useSite } from '@/providers/SiteProvider'
import { useToast } from '@/providers/ToastProvider'
import { AuthShell } from './AuthShell'

export function LoginForm({ next }: { next?: string }) {
  const { login } = useAuth()
  const { siteName } = useSite()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    const v = validateLogin({ email, password })
    setErrors(v)
    setGeneral(null)
    if (hasErrors(v)) return
    submitting.current = true
    setBusy(true)
    try {
      await login(email.trim(), password)
      toast.show('Đăng nhập thành công.', 'success') // AuthShell chuyển hướng khi phiên được thiết lập
    } catch (err) {
      setGeneral(loginErrorMessage(err))
      setBusy(false)
    } finally {
      submitting.current = false
    }
  }

  const query = next && safeNext(next, '') ? `?next=${encodeURIComponent(safeNext(next))}` : ''
  return (
    <AuthShell title="Đăng nhập" subtitle={`Chào mừng quay lại ${siteName}.`} next={next}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {general ? <Alert>{general}</Alert> : null}
        <TextField label="Email" name="email" type="email" autoComplete="username" inputMode="email" required value={email} error={errors.email}
          onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Mật khẩu" name="password" autoComplete="current-password" required value={password} error={errors.password}
          onChange={(e) => setPassword(e.target.value)} />
        <div className="text-right text-sm"><Link href="/account/forgot-password" className="text-accent hover:underline">Quên mật khẩu?</Link></div>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Chưa có tài khoản? <Link href={`/account/register${query}`} className="font-medium text-accent hover:underline">Đăng ký</Link></p>
    </AuthShell>
  )
}
