import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLabels } from '@/api/hooks'
import { DataTable, EmptyState, PageHeader, Pagination, type Column } from '@/components/ui/data'
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives'
import { formatDateTime, formatMoney } from '@/lib/format'
import { useDebounce } from '@/lib/useDebounce'
import { useCustomers, type CustomerListItem } from './api'
import { buildCustomerParams, hasActiveCustomerFilters, type ActiveFilter, type CustomerFilters } from './model'

const PAGE_SIZE = 20

export default function CustomersPage() {
  const labels = useLabels()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Omit<CustomerFilters, 'pageSize'>>({ page: 1, search: '', active: '', sort: null })
  const q = useDebounce(filters.search, 300)
  const list = useCustomers(buildCustomerParams({ ...filters, search: q, pageSize: PAGE_SIZE }))
  const filtered = hasActiveCustomerFilters(filters)

  const columns: Column<CustomerListItem>[] = [
    {
      key: 'name', header: 'Khách hàng', sortKey: 'fullName',
      cell: (c) => (
        <div className="min-w-0">
          <Link to={`/customers/${c.id}`} className="block truncate font-medium text-accent underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>{c.fullName}</Link>
          <p className="truncate text-xs text-muted">{c.email}</p>
        </div>
      ),
    },
    { key: 'phone', header: 'Số điện thoại', hideOnMobile: true, cell: (c) => c.phone ?? '—' },
    { key: 'orders', header: 'Số đơn', sortKey: 'orderCount', className: 'text-right', cell: (c) => c.orderCount },
    { key: 'spent', header: 'Tổng chi tiêu', sortKey: 'totalSpent', className: 'whitespace-nowrap text-right', cell: (c) => formatMoney(c.totalSpent, labels.currency) },
    { key: 'status', header: 'Trạng thái', cell: (c) => <Badge tone={c.isActive ? 'success' : 'danger'}>{c.isActive ? 'Đang hoạt động' : 'Bị khoá'}</Badge> },
    { key: 'created', header: 'Ngày đăng ký', sortKey: 'createdAt', hideOnMobile: true, cell: (c) => <span className="whitespace-nowrap text-muted">{formatDateTime(c.createdAt, labels.timezone)}</span> },
  ]

  const patch = (p: Partial<Omit<CustomerFilters, 'pageSize' | 'page'>>) => setFilters((f) => ({ ...f, ...p, page: 1 }))
  const page = list.data?.meta
  return (
    <>
      <PageHeader title="Khách hàng" description="Tài khoản khách đã đăng ký và lịch sử mua hàng." />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Tìm theo tên, email hoặc số điện thoại" placeholder="Tìm tên, email, SĐT..." className="pl-8" value={filters.search} onChange={(e) => patch({ search: e.target.value })} />
          </div>
          <Select aria-label="Lọc theo trạng thái hoạt động" className="w-auto min-w-40" value={filters.active} onChange={(e) => patch({ active: e.target.value as ActiveFilter })}>
            <option value="">Mọi trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Bị khoá</option>
          </Select>
          {filtered && <Button variant="ghost" size="sm" onClick={() => patch({ search: '', active: '' })}>Xoá bộ lọc</Button>}
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.data}
          rowKey={(c) => c.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          sort={filters.sort}
          onSortChange={(s) => setFilters((f) => ({ ...f, sort: s, page: 1 }))}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          empty={<EmptyState title={filtered ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng nào'} description={filtered ? 'Thử đổi từ khoá hoặc bộ lọc.' : 'Khách đăng ký tài khoản sẽ xuất hiện ở đây.'} />}
        />
        {page && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))} />}
      </Card>
    </>
  )
}
