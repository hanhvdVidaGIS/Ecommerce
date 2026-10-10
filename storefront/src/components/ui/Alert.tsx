import type { ReactNode } from 'react'

/** Thông báo trong biểu mẫu (lỗi chung hoặc thành công). */
export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const tone = { error: 'border-danger/40 bg-danger/5 text-danger', success: 'border-success/40 bg-success/5 text-success', info: 'border-line bg-subtle text-ink' }[kind]
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded border px-3 py-2 text-sm ${tone}`}>{children}</div>
}
