'use client'
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export interface FieldControlProps {
  id: string
  'aria-invalid': boolean | undefined
  'aria-describedby': string | undefined
  'aria-required': boolean | undefined
}

interface FieldProps {
  label: string
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
  children: (props: FieldControlProps) => ReactNode
}

/** Nhãn + điều khiển + gợi ý + lỗi, nối đúng htmlFor/aria-invalid/aria-describedby. Lỗi có role=alert. */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId()
  const errId = `${id}-err`
  const hintId = `${id}-hint`
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}{required ? <span className="text-danger" aria-hidden> *</span> : null}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': required || undefined })}
      {hint ? <div id={hintId} className="mt-1 text-xs text-muted">{hint}</div> : null}
      {error ? <p id={errId} role="alert" className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  )
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>

/** Ô nhập một dòng. */
export function TextField({ label, error, hint, required, className, ...input }: InputProps & { label: string; error?: string; hint?: ReactNode; className?: string }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(p) => <input {...input} {...p} className="field" />}
    </Field>
  )
}

/** Ô mật khẩu có nút hiện/ẩn (giữ được bằng bàn phím, có nhãn). */
export function PasswordField({ label, error, hint, required, className, ...input }: Omit<InputProps, 'type'> & { label: string; error?: string; hint?: ReactNode; className?: string }) {
  const [shown, setShown] = useState(false)
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(p) => (
        <div className="relative">
          <input {...input} {...p} type={shown ? 'text' : 'password'} className="field pr-11" />
          <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={shown}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted hover:text-ink">
            {shown ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      )}
    </Field>
  )
}
