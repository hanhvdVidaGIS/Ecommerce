'use client'
import { useState } from 'react'
import { api } from '@/lib/client-api'
import { ApiError, errorMessage } from '@/lib/errors'

export function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setState('sending')
    try {
      await api.post('/api/public/newsletter', { email: email.trim() })
      setState('done')
    } catch (err) {
      setState('idle')
      setError(err instanceof ApiError && err.status === 400 ? 'Email không hợp lệ.' : errorMessage(err))
    }
  }

  if (state === 'done') return <p className="text-center font-medium text-success" role="status">Cảm ơn bạn đã đăng ký! Chúng tôi sẽ gửi ưu đãi mới nhất qua email.</p>
  return (
    <form onSubmit={submit} className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row" noValidate>
      <div className="flex-1">
        <label htmlFor="newsletter-email" className="sr-only">Email nhận tin</label>
        <input id="newsletter-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field" placeholder="Email của bạn"
          autoComplete="email" aria-invalid={!!error} aria-describedby={error ? 'newsletter-error' : undefined} maxLength={255} />
        {error ? <p id="newsletter-error" className="mt-1 text-sm text-danger" role="alert">{error}</p> : null}
      </div>
      <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Đang gửi...' : 'Đăng ký'}</button>
    </form>
  )
}
