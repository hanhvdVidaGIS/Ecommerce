import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Fragment, useState } from 'react'
import { useLabels } from '@/api/hooks'
import { EmptyState, ErrorState, PageHeader, Pagination } from '@/components/ui/data'
import { Card, Input, Skeleton } from '@/components/ui/primitives'
import { formatDateTime } from '@/lib/format'
import { useDebounce } from '@/lib/useDebounce'
import { useAuditLogs, type AuditLog } from './api'
import { formatChanges } from './changes'

const PAGE_SIZE = 20

// Gợi ý nhập nhanh, không phải danh sách đầy đủ: backend không có điểm cuối liệt kê các giá trị này nên cho phép gõ tự do.
const ACTION_HINTS = [
  'settings.update', 'product.price', 'user.create', 'user.update', 'user.delete', 'user.password-reset',
  'role.create', 'role.update', 'role.delete', 'businesstype.apply',
]
const ENTITY_HINTS = ['User', 'Role', 'Product', 'WebsiteSetting', 'BusinessType']

const COLUMNS = 6

function Changes({ id, raw }: { id: string; raw: string | null }) {
  const f = formatChanges(raw)
  if (!f) return <p id={id} className="text-xs text-muted">Không có chi tiết thay đổi.</p>
  return (
    <div id={id}>
      {!f.valid && <p className="mb-1 text-xs text-amber-700">Dữ liệu không phải JSON hợp lệ, hiển thị nguyên văn.</p>}
      {/* Chỉ render dạng text: nội dung do người dùng nhập (tên, email...) không bao giờ được hiểu là HTML. */}
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-mono text-xs">{f.text}</pre>
    </div>
  )
}

export default function AuditLogsPage() {
  const labels = useLabels()
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const entityQ = useDebounce(entityType.trim(), 300)
  const actionQ = useDebounce(action.trim(), 300)
  const list = useAuditLogs({ page, pageSize: PAGE_SIZE, entityType: entityQ || undefined, action: actionQ || undefined })
  const filtered = !!entityQ || !!actionQ

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const rows: AuditLog[] | undefined = list.data?.data
  const meta = list.data?.meta

  let body
  if (list.error) body = <ErrorState error={list.error} onRetry={() => list.refetch()} />
  else if (!list.isLoading && rows && rows.length === 0) {
    body = <EmptyState title={filtered ? 'Không có bản ghi phù hợp' : 'Chưa có nhật ký thao tác'} description={filtered ? 'Thử đổi hoặc xoá bộ lọc.' : undefined} />
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium text-muted">
              <th scope="col" className="relative w-10 px-2 py-2.5"><span className="sr-only">Chi tiết</span></th>
              <th scope="col" className="px-4 py-2.5 font-medium">Thời gian</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Người thực hiện</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Hành động</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Đối tượng</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">IP</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading || !rows
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: COLUMNS }, (_, j) => <td key={j} className={j === COLUMNS - 1 ? 'hidden px-4 py-3 md:table-cell' : 'px-4 py-3'}><Skeleton className="h-4" /></td>)}
                  </tr>
                ))
              : rows.map((log) => {
                  const open = expanded.has(log.id)
                  const detailId = `audit-changes-${log.id}`
                  return (
                    <Fragment key={log.id}>
                      <tr className="border-b border-border last:border-0">
                        <td className="px-2 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => toggle(log.id)}
                            aria-expanded={open}
                            aria-controls={open ? detailId : undefined}
                            aria-label={open ? 'Thu gọn chi tiết' : 'Xem chi tiết thay đổi'}
                            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                          >
                            {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-muted">{formatDateTime(log.at, labels.timezone)}</td>
                        <td className="px-4 py-3 align-top">{log.userEmail ?? <span className="text-muted">Hệ thống</span>}</td>
                        <td className="px-4 py-3 align-top"><code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{log.action}</code></td>
                        <td className="px-4 py-3 align-top">
                          <p>{log.entityType}</p>
                          {log.entityId && <p className="max-w-48 truncate font-mono text-[11px] text-muted" title={log.entityId}>{log.entityId}</p>}
                        </td>
                        <td className="hidden px-4 py-3 align-top font-mono text-xs text-muted md:table-cell">{log.ip ?? '—'}</td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border bg-surface">
                          <td />
                          <td colSpan={COLUMNS - 1} className="px-4 pb-4 pt-1">
                            {/* sticky + chiều rộng theo màn hình: trên điện thoại khung JSON luôn nằm trong tầm nhìn dù bảng cuộn ngang. */}
                            <div className="sticky left-12 w-[calc(100vw-6rem)] max-w-3xl"><Changes id={detailId} raw={log.changes} /></div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Nhật ký thao tác" description="Lịch sử các thay đổi nhạy cảm: cấu hình, người dùng, vai trò, giá." />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Lọc theo hành động" placeholder="Hành động, vd: user.update" list="audit-action-hints" className="pl-8" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} />
            <datalist id="audit-action-hints">{ACTION_HINTS.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
          <div className="min-w-40 flex-1 sm:max-w-xs">
            <Input aria-label="Lọc theo đối tượng" placeholder="Đối tượng, vd: User" list="audit-entity-hints" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1) }} />
            <datalist id="audit-entity-hints">{ENTITY_HINTS.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
        </div>
        {body}
        {meta && <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPageChange={setPage} />}
      </Card>
    </>
  )
}
