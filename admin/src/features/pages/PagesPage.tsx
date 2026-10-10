import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useEnumLabel, useLabels, useMeta } from '@/api/hooks'
import { Can } from '@/auth/guards'
import { DataTable, EmptyState, PageHeader, Pagination, type Column, type SortState } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives'
import { formatDateTime } from '@/lib/format'
import { useDebounce } from '@/lib/useDebounce'
import { useDeletePage, usePages, type PageListItem } from './api'
import { toastDeletePageError } from './deletePage'

const PAGE_SIZE = 20

export default function PagesPage() {
  const labels = useLabels()
  const meta = useMeta()
  const statusLabel = useEnumLabel('PublishStatus')
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState<SortState | null>(null)
  const q = useDebounce(search, 300)
  const list = usePages({ page, pageSize: PAGE_SIZE, q: q || undefined, status: status || undefined, sort: sort ? `${sort.key}:${sort.dir}` : undefined })
  const del = useDeletePage()

  const remove = async (p: PageListItem) => {
    if (!(await confirm({ title: `Xoá trang "${p.title}"?`, message: 'Không thể hoàn tác. Trang đang nằm trong menu thì phải gỡ khỏi menu trước.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(p.id)
      toast.success('Đã xoá trang')
    } catch (e) {
      toastDeletePageError(e)
    }
  }

  const columns: Column<PageListItem>[] = [
    {
      key: 'title', header: 'Tiêu đề', sortKey: 'title',
      cell: (p) => (
        <div className="min-w-0">
          <Link to={`/pages/${p.id}`} className="block truncate font-medium hover:underline">{p.title}</Link>
          <p className="truncate text-xs text-muted">/{p.slug}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Trạng thái', sortKey: 'status', cell: (p) => <Badge tone={p.status === 'Published' ? 'success' : 'neutral'}>{statusLabel(p.status)}</Badge> },
    { key: 'createdAt', header: 'Ngày tạo', sortKey: 'createdAt', hideOnMobile: true, cell: (p) => formatDateTime(p.createdAt, labels.timezone) },
    {
      key: 'actions', header: <span className="sr-only">Thao tác</span>, className: 'w-24 text-right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label={`Sửa ${p.title}`} onClick={() => navigate(`/pages/${p.id}`)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" aria-label={`Xoá ${p.title}`} onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-danger" /></Button>
        </div>
      ),
    },
  ]

  const filtered = !!q || !!status
  const m = list.data?.meta
  return (
    <>
      <PageHeader
        title="Trang nội dung"
        description="Giới thiệu, chính sách, câu hỏi thường gặp và các trang tĩnh khác."
        actions={<Can permission={P.PageManage}><Button onClick={() => navigate('/pages/new')}><Plus className="h-4 w-4" aria-hidden /> Thêm trang</Button></Can>}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Tìm trang" placeholder="Tìm theo tiêu đề hoặc slug..." className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <Select aria-label="Lọc theo trạng thái" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">Mọi trạng thái</option>
            {(meta.data?.enums['PublishStatus'] ?? []).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.data}
          rowKey={(p) => p.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          sort={sort}
          onSortChange={(s) => { setSort(s); setPage(1) }}
          empty={
            <EmptyState
              title={filtered ? 'Không tìm thấy trang nào' : 'Chưa có trang nào'}
              description={filtered ? 'Thử từ khoá hoặc bộ lọc khác.' : 'Tạo trang giới thiệu, chính sách... cho website.'}
              action={!filtered ? <Can permission={P.PageManage}><Button onClick={() => navigate('/pages/new')}>Thêm trang</Button></Can> : undefined}
            />
          }
        />
        {m && <Pagination page={m.page} pageSize={m.pageSize} total={m.total} onPageChange={setPage} />}
      </Card>
    </>
  )
}
