import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useEnumLabel, useLabels, useMeta } from '@/api/hooks'
import { DataTable, EmptyState, PageHeader, Pagination, type Column } from '@/components/ui/data'
import { Button, Card, Input, Select } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { formatDateTime, formatMoney } from '@/lib/format'
import { useDebounce } from '@/lib/useDebounce'
import { useOrders, type OrderListItem } from './api'
import { buildOrderParams, hasActiveFilters, type OrderFilters } from './model'
import { OrderStatusBadge, PaymentStatusBadge } from './StatusBadge'

const PAGE_SIZE = 20

export default function OrdersPage() {
  const labels = useLabels()
  const navigate = useNavigate()
  const meta = useMeta()
  const methodLabel = useEnumLabel('PaymentMethod')
  // Cho phép mở sẵn bộ lọc từ liên kết (Tổng quan, Đánh giá): /orders?status=Pending&paymentStatus=Unpaid&q=<mã đơn>.
  const [urlParams] = useSearchParams()
  const [filters, setFilters] = useState<Omit<OrderFilters, 'pageSize'>>(() => ({
    page: 1, search: urlParams.get('q') ?? '', status: urlParams.get('status') ?? '', paymentStatus: urlParams.get('paymentStatus') ?? '', paymentMethod: urlParams.get('paymentMethod') ?? '', from: '', to: '', sort: null,
  }))
  const q = useDebounce(filters.search, 300)
  const params = buildOrderParams({ ...filters, search: q, pageSize: PAGE_SIZE }, labels.timezone)
  const list = useOrders(params)

  // Đổi bộ lọc luôn về trang 1.
  const patch = (p: Partial<Omit<OrderFilters, 'pageSize' | 'page'>>) => setFilters((f) => ({ ...f, ...p, page: 1 }))
  const filtered = hasActiveFilters(filters)
  const statusOptions = meta.data?.enums?.OrderStatus ?? []
  const paymentOptions = meta.data?.enums?.PaymentStatus ?? []
  const methodOptions = meta.data?.enums?.PaymentMethod ?? []
  const rangeInvalid = !!filters.from && !!filters.to && filters.from > filters.to

  const columns: Column<OrderListItem>[] = [
    {
      key: 'number', header: 'Mã đơn', sortKey: 'orderNumber',
      cell: (o) => (
        <div className="min-w-0">
          <Link to={`/orders/${o.id}`} className="whitespace-nowrap font-medium text-accent underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>{o.orderNumber}</Link>
          <p className="text-xs text-muted md:hidden">{formatDateTime(o.placedAt, labels.timezone)}</p>
        </div>
      ),
    },
    { key: 'placed', header: 'Ngày đặt', sortKey: 'placedAt', hideOnMobile: true, cell: (o) => <span className="whitespace-nowrap text-muted">{formatDateTime(o.placedAt, labels.timezone)}</span> },
    {
      key: 'customer', header: 'Khách hàng',
      cell: (o) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{o.customerName}</p>
          <p className="text-xs text-muted">{o.phone}</p>
        </div>
      ),
    },
    { key: 'items', header: 'Số lượng', hideOnMobile: true, cell: (o) => o.itemCount },
    { key: 'total', header: 'Tổng tiền', sortKey: 'total', className: 'whitespace-nowrap text-right', cell: (o) => <span className="font-medium">{formatMoney(o.grandTotal, labels.currency)}</span> },
    { key: 'status', header: 'Trạng thái', sortKey: 'status', cell: (o) => <OrderStatusBadge status={o.status} /> },
    {
      key: 'payment', header: 'Thanh toán', hideOnMobile: true,
      cell: (o) => (
        <div className="space-y-0.5">
          <PaymentStatusBadge status={o.paymentStatus} />
          {o.paymentMethod && <p className="text-xs text-muted">{methodLabel(o.paymentMethod)}</p>}
        </div>
      ),
    },
  ]

  const page = list.data?.meta
  return (
    <>
      <PageHeader title="Đơn hàng" description="Theo dõi và xử lý đơn đặt hàng của khách." />
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
            <Input aria-label="Tìm theo mã đơn, số điện thoại hoặc tên khách" placeholder="Tìm mã đơn, SĐT, tên khách..." className="pl-8" value={filters.search} onChange={(e) => patch({ search: e.target.value })} />
          </div>
          <Select aria-label="Lọc theo thanh toán" className="w-auto min-w-40" value={filters.paymentStatus} onChange={(e) => patch({ paymentStatus: e.target.value })}>
            <option value="">Mọi thanh toán</option>
            {paymentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select aria-label="Lọc theo phương thức thanh toán" className="w-auto min-w-40" value={filters.paymentMethod} onChange={(e) => patch({ paymentMethod: e.target.value })}>
            <option value="">Mọi phương thức</option>
            {methodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Từ ngày
            <Input type="date" aria-label="Từ ngày" className="w-auto" max={filters.to || undefined} value={filters.from} onChange={(e) => patch({ from: e.target.value })} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Đến ngày
            <Input type="date" aria-label="Đến ngày" className="w-auto" min={filters.from || undefined} value={filters.to} onChange={(e) => patch({ to: e.target.value })} />
          </label>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => setFilters((f) => ({ ...f, page: 1, search: '', status: '', paymentStatus: '', paymentMethod: '', from: '', to: '' }))}>Xoá bộ lọc</Button>
          )}
        </div>
        {rangeInvalid && <p role="alert" className="border-b border-border px-4 py-2 text-xs text-danger">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
        <DataTable
          columns={columns}
          rows={list.data?.data}
          rowKey={(o) => o.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          sort={filters.sort}
          onSortChange={(s) => setFilters((f) => ({ ...f, sort: s, page: 1 }))}
          onRowClick={(o) => navigate(`/orders/${o.id}`)}
          empty={<EmptyState title={filtered ? 'Không tìm thấy đơn hàng' : 'Chưa có đơn hàng nào'} description={filtered ? 'Thử đổi từ khoá hoặc bộ lọc.' : 'Đơn khách đặt sẽ xuất hiện ở đây.'} />}
        />
        {page && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))} />}
      </Card>
    </>
  )
}
