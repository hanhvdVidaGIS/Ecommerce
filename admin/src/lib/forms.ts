import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'

/** "variants[0].price" → "variants.0.price" để khớp đường dẫn của react-hook-form. */
export function toFormPath(field: string): string {
  return field.replace(/\[(\d+)\]/g, '.$1')
}

/**
 * Gắn lỗi theo trường từ backend vào form. Lỗi không khớp trường nào của form
 * (hoặc không phải lỗi theo trường) được báo bằng toast để không bị nuốt.
 */
export function applyApiError<T extends FieldValues>(form: UseFormReturn<T>, error: unknown, fallback = 'Không lưu được. Vui lòng thử lại.') {
  if (!(error instanceof ApiError)) {
    toast.error(fallback)
    return
  }
  const known = new Set(Object.keys(form.getValues() as object))
  let placed = 0
  const unplaced: string[] = []
  for (const d of error.details) {
    const path = toFormPath(d.field)
    const root = path.split('.')[0]
    if (known.has(root)) {
      form.setError(path as Path<T>, { type: 'server', message: d.message })
      placed++
    } else {
      unplaced.push(d.message)
    }
  }
  if (placed === 0 || unplaced.length > 0) toast.error(unplaced.length > 0 ? `${error.message} ${unplaced.join(' ')}` : error.message)
}

export function toastError(error: unknown, fallback = 'Đã xảy ra lỗi. Vui lòng thử lại.') {
  toast.error(error instanceof ApiError ? error.message : fallback)
}

/** Chuỗi rỗng → null, để gửi lên API đúng nghĩa "không có giá trị". */
export function emptyToNull(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

/** Số nhập từ ô input (có thể rỗng) → number | null. */
export function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === '' || value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
