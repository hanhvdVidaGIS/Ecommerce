import { ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useLabels, useMeta } from '@/api/hooks'
import { Can } from '@/auth/guards'
import { DataTable, EmptyState, PageHeader, Pagination, type Column, type SortState } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { formatDateTime } from '@/lib/format'
import { useDebounce } from '@/lib/useDebounce'
import { useDeletePost, usePosts } from './api'
import { POST_STATE_BADGE, postState, publicPostPath, type PostListItem } from './model'

const PAGE_SIZE = 20

export default function PostsPage() {
  const labels = useLabels()
  const meta = useMeta()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState<SortState | null>(null)
  const q = useDebounce(search, 300)
  const list = usePosts({ page, pageSize: PAGE_SIZE, q: q || undefined, status: status || undefined, sort: sort ? `${sort.key}:${sort.dir}` : undefined })
  const del = useDeletePost()

  const remove = async (p: PostListItem) => {
    if (!(await confirm({ title: `Xoá bài viết "${p.title}"?`, message: 'Bài viết sẽ biến mất khỏi website và không thể hoàn tác.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(p.id)
      toast.success('Đã xoá bài viết')
    } catch (e) {
      toastError(e, 'Không xoá được bài viết.')
    }
  }

  const columns: Column<PostListItem>[] = [
    {
      key: 'title', header: 'Tiêu đề', sortKey: 'title',
      cell: (p) => (
        <div className="min-w-0">
          <Link to={`/posts/${p.id}`} className="block truncate font-medium hover:underline">{p.title}</Link>
          <p className="truncate text-xs text-muted">/blog/{p.slug}</p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Trạng thái', sortKey: 'status',
      cell: (p) => {
        const b = POST_STATE_BADGE[postState(p.status, p.publishedAt)]
        return <Badge tone={b.tone} className="whitespace-nowrap">{b.label}</Badge>
      },
    },
    { key: 'publishedAt', header: 'Ngày đăng', sortKey: 'publishedAt', hideOnMobile: true, cell: (p) => <span className="whitespace-nowrap text-muted">{p.publishedAt ? formatDateTime(p.publishedAt, labels.timezone) : '—'}</span> },
    { key: 'createdAt', header: 'Ngày tạo', sortKey: 'createdAt', hideOnMobile: true, cell: (p) => <span className="whitespace-nowrap text-muted">{formatDateTime(p.createdAt, labels.timezone)}</span> },
    {
      key: 'actions', header: <span className="sr-only">Thao tác</span>, className: 'w-32 text-right',
      cell: (p) => {
        const href = publicPostPath(p.slug, postState(p.status, p.publishedAt))
        return (
          <div className="flex justify-end gap-1">
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Xem trên website: ${p.title}`} className="inline-flex h-8 items-center rounded-md px-3 text-text hover:bg-surface-2">
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            )}
            <Button variant="ghost" size="sm" aria-label={`Sửa ${p.title}`} onClick={() => navigate(`/posts/${p.id}`)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" aria-label={`Xoá ${p.title}`} onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-danger" /></Button>
          </div>
        )
      },
    },
  ]

  const filtered = !!q || !!status
  const m = list.data?.meta
  return (
    <>
      <PageHeader
        title="Bài viết"
        description="Tin tức, hướng dẫn và nội dung blog của website."
        actions={<Can permission={P.PostManage}><Button onClick={() => navigate('/posts/new')}><Plus className="h-4 w-4" aria-hidden /> Thêm bài viết</Button></Can>}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Tìm bài viết" placeholder="Tìm theo tiêu đề hoặc slug..." className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
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
              title={filtered ? 'Không tìm thấy bài viết nào' : 'Chưa có bài viết nào'}
              description={filtered ? 'Thử từ khoá hoặc bộ lọc khác.' : 'Viết bài đầu tiên cho blog của website.'}
              action={!filtered ? <Can permission={P.PostManage}><Button onClick={() => navigate('/posts/new')}>Thêm bài viết</Button></Can> : undefined}
            />
          }
        />
        {m && <Pagination page={m.page} pageSize={m.pageSize} total={m.total} onPageChange={setPage} />}
      </Card>
    </>
  )
}
