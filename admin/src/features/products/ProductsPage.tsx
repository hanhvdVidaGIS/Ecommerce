import { Flame, Pencil, Plus, Search, Sparkles, Star, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useLabels, useMeta } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { Can } from '@/auth/guards'
import { DataTable, EmptyState, PageHeader, Pagination, type Column, type SortState } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/lib/useDebounce'
import { useBrandOptions, useCategoryTree, useDeleteProduct, useProducts, useUpdateProductFlags, type ProductListItem, type ProductStatus } from './api'
import { CategorySelect } from './CategorySelect'
import { StatusBadge } from './StatusBadge'

const PAGE_SIZE = 20

/** Các giá trị `sort` backend cho phép (ProductService.Sorts); soldCount không có cột nên chỉ chọn qua ô "Sắp xếp". */
const SORT_CHOICES: { value: string; label: string }[] = [
  { value: '', label: 'Mới tạo gần đây' },
  { value: 'createdAt:asc', label: 'Tạo cũ nhất' },
  { value: 'name:asc', label: 'Tên A → Z' },
  { value: 'name:desc', label: 'Tên Z → A' },
  { value: 'minPrice:asc', label: 'Giá thấp → cao' },
  { value: 'minPrice:desc', label: 'Giá cao → thấp' },
  { value: 'soldCount:desc', label: 'Bán chạy nhất' },
  { value: 'status:asc', label: 'Theo trạng thái' },
]

type FlagKey = 'isFeatured' | 'isBestSeller' | 'isNew'
const FLAGS: { key: FlagKey; label: string; icon: LucideIcon }[] = [
  { key: 'isFeatured', label: 'Nổi bật', icon: Star },
  { key: 'isBestSeller', label: 'Bán chạy', icon: Flame },
  { key: 'isNew', label: 'Mới', icon: Sparkles },
]

export default function ProductsPage() {
  const labels = useLabels()
  const noun = labels.product.toLowerCase()
  const { can } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const meta = useMeta()
  const categories = useCategoryTree()
  const brands = useBrandOptions()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [status, setStatus] = useState('')
  const [flags, setFlags] = useState<Record<FlagKey, boolean>>({ isFeatured: false, isBestSeller: false, isNew: false })
  const [sort, setSort] = useState<SortState | null>(null)
  const q = useDebounce(search.trim(), 300)

  const list = useProducts({
    page, pageSize: PAGE_SIZE, q: q || undefined, categoryId: categoryId || undefined, brandId: brandId || undefined, status: status || undefined,
    isFeatured: flags.isFeatured || undefined, isBestSeller: flags.isBestSeller || undefined, isNew: flags.isNew || undefined,
    sort: sort ? `${sort.key}:${sort.dir}` : undefined,
  })
  const updateFlags = useUpdateProductFlags()
  const del = useDeleteProduct()
  const canUpdate = can(P.ProductUpdate)
  const canDelete = can(P.ProductDelete)

  const filtered = !!(q || categoryId || brandId || status || flags.isFeatured || flags.isBestSeller || flags.isNew)
  const resetFilters = () => {
    setSearch(''); setCategoryId(''); setBrandId(''); setStatus(''); setFlags({ isFeatured: false, isBestSeller: false, isNew: false }); setPage(1)
  }
  const onFilter = (fn: () => void) => { fn(); setPage(1) }

  const toggleFlag = async (p: ProductListItem, key: FlagKey) => {
    try {
      await updateFlags.mutateAsync({ id: p.id, body: { [key]: !p[key] } })
    } catch (e) {
      toastError(e, 'Không cập nhật được.')
    }
  }

  const changeStatus = async (p: ProductListItem, value: ProductStatus) => {
    try {
      await updateFlags.mutateAsync({ id: p.id, body: { status: value } })
      toast.success('Đã đổi trạng thái')
    } catch (e) {
      toastError(e, 'Không đổi được trạng thái.')
    }
  }

  const remove = async (p: ProductListItem) => {
    if (!(await confirm({ title: `Xoá ${noun} "${p.name}"?`, message: 'Các biến thể của sản phẩm cũng bị xoá và được gỡ khỏi giỏ hàng, flash sale. Không hoàn tác được.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(p.id)
      toast.success('Đã xoá')
    } catch (e) {
      toastError(e, 'Không xoá được.')
    }
  }

  const statusOptions = meta.data?.enums?.ProductStatus ?? []
  const pendingId = updateFlags.isPending ? updateFlags.variables?.id : undefined

  const columns: Column<ProductListItem>[] = [
    {
      key: 'name', header: labels.product, sortKey: 'name',
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2">
            {p.image && <img src={p.image.url} alt={p.image.altText ?? ''} loading="lazy" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0">
            <Link to={`/products/${p.id}`} className="block truncate font-medium hover:underline">{p.name}</Link>
            <p className="truncate text-xs text-muted">{p.sku ?? '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', header: labels.category, className: 'px-2', cell: (p) => p.categoryName ?? <span className="text-muted">—</span>, hideOnMobile: true },
    { key: 'brand', header: labels.brand, className: 'px-2', cell: (p) => p.brandName ?? <span className="text-muted">—</span>, hideOnMobile: true },
    {
      key: 'price', header: 'Giá', sortKey: 'minPrice', className: 'px-2',
      // mỗi mức giá không bị ngắt giữa chừng, nhưng cả khoảng được phép xuống dòng để bảng không tràn ngang
      cell: (p) => (
        <span>
          <span className="whitespace-nowrap">{formatMoney(p.minPrice, labels.currency)}</span>
          {p.maxPrice !== p.minPrice && <span className="whitespace-nowrap text-muted"> – {formatMoney(p.maxPrice, labels.currency)}</span>}
        </span>
      ),
    },
    {
      key: 'stock', header: 'Tồn kho', className: 'px-2',
      cell: (p) => p.stockTotal === 0
        ? <Badge tone="danger" className="gap-1"><TriangleAlert className="h-3 w-3" aria-hidden />Hết hàng</Badge>
        : <span>{p.stockTotal.toLocaleString('vi-VN')}</span>,
    },
    { key: 'variants', header: 'Biến thể', className: 'px-2', cell: (p) => p.variantCount, hideOnMobile: true },
    {
      key: 'flags', header: 'Cờ', className: 'px-2', hideOnMobile: true,
      cell: (p) => (
        <div className="flex gap-1">
          {FLAGS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={p[key]}
              aria-label={`${label}: ${p.name}`}
              title={label}
              disabled={!canUpdate || pendingId === p.id}
              onClick={() => toggleFlag(p, key)}
              className={cn('rounded p-1.5 transition disabled:cursor-default', p[key] ? 'bg-accent/10 text-accent' : 'text-muted/60 hover:bg-surface-2', !canUpdate && 'opacity-70')}
            >
              <Icon className={cn('h-4 w-4', p[key] && 'fill-current')} aria-hidden />
            </button>
          ))}
        </div>
      ),
    },
    {
      key: 'status', header: 'Trạng thái', sortKey: 'status', className: 'px-2',
      cell: (p) => canUpdate && statusOptions.length > 0 ? (
        <Select aria-label={`Trạng thái: ${p.name}`} className="h-8 w-28 text-xs" value={p.status} disabled={pendingId === p.id} onChange={(e) => changeStatus(p, e.target.value as ProductStatus)}>
          {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : <StatusBadge status={p.status} />,
    },
    {
      key: 'actions', header: <span className="sr-only">Thao tác</span>, className: 'w-20 px-2 text-right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label={`${canUpdate ? 'Sửa' : 'Xem'} ${p.name}`} onClick={() => navigate(`/products/${p.id}`)}><Pencil className="h-4 w-4" /></Button>
          {canDelete && <Button variant="ghost" size="sm" aria-label={`Xoá ${p.name}`} onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-danger" /></Button>}
        </div>
      ),
    },
  ]

  const m = list.data?.meta
  return (
    <>
      <PageHeader
        title={labels.product}
        description={`Quản lý ${noun}, biến thể, giá và tồn kho.`}
        actions={<Can permission={P.ProductCreate}><Button onClick={() => navigate('/products/new')}><Plus className="h-4 w-4" aria-hidden /> Thêm {noun}</Button></Can>}
      />
      <Card>
        <div className="space-y-3 border-b border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
              <Input aria-label={`Tìm ${noun}`} placeholder={`Tên, SKU, ${labels.brand.toLowerCase()}, ${labels.category.toLowerCase()}...`} className="pl-8" value={search} onChange={(e) => onFilter(() => setSearch(e.target.value))} />
            </div>
            <CategorySelect aria-label={`Lọc theo ${labels.category.toLowerCase()}`} categories={categories.data} placeholder={`Mọi ${labels.category.toLowerCase()}`} value={categoryId} onChange={(e) => onFilter(() => setCategoryId(e.target.value))} />
            <Select aria-label={`Lọc theo ${labels.brand.toLowerCase()}`} value={brandId} onChange={(e) => onFilter(() => setBrandId(e.target.value))}>
              <option value="">{`Mọi ${labels.brand.toLowerCase()}`}</option>
              {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <Select aria-label="Lọc theo trạng thái" value={status} onChange={(e) => onFilter(() => setStatus(e.target.value))}>
              <option value="">Mọi trạng thái</option>
              {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {FLAGS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={flags[key]}
                onClick={() => onFilter(() => setFlags((f) => ({ ...f, [key]: !f[key] })))}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition', flags[key] ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:bg-surface-2')}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />{label}
              </button>
            ))}
            {filtered && <Button variant="ghost" size="sm" onClick={resetFilters}>Xoá bộ lọc</Button>}
            <label className="ml-auto flex items-center gap-2 text-xs text-muted">
              Sắp xếp
              <Select
                aria-label="Sắp xếp"
                className="h-8 w-44 text-xs"
                value={sort ? `${sort.key}:${sort.dir}` : ''}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':')
                  setSort(key ? { key, dir: dir as 'asc' | 'desc' } : null)
                  setPage(1)
                }}
              >
                {sort && !SORT_CHOICES.some((c) => c.value === `${sort.key}:${sort.dir}`) && <option value={`${sort.key}:${sort.dir}`}>Theo cột</option>}
                {SORT_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </label>
          </div>
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
          empty={filtered
            ? <EmptyState title={`Không có ${noun} khớp bộ lọc`} description="Thử đổi từ khoá hoặc bỏ bớt bộ lọc." action={<Button variant="secondary" onClick={resetFilters}>Xoá bộ lọc</Button>} />
            : <EmptyState title={`Chưa có ${noun} nào`} description={`Thêm ${noun} đầu tiên để bắt đầu bán.`} action={<Can permission={P.ProductCreate}><Button onClick={() => navigate('/products/new')}>Thêm {noun}</Button></Can>} />}
        />
        {m && <Pagination page={m.page} pageSize={m.pageSize} total={m.total} onPageChange={setPage} />}
      </Card>
    </>
  )
}
