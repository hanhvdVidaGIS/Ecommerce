'use client'
import type { AddressUnit } from '@/lib/use-address'

interface Props {
  id: string
  label: string
  value: string
  onChange: (code: string) => void
  units: AddressUnit[]
  loading: boolean
  /** Lỗi tải danh sách (có nút thử lại). */
  loadError?: string | null
  onRetry?: () => void
  placeholder: string
  disabled?: boolean
  /** Lỗi kiểm tra dữ liệu của ô. */
  error?: string
  required?: boolean
  name?: string
  autoComplete?: string
}

/** Ô chọn tỉnh/phường có nhãn, trạng thái đang tải, lỗi tải (thử lại) và lỗi kiểm tra gắn đúng ô. */
export function UnitSelect({ id, label, value, onChange, units, loading, loadError, onRetry, placeholder, disabled, error, required, name, autoComplete }: Props) {
  const errId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}{required ? <span aria-hidden className="text-danger"> *</span> : null}</label>
      <select
        id={id} name={name} autoComplete={autoComplete} className="field" value={value} disabled={disabled || loading || !!loadError}
        required={required} aria-required={required} aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined}
        aria-busy={loading || undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{loading ? 'Đang tải…' : placeholder}</option>
        {units.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
      </select>
      {loadError ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {loadError} {onRetry ? <button type="button" className="underline" onClick={onRetry}>Thử lại</button> : null}
        </p>
      ) : null}
      {error ? <p id={errId} role="alert" className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  )
}
