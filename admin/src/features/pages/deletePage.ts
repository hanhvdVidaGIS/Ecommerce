import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { toastError } from '@/lib/forms'

/** Báo lỗi xoá trang. `in_use` (trang đang nằm trong menu) nói rõ cách xử lý thay vì chỉ báo lỗi chung. */
export function toastDeletePageError(e: unknown) {
  if (e instanceof ApiError && e.code === 'in_use') {
    toast.error(e.message, { description: 'Vào mục Menu, gỡ trang khỏi menu rồi xoá lại.', duration: 10_000 })
    return
  }
  toastError(e, 'Không xoá được trang.')
}
