import Link from 'next/link'
import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

/**
 * Trạng thái trống: tiêu đề, mô tả và (tuỳ chọn) nút hành động.
 * Hành động: `actionHref` + `actionLabel` (liên kết) hoặc `action` (nút tuỳ ý).
 */
export function EmptyState({ icon, title, description, actionHref, actionLabel, action }: {
  icon?: ReactNode; title: string; description?: ReactNode; actionHref?: string; actionLabel?: string; action?: ReactNode
}) {
  return (
    <div className="rounded border border-dashed border-line px-4 py-12 text-center">
      {icon ? <div className="mb-3 flex justify-center text-muted" aria-hidden>{icon}</div> : null}
      <p className="text-lg font-medium">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {actionHref && actionLabel ? <div className="mt-5 flex justify-center"><Link href={actionHref} className="btn btn-primary">{actionLabel}</Link></div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

/** Trạng thái lỗi tải dữ liệu, có nút thử lại. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded border border-danger/40 bg-danger/5 px-4 py-8 text-center">
      <TriangleAlert className="mx-auto mb-2 text-danger" size={28} aria-hidden />
      <p className="font-medium text-danger">{message}</p>
      {onRetry ? <button type="button" onClick={onRetry} className="btn btn-outline mt-4">Thử lại</button> : null}
    </div>
  )
}
