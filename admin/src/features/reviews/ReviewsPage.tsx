import { Check, Search, Star, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useEnumLabel, useLabels, useMeta } from '@/api/hooks'
import { Can } from '@/auth/guards'
import { DataTable, EmptyState, PageHeader, Pagination, type Column } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/lib/useDebounce'
import { useDeleteReview, useReviews, useSetReviewStatus } from './api'
import { buildReviewParams, DEFAULT_REVIEW_STATUS, hasReviewFilters, orderLink, reviewActions, reviewStatusTone, starCells, type AdminReview, type ReviewFilters, type ReviewStatus } from './model'

const PAGE_SIZE = 20

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`${rating} trên 5 sao`} className="inline-flex gap-0.5">
      {starCells(rating).map((on, i) => <Star key={i} className={cn('h-4 w-4', on ? 'fill-amber-400 text-amber-400' : 'text-border')} aria-hidden />)}
    </span>
  )
}

export default function ReviewsPage() {
  const labels = useLabels()
  const meta = useMeta()
  const statusLabel = useEnumLabel('ReviewStatus')
  const confirm = useConfirm()
  const [filters, setFilters] = useState<Omit<ReviewFilters, 'pageSize'>>({ page: 1, status: DEFAULT_REVIEW_STATUS, rating: '', search: '', sort: null })
  const q = useDebounce(filters.search, 300)
  const list = useReviews(buildReviewParams({ ...filters, search: q, pageSize: PAGE_SIZE }))
  const setStatus = useSetReviewStatus()
  const del = useDeleteReview()
  const [busyId, setBusyId] = useState<string | null>(null)

  const patch = (p: Partial<Omit<ReviewFilters, 'pageSize' | 'page'>>) => setFilters((f) => ({ ...f, ...p, page: 1 }))
  const statusOptions = meta.data?.enums?.ReviewStatus ?? []

  const change = async (r: AdminReview, status: ReviewStatus) => {
    setBusyId(r.id)
    try {
      await setStatus.mutateAsync({ id: r.id, status })
      toast.success(status === 'Approved' ? 'Đã duyệt đánh giá' : status === 'Rejected' ? 'Đã từ chối đánh giá' : 'Đã chuyển về chờ duyệt')
    } catch (e) {
      toastError(e, 'Không đổi được trạng thái đánh giá.')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (r: AdminReview) => {
    if (!(await confirm({ title: 'Xoá đánh giá này?', message: `Đánh giá của ${r.authorName} về "${r.productName}" sẽ bị xoá khỏi website và điểm trung bình được tính lại.`, confirmLabel: 'Xoá' }))) return
    setBusyId(r.id)
    try {
      await del.mutateAsync(r.id)
      toast.success('Đã xoá đánh giá')
    } catch (e) {
      toastError(e, 'Không xoá được đánh giá.')
    } finally {
      setBusyId(null)
    }
  }

  const columns: Column<AdminReview>[] = [
    {
      key: 'who', header: `${labels.product} / Khách`,
      className: 'min-w-44 max-w-56',
      cell: (r) => {
        const link = orderLink(r.orderNumber)
        return (
          <div className="min-w-0 space-y-0.5">
            <Link to={`/products/${r.productId}`} className="block truncate font-medium hover:underline">{r.productName}</Link>
            <p className="truncate text-xs">{r.authorName}</p>
            <p className="truncate text-xs text-muted">{r.authorEmail}</p>
            {link && <Link to={link} className="inline-block text-xs text-accent underline-offset-2 hover:underline">Đơn {r.orderNumber}</Link>}
          </div>
        )
      },
    },
    {
      key: 'rating', header: 'Đánh giá', sortKey: 'rating', className: 'min-w-56',
      cell: (r) => (
        <div className="min-w-0 space-y-1">
          <Stars rating={r.rating} />
          {/* Nội dung do khách nhập: chỉ render dạng văn bản thuần (React tự thoát ký tự), không bao giờ là HTML. */}
          {r.title && <p className="break-words font-medium">{r.title}</p>}
          {r.content && <p className="line-clamp-4 whitespace-pre-wrap break-words text-muted">{r.content}</p>}
          {!r.title && !r.content && <p className="text-xs italic text-muted">Chỉ chấm sao, không có nội dung.</p>}
          <p className="text-xs text-muted md:hidden">{formatDateTime(r.createdAt, labels.timezone)}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Trạng thái', sortKey: 'status', cell: (r) => <Badge tone={reviewStatusTone(r.status)} className="whitespace-nowrap">{statusLabel(r.status)}</Badge> },
    { key: 'createdAt', header: 'Ngày gửi', sortKey: 'createdAt', hideOnMobile: true, cell: (r) => <span className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt, labels.timezone)}</span> },
    {
      key: 'actions', header: <span className="sr-only">Thao tác</span>, className: 'w-px whitespace-nowrap',
      cell: (r) => {
        const a = reviewActions(r.status)
        const busy = busyId === r.id
        return (
          <Can permission={P.ReviewModerate}>
            <div className="flex justify-end gap-1">
              {a.approve && <Button size="sm" variant="secondary" disabled={busy} onClick={() => change(r, 'Approved')} aria-label={`Duyệt đánh giá của ${r.authorName}`} title="Duyệt"><Check className="h-4 w-4 text-success" aria-hidden /><span className="hidden 2xl:inline">Duyệt</span></Button>}
              {a.reject && <Button size="sm" variant="secondary" disabled={busy} onClick={() => change(r, 'Rejected')} aria-label={`Từ chối đánh giá của ${r.authorName}`} title="Từ chối"><X className="h-4 w-4 text-warning" aria-hidden /><span className="hidden 2xl:inline">Từ chối</span></Button>}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(r)} aria-label={`Xoá đánh giá của ${r.authorName}`} title="Xoá"><Trash2 className="h-4 w-4 text-danger" aria-hidden /></Button>
            </div>
          </Can>
        )
      },
    },
  ]

  const filtered = hasReviewFilters(filters)
  const page = list.data?.meta
  return (
    <>
      <PageHeader title="Đánh giá" description={`Duyệt đánh giá của khách trước khi hiện trên trang ${labels.product.toLowerCase()}.`} />
      <Card>
        <div className="flex gap-2 overflow-x-auto border-b border-border p-3" role="group" aria-label="Lọc nhanh theo trạng thái">
          {[{ value: '', label: 'Tất cả' }, ...statusOptions].map((o) => (
            <button
              key={o.value || 'all'}
              type="button"
              aria-pressed={filters.status === o.value}
              onClick={() => patch({ status: o.value })}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition',
                filters.status === o.value ? 'border-accent bg-accent text-accent-fg' : 'border-border text-muted hover:bg-surface-2 hover:text-text',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 border-b border-border p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Tìm đánh giá" placeholder={`Tìm theo nội dung, tên khách, ${labels.product.toLowerCase()}...`} className="pl-8" value={filters.search} onChange={(e) => patch({ search: e.target.value })} />
          </div>
          <Select aria-label="Lọc theo số sao" className="w-auto min-w-32" value={filters.rating} onChange={(e) => patch({ rating: e.target.value })}>
            <option value="">Mọi số sao</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} sao</option>)}
          </Select>
          {filtered && <Button variant="ghost" size="sm" onClick={() => setFilters((f) => ({ ...f, page: 1, status: DEFAULT_REVIEW_STATUS, rating: '', search: '' }))}>Về mặc định</Button>}
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.data}
          rowKey={(r) => r.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          sort={filters.sort}
          onSortChange={(s) => setFilters((f) => ({ ...f, sort: s, page: 1 }))}
          empty={
            <EmptyState
              title={filtered ? 'Không có đánh giá phù hợp' : 'Không có đánh giá nào chờ duyệt'}
              description={filtered ? 'Thử đổi trạng thái, số sao hoặc từ khoá.' : 'Đánh giá mới của khách sẽ xuất hiện ở đây để bạn duyệt.'}
            />
          }
        />
        {page && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))} />}
      </Card>
    </>
  )
}
