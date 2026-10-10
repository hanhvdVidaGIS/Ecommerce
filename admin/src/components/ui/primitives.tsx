import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/* ---------- Button ---------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'bg-surface text-text border border-border hover:bg-surface-2',
  ghost: 'text-text hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
        buttonVariants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

/* ---------- Form controls ---------- */
const controlBase =
  'w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none disabled:bg-surface-2 disabled:text-muted'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(controlBase, 'h-9', invalid && 'border-danger', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(controlBase, 'min-h-20 py-2', invalid && 'border-danger', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={cn(controlBase, 'h-9 pr-8', invalid && 'border-danger', className)} {...rest}>
      {children}
    </select>
  )
})

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }>(function Checkbox(
  { label, className, ...rest },
  ref,
) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', className)}>
      <input ref={ref} type="checkbox" className="h-4 w-4 rounded border-border accent-[var(--accent)]" {...rest} />
      {label}
    </label>
  )
})

export const Switch = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }>(function Switch(
  { label, className, ...rest },
  ref,
) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', className)}>
      <span className="relative inline-flex h-5 w-9 items-center">
        <input ref={ref} type="checkbox" role="switch" className="peer sr-only" {...rest} />
        <span className="absolute inset-0 rounded-full bg-border transition peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
      {label}
    </label>
  )
})

/** Nhãn + điều khiển + gợi ý + lỗi. Dùng aria-describedby để trình đọc màn hình đọc được lỗi. */
export function FormField({ label, error, hint, required, htmlFor, children, className }: {
  label?: ReactNode; error?: string; hint?: ReactNode; required?: boolean; htmlFor?: string; children: ReactNode; className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-text">
          {label}
          {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

/* ---------- Hiển thị ---------- */
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'
const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', badgeTones[tone], className)}>{children}</span>
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-surface', className)} {...rest}>{children}</div>
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4 w-full', className)} />
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 role="status" aria-label="Đang tải" className={cn('h-5 w-5 animate-spin text-muted', className)} />
}
