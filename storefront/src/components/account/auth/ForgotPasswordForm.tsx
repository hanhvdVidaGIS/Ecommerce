'use client'
import Link from 'next/link'
import { useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { TextField } from '@/components/ui/Field'
import { rateLimitMessage } from '@/lib/account/form-errors'
import { emailError } from '@/lib/account/validation'
import { api } from '@/lib/client-api'
import { errorMessage } from '@/lib/errors'
import { AuthShell } from './AuthShell'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [general, setGeneral] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    const err = emailError(email)
    setError(err ?? undefined)
    setGeneral(null)
    if (err) return
    submitting.current = true
    setBusy(true)
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (e2) {
      setGeneral(rateLimitMessage(e2) ?? errorMessage(e2))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Quên mật khẩu" subtitle="Nhập email đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.">
      {sent ? (
        <div className="space-y-4">
          <Alert kind="success">Nếu email <strong className="break-all">{email.trim()}</strong> đã đăng ký, bạn sẽ nhận được thư hướng dẫn đặt lại mật khẩu trong ít phút. Liên kết có hiệu lực trong thời gian ngắn; hãy kiểm tra cả thư mục thư rác.</Alert>
          <button type="button" className="btn btn-outline w-full" onClick={() => setSent(false)}>Nhập email khác</button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {general ? <Alert>{general}</Alert> : null}
          <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required value={email} error={error} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}</button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted"><Link href="/account/login" className="font-medium text-accent hover:underline">Quay lại đăng nhập</Link></p>
    </AuthShell>
  )
}
