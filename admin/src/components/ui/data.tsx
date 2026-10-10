import { AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ApiError } from '@/api/client'
import { Button, Skeleton } from './primitives'

/* ---------- Trạng thái trống / lỗi ---------- */
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="text-muted">{icon ?? <Inbox className="h-8 w-8" aria-hidden />}</div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Đã xảy ra lỗi không mong muốn.'
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
      <p className="text-sm font-medium">Không tải được dữ liệu</p>
      <p className="max-w-sm text-xs text-muted">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Thử lại</Button>}
    </div>
  )
}

/* ---------- Tiêu đề trang ---------- */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------- Phân trang ---------- */
export function Pagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted">
      <span>{from}–{to} / {total}</span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Trang trước"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="px-2">Trang {page}/{pages}</span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Trang sau"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

/* ---------- Bảng dữ liệu ---------- */
export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Tên trường sort ở backend (nằm trong danh sách cho phép); bỏ trống nếu cột không sắp xếp được. */
  sortKey?: string
  className?: string
  /** Ẩn cột ở màn hình nhỏ. */
  hideOnMobile?: boolean
}

export interface SortState { key: string; dir: 'asc' | 'desc' }

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, sort, onSortChange, onRowClick, skeletonRows = 6 }: {
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  empty?: ReactNode
  sort?: SortState | null
  onSortChange?: (s: SortState | null) => void
  onRowClick?: (row: T) => void
  skeletonRows?: number
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (!loading && rows && rows.length === 0) return <>{empty ?? <EmptyState title="Chưa có dữ liệu" />}</>

  const toggleSort = (col: Column<T>) => {
    if (!col.sortKey || !onSortChange) return
    if (sort?.key !== col.sortKey) onSortChange({ key: col.sortKey, dir: 'asc' })
    else if (sort.dir === 'asc') onSortChange({ key: col.sortKey, dir: 'desc' })
    else onSortChange(null)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium text-muted">
            {columns.map((c) => {
              const active = !!c.sortKey && sort?.key === c.sortKey
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('relative px-4 py-2.5 font-medium', c.hideOnMobile && 'hidden md:table-cell', c.className)}
                >
                  {c.sortKey && onSortChange ? (
                    <button type="button" onClick={() => toggleSort(c)} className="inline-flex items-center gap-1 hover:text-text">
                      {c.header}
                      {active && (sort!.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </button>
                  ) : c.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading || !rows
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3', c.hideOnMobile && 'hidden md:table-cell')}><Skeleton className="h-4" /></td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('border-b border-border last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2')}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 align-middle', c.hideOnMobile && 'hidden md:table-cell', c.className)}>{c.cell(row)}</td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- Tabs ---------- */
export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: ReactNode }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn('whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition', value === t.key ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
