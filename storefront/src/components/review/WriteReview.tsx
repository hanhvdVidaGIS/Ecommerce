'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Field } from '@/components/ui/Field'
import { ErrorState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'
import { loginUrl } from '@/lib/account/safe-next'
import { toFormErrors, rateLimitMessage } from '@/lib/account/form-errors'
import { api } from '@/lib/client-api'
import { ApiError } from '@/lib/errors'
import { eligibilityView, REVIEW_CONTENT_MAX, REVIEW_TITLE_MAX, validateReview, type Eligibility, type ReviewErrors } from '@/lib/reviews'
import { useApiQuery } from '@/lib/use-api-query'
import { useAuth } from '@/providers/AuthProvider'
import { useSite } from '@/providers/SiteProvider'
import { useToast } from '@/providers/ToastProvider'
import type { MyReview } from '@/api/types'

const THANKS = 'Cảm ơn, đánh giá sẽ hiển thị sau khi được duyệt.'
const FIELDS = ['rating', 'title', 'content'] as const

/** Bộ chọn sao truy cập được: nhóm radio (ẩn bằng sr-only, nhận focus bàn phím, mũi tên đổi giá trị) có nhãn "n sao". */
function StarPicker({ value, onChange, error, describedBy }: { value: number; onChange: (n: number) => void; error?: string; describedBy?: string }) {
  const name = useId()
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <fieldset aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
      <legend className="mb-1 block text-sm font-medium">Đánh giá của bạn<span className="text-danger" aria-hidden> *</span></legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="relative cursor-pointer" onMouseEnter={() => setHover(n)}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <span className="block rounded p-1 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
              <Star size={32} strokeWidth={1.5} fill={n <= shown ? 'currentColor' : 'none'} className={n <= shown ? 'text-accent' : 'text-muted'} aria-hidden />
            </span>
            <span className="sr-only">{n} sao</span>
          </label>
        ))}
        <span className="ml-2 text-sm text-muted" aria-hidden>{value > 0 ? `${value}/5 sao` : 'Chọn số sao'}</span>
      </div>
      {error ? <p id={describedBy} role="alert" className="mt-1 text-sm text-danger">{error}</p> : null}
    </fieldset>
  )
}

interface FormProps { productId: string; onDone: (review: MyReview) => void; onIneligible: (e: Eligibility) => void }

function ReviewForm({ productId, onDone, onIneligible }: FormProps) {
  const toast = useToast()
  const { productLabel } = useSite()
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [errors, setErrors] = useState<ReviewErrors>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const ratingErrId = useId()

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (submitting.current) return
    const v = validateReview({ rating, title, content })
    if (!v.ok) { setErrors(v.errors); setGeneral(null); return }
    submitting.current = true
    setBusy(true)
    setErrors({})
    setGeneral(null)
    try {
      const created = await api.post<MyReview>('/api/account/reviews', { productId, ...v.value })
      toast.show(THANKS, 'success')
      onDone(created)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_purchased') onIneligible({ canReview: false, reason: 'not_purchased', existingStatus: null })
      else if (e instanceof ApiError && e.code === 'already_reviewed') onIneligible({ canReview: false, reason: 'already_reviewed', existingStatus: 'Pending' })
      else {
        const limited = rateLimitMessage(e)
        if (limited) setGeneral(limited)
        else {
          const f = toFormErrors(e, FIELDS, { fallback: 'Không gửi được đánh giá. Vui lòng thử lại.' })
          setErrors(f.fields)
          setGeneral(f.general ?? null)
        }
      }
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4" aria-label={`Viết đánh giá ${productLabel.toLowerCase()}`}>
      <StarPicker value={rating} onChange={(n) => { setRating(n); setErrors((x) => ({ ...x, rating: undefined })) }} error={errors.rating} describedBy={ratingErrId} />
      <Field label="Tiêu đề (không bắt buộc)" error={errors.title}>
        {(p) => <input {...p} className="field" value={title} maxLength={REVIEW_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} autoComplete="off" placeholder="Tóm tắt trải nghiệm của bạn" />}
      </Field>
      <Field label="Nội dung (không bắt buộc)" error={errors.content}
        hint={<span aria-hidden>{content.length}/{REVIEW_CONTENT_MAX} ký tự</span>}>
        {(p) => <textarea {...p} className="field" rows={5} value={content} maxLength={REVIEW_CONTENT_MAX} onChange={(e) => setContent(e.target.value)} placeholder="Chia sẻ chi tiết để giúp người mua khác" />}
      </Field>
      {general ? <Alert>{general}</Alert> : null}
      <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy} aria-busy={busy}>{busy ? 'Đang gửi…' : 'Gửi đánh giá'}</button>
      <p className="text-xs text-muted">Đánh giá sẽ hiển thị sau khi được cửa hàng duyệt.</p>
    </form>
  )
}

/** Khối viết đánh giá: chỉ hiện form khi khách đã đăng nhập và đã nhận sản phẩm (backend quyết định qua eligibility). */
export function WriteReview({ productId }: { productId: string }) {
  const { user, loading } = useAuth()
  const { productLabel } = useSite()
  const pathname = usePathname()
  const [sent, setSent] = useState(false)
  const q = useApiQuery<Eligibility>(() => api.get<Eligibility>(`/api/account/reviews/eligibility/${productId}`), `elig-${productId}-${user?.id ?? ''}`, !!user)

  const box = 'border border-line bg-subtle p-4'
  if (loading) return <Skeleton className="h-24" />
  if (!user) {
    return (
      <div className={box}>
        <p className="font-medium">Chia sẻ cảm nhận của bạn</p>
        <p className="mt-1 text-sm text-muted">Đăng nhập để viết đánh giá.</p>
        <Link href={loginUrl(`${pathname}#reviews`)} className="btn btn-primary mt-3">Đăng nhập</Link>
      </div>
    )
  }
  if (q.loading && !q.data) return <Skeleton className="h-24" />
  if (q.error && !q.data) return <ErrorState message={q.error} onRetry={q.reload} />

  const view = sent ? 'pending' : eligibilityView(q.data)
  return (
    <div>
      {sent ? <Alert kind="success">{THANKS}</Alert> : null}
      {view === 'form' ? (
        <ReviewForm productId={productId}
          onDone={() => { setSent(true); q.setData({ canReview: false, reason: 'already_reviewed', existingStatus: 'Pending' }) }}
          onIneligible={(e) => q.setData(e)} />
      ) : view === 'pending' && !sent ? <Alert kind="info">Bạn đã gửi đánh giá cho {productLabel.toLowerCase()} này, đang chờ duyệt.</Alert>
        : view === 'published' ? <Alert kind="info">Đánh giá của bạn đã được đăng. Cảm ơn bạn!</Alert>
        : view === 'hidden' ? <Alert kind="info">Đánh giá của bạn hiện không được hiển thị công khai.</Alert>
        : view === 'not_purchased' ? <div className={box}><p className="text-sm">Chỉ khách đã nhận {productLabel.toLowerCase()} mới có thể đánh giá.</p></div> : null}
    </div>
  )
}
