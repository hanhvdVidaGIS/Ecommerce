import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useEnumLabel, useLabels } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { Can } from '@/auth/guards'
import { DataTable, EmptyState, PageHeader, Pagination, type Column, type SortState } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import { useDebounce } from '@/lib/useDebounce'
import { CouponFormModal } from './CouponFormModal'
import { useCoupons, useDeleteCoupon } from './api'
import { couponStateBadge, describeValue, type Coupon } from './model'

const PAGE_SIZE = 20

type ActiveFilter = 'all' | 'on' | 'off'

export default function CouponsPage() {
  const { currency, timezone } = useLabels()
  const typeLabel = useEnumLabel('CouponType')
  const { can } = useAuth()
  const confirm = useConfirm()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<ActiveFilter>('all')
  const [sort, setSort] = useState<SortState | null>(null)
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null)
  const q = useDebounce(search, 300)
  const list = useCoupons({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    active: active === 'all' ? undefined : active === 'on',
    sort: sort ? `${sort.key}:${sort.dir}` : undefined,
  })
  const del = useDeleteCoupon()
  const canManage = can(P.CouponManage)
  const filtered = !!q || active !== 'all'

  const remove = async (c: Coupon) => {
    const ok = await confirm({
      title: `Xoá mã "${c.code}"?`,
      message: c.usedCount > 0
        ? `Mã đã được dùng ${c.usedCount} lượt. Các đơn đã áp mã vẫn giữ nguyên, nhưng khách không dùng được mã này nữa.`
        : 'Khách sẽ không dùng được mã này nữa.',
      confirmLabel: 'Xoá',
    })
    if (!ok) return
    try {
      await del.mutateAsync(c.id)
      toast.success('Đã xoá mã giảm giá')
    } catch (e) {
      toastError(e, 'Không xoá được.')
    }
  }

  const money = (n: number) => formatMoney(n, currency)

  const columns: Column<Coupon>[] = [
    {
      key: 'code', header: 'Mã', sortKey: 'code',
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium">{c.code}</p>
          <p className="truncate text-xs text-muted">{typeLabel(c.type)}</p>
          {/* Điện thoại: cột ưu đãi bị ẩn nên tóm tắt ngay dưới mã. */}
          <p className="text-xs md:hidden">{describeValue(c, typeLabel(c.type), money)}</p>
        </div>
      ),
    },
    { key: 'value', header: 'Ưu đãi', cell: (c) => describeValue(c, typeLabel(c.type), money), hideOnMobile: true },
    { key: 'min', header: 'Đơn tối thiểu', cell: (c) => (c.minOrderAmount ? money(c.minOrderAmount) : '—'), hideOnMobile: true },
    {
      key: 'used', header: 'Đã dùng', sortKey: 'usedCount', hideOnMobile: true,
      cell: (c) => `${formatNumber(c.usedCount)} / ${c.usageLimit === null ? '∞' : formatNumber(c.usageLimit)}`,
    },
    {
      key: 'time', header: 'Thời hạn', sortKey: 'endAt', hideOnMobile: true,
      cell: (c) => (
        c.startAt || c.endAt
          ? (
            <div className="text-xs">
              <p>Từ {c.startAt ? formatDateTime(c.startAt, timezone) : 'ngay'}</p>
              <p className="text-muted">Đến {c.endAt ? formatDateTime(c.endAt, timezone) : 'không giới hạn'}</p>
            </div>
          )
          : <span className="text-xs text-muted">Không giới hạn</span>
      ),
    },
    {
      key: 'state', header: 'Trạng thái',
      cell: (c) => { const b = couponStateBadge(c.state); return <Badge tone={b.tone}>{b.label}</Badge> },
    },
    {
      key: 'actions', header: <span className="sr-only">Thao tác</span>, className: 'w-24 text-right',
      cell: (c) => canManage && (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label={`Sửa mã ${c.code}`} onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" aria-label={`Xoá mã ${c.code}`} onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-danger" /></Button>
        </div>
      ),
    },
  ]

  const meta = list.data?.meta
  return (
    <>
      <PageHeader
        title="Mã giảm giá"
        description="Tạo và theo dõi mã giảm giá cho khách khi thanh toán."
        actions={<Can permission={P.CouponManage}><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Thêm mã</Button></Can>}
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Tìm mã giảm giá" placeholder="Tìm theo mã..." className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <Select aria-label="Lọc theo trạng thái bật/tắt" className="w-40" value={active} onChange={(e) => { setActive(e.target.value as ActiveFilter); setPage(1) }}>
            <option value="all">Tất cả</option>
            <option value="on">Đang bật</option>
            <option value="off">Đã tắt</option>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.data}
          rowKey={(c) => c.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          sort={sort}
          onSortChange={(s) => { setSort(s); setPage(1) }}
          empty={<EmptyState title={filtered ? 'Không tìm thấy mã nào' : 'Chưa có mã giảm giá nào'} description={filtered ? 'Thử từ khoá hoặc bộ lọc khác.' : undefined} action={!filtered && canManage ? <Button onClick={() => setEditing('new')}>Thêm mã</Button> : undefined} />}
        />
        {meta && <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPageChange={setPage} />}
      </Card>
      {editing && <CouponFormModal coupon={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}
