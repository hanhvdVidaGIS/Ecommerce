import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useLabels } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { Can } from '@/auth/guards'
import { DataTable, EmptyState, PageHeader, Pagination, type Column, type SortState } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Input } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { useDebounce } from '@/lib/useDebounce'
import { BrandFormModal } from './BrandFormModal'
import { useBrands, useDeleteBrand, type Brand } from './api'

const PAGE_SIZE = 20

export default function BrandsPage() {
  const labels = useLabels()
  const { can } = useAuth()
  const confirm = useConfirm()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>(null)
  const [editing, setEditing] = useState<Brand | 'new' | null>(null)
  const q = useDebounce(search, 300)
  const list = useBrands({ page, pageSize: PAGE_SIZE, q: q || undefined, sort: sort ? `${sort.key}:${sort.dir}` : undefined })
  const del = useDeleteBrand()
  const canManage = can(P.BrandManage)

  const remove = async (b: Brand) => {
    if (!(await confirm({ title: `Xoá ${labels.brand.toLowerCase()} "${b.name}"?`, message: b.productCount > 0 ? `Đang có ${b.productCount} ${labels.product.toLowerCase()} thuộc ${labels.brand.toLowerCase()} này; cần chuyển sang ${labels.brand.toLowerCase()} khác trước.` : undefined, confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(b.id)
      toast.success('Đã xoá')
    } catch (e) {
      toastError(e, 'Không xoá được.')
    }
  }

  const columns: Column<Brand>[] = [
    {
      key: 'name', header: labels.brand, sortKey: 'name',
      cell: (b) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2">
            {b.logo && <img src={b.logo.url} alt="" className="h-full w-full object-contain" />}
          </div>
          <div className="min-w-0"><p className="truncate font-medium">{b.name}</p><p className="truncate text-xs text-muted">{b.slug}</p></div>
        </div>
      ),
    },
    { key: 'products', header: labels.product, cell: (b) => b.productCount, hideOnMobile: true },
    { key: 'sort', header: 'Thứ tự', sortKey: 'sortOrder', cell: (b) => b.sortOrder, hideOnMobile: true },
    { key: 'status', header: 'Trạng thái', cell: (b) => <Badge tone={b.isActive ? 'success' : 'neutral'}>{b.isActive ? 'Hiển thị' : 'Ẩn'}</Badge> },
    {
      key: 'actions', header: <span className="sr-only">Thao tác</span>, className: 'w-24 text-right',
      cell: (b) => canManage && (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label={`Sửa ${b.name}`} onClick={() => setEditing(b)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" aria-label={`Xoá ${b.name}`} onClick={() => remove(b)}><Trash2 className="h-4 w-4 text-danger" /></Button>
        </div>
      ),
    },
  ]

  const meta = list.data?.meta
  return (
    <>
      <PageHeader
        title={labels.brand}
        description={`Quản lý ${labels.brand.toLowerCase()} của ${labels.product.toLowerCase()}.`}
        actions={<Can permission={P.BrandManage}><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Thêm {labels.brand.toLowerCase()}</Button></Can>}
      />
      <Card>
        <div className="border-b border-border p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label={`Tìm ${labels.brand.toLowerCase()}`} placeholder={`Tìm ${labels.brand.toLowerCase()}...`} className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.data}
          rowKey={(b) => b.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          sort={sort}
          onSortChange={(s) => { setSort(s); setPage(1) }}
          empty={<EmptyState title={q ? 'Không tìm thấy kết quả' : `Chưa có ${labels.brand.toLowerCase()} nào`} description={q ? 'Thử từ khoá khác.' : undefined} action={!q && canManage ? <Button onClick={() => setEditing('new')}>Thêm {labels.brand.toLowerCase()}</Button> : undefined} />}
        />
        {meta && <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPageChange={setPage} />}
      </Card>
      {editing && <BrandFormModal brand={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}
