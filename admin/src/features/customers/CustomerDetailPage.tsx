import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { ApiError } from '@/api/client'
import { useLabels } from '@/api/hooks'
import { Can } from '@/auth/guards'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui/primitives'
import { OrderStatusBadge, PaymentStatusBadge } from '@/features/orders/StatusBadge'
import { toastError } from '@/lib/forms'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import { useCustomer, useSetCustomerActive, type CustomerDetail } from './api'
import { toggleActiveCopy } from './model'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

export default function CustomerDetailPage() {
  const { id } = useParams()
  const query = useCustomer(id)
  const customer = query.data

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Đang tải khách hàng">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        <Skeleton className="h-56" />
      </div>
    )
  }
  if (query.error || !customer) {
    const notFound = query.error instanceof ApiError && query.error.status === 404
    return (
      <>
        <PageHeader title="Khách hàng" actions={<Link to="/customers" className="text-sm text-accent hover:underline">Về danh sách khách</Link>} />
        <Card>{notFound ? <EmptyState title="Không tìm thấy khách hàng" /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />}</Card>
      </>
    )
  }
  return <CustomerDetailView customer={customer} />
}

function CustomerDetailView({ customer }: { customer: CustomerDetail }) {
  const labels = useLabels()
  const confirm = useConfirm()
  const setActive = useSetCustomerActive(customer.id)

  const toggle = async () => {
    const copy = toggleActiveCopy(customer.isActive, customer.fullName)
    if (!(await confirm({ title: copy.title, message: copy.message, confirmLabel: copy.confirmLabel, tone: copy.next ? 'primary' : 'danger' }))) return
    try {
      await setActive.mutateAsync(copy.next)
      toast.success(copy.success)
    } catch (e) {
      toastError(e, 'Không đổi được trạng thái tài khoản.')
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2"><span>{customer.fullName}</span><Badge tone={customer.isActive ? 'success' : 'danger'}>{customer.isActive ? 'Đang hoạt động' : 'Bị khoá'}</Badge></span>}
        description={`Đăng ký lúc ${formatDateTime(customer.createdAt, labels.timezone)}`}
        actions={
          <>
            <Link to="/customers" className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2"><ArrowLeft className="h-4 w-4" aria-hidden /> Danh sách khách</Link>
            <Can permission={P.CustomerUpdate}>
              <Button variant={customer.isActive ? 'danger' : 'primary'} loading={setActive.isPending} onClick={toggle}>{customer.isActive ? 'Khoá tài khoản' : 'Mở khoá tài khoản'}</Button>
            </Can>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Số đơn hàng" value={formatNumber(customer.orderCount)} />
            <Stat label="Tổng chi tiêu" value={formatMoney(customer.totalSpent, labels.currency)} />
          </div>

          <Card>
            <CardHeader title="Đơn hàng gần nhất" description="Tối đa 10 đơn mới nhất." />
            {customer.recentOrders.length === 0 ? (
              <EmptyState title="Khách chưa có đơn hàng" />
            ) : (
              <ul>
                {customer.recentOrders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0">
                    <div className="min-w-0">
                      <Link to={`/orders/${o.id}`} className="font-medium text-accent underline-offset-2 hover:underline">{o.orderNumber}</Link>
                      <p className="truncate text-xs text-muted">
                        {formatDateTime(o.placedAt, labels.timezone)}{o.firstItemName ? ` · ${o.firstItemName}` : ''}{o.itemCount > 1 ? ` (+${o.itemCount - 1})` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{formatMoney(o.grandTotal, labels.currency)}</span>
                      <OrderStatusBadge status={o.status} />
                      <PaymentStatusBadge status={o.paymentStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Thông tin" />
            <dl className="space-y-3 px-4 py-3">
              <div><dt className="text-xs text-muted">Họ tên</dt><dd className="break-words text-sm">{customer.fullName}</dd></div>
              <div><dt className="text-xs text-muted">Email</dt><dd className="break-all text-sm">{customer.email}</dd></div>
              <div><dt className="text-xs text-muted">Số điện thoại</dt><dd className="text-sm">{customer.phone || '—'}</dd></div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Địa chỉ" description={`${customer.addresses.length} địa chỉ`} />
            {customer.addresses.length === 0 ? (
              <EmptyState title="Chưa có địa chỉ" />
            ) : (
              <ul>
                {customer.addresses.map((a) => (
                  <li key={a.id} className="space-y-0.5 border-b border-border px-4 py-3 text-sm last:border-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">{a.receiverName}{a.isDefault && <Badge tone="info">Mặc định</Badge>}</p>
                    <p className="text-muted">{a.phone}</p>
                    <p className="break-words">{[a.addressLine, a.wardName, a.provinceName].filter(Boolean).join(', ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
