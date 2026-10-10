import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, Circle, Minus } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import { P } from '@/api/catalog.generated'
import { useEnumLabel, useLabels, useSiteConfig } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/data'
import { Card, CardHeader, Skeleton } from '@/components/ui/primitives'
import { OrderStatusBadge } from '@/features/orders/StatusBadge'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDashboard } from './api'
import { buildAlerts, describeChange, formatChange, fullDate, pctChange, PERIODS, statusBarClass, statusShares, type Change, type Dashboard, type Period } from './model'
import { RevenueChart, RevenueTable } from './RevenueChart'

function useCount(key: string, path: string, enabled: boolean) {
  return useQuery({ queryKey: ['count', key], queryFn: async () => (await api.getPage<unknown>(path, { page: 1, pageSize: 1 })).meta?.total ?? 0, enabled })
}

const REVENUE_DEFINITION = 'Doanh thu = tổng giá trị các đơn chưa huỷ và chưa hoàn tiền, tính theo ngày đặt.'

function ChangeBadge({ change, days }: { change: Change; days: number }) {
  const tone = change.kind === 'pct' && change.direction === 'up' ? 'text-success' : change.kind === 'pct' && change.direction === 'down' ? 'text-danger' : 'text-muted'
  const Icon = change.kind === 'pct' && change.direction === 'up' ? ArrowUpRight : change.kind === 'pct' && change.direction === 'down' ? ArrowDownRight : change.kind === 'new' ? ArrowUpRight : Minus
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', tone)} title={describeChange(change, days)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span aria-hidden>{formatChange(change)}</span>
      <span className="sr-only">{describeChange(change, days)}</span>
    </span>
  )
}

function KpiCard({ label, value, change, days, hint }: { label: string; value: string; change: Change; days: number; hint?: string }) {
  return (
    <Card className="p-4" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums sm:text-xl 2xl:text-2xl">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        <ChangeBadge change={change} days={days} />
        <span>so với kỳ trước</span>
      </div>
    </Card>
  )
}

function KpiSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} className="space-y-2 p-4" aria-hidden>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-20" />
        </Card>
      ))}
    </>
  )
}

function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div role="group" aria-label="Khoảng thời gian" className="inline-flex overflow-hidden rounded-md border border-border bg-surface">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className={cn('h-9 px-3 text-sm font-medium transition', value === p ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-text')}
        >
          {p} ngày
        </button>
      ))}
    </div>
  )
}

function RowLink({ to, children }: { to: string | null; children: ReactNode }) {
  const cls = 'flex items-center gap-3 px-4 py-2.5 text-sm'
  return to ? <Link to={to} className={cn(cls, 'hover:bg-surface-2')}>{children}</Link> : <div className={cls}>{children}</div>
}

function DashboardBody({ data, days }: { data: Dashboard; days: Period }) {
  const { can } = useAuth()
  const labels = useLabels()
  const statusLabel = useEnumLabel('OrderStatus')
  const [showTable, setShowTable] = useState(false)
  const lowStockRef = useRef<HTMLDivElement>(null)
  const { kpi } = data
  const shares = statusShares(data.statuses)
  const alerts = buildAlerts(data.alerts, can, labels.product)
  const noRevenue = data.series.every((p) => p.revenue === 0 && p.orders === 0)
  const maxQty = Math.max(1, ...data.topProducts.map((t) => t.quantity))

  return (
    <>
      <p className="mb-3 text-xs text-muted">
        Từ {fullDate(data.from)} đến {fullDate(data.to)} ({labels.timezone}). So sánh với {days} ngày liền trước đó.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Doanh thu" value={formatMoney(kpi.revenue, labels.currency)} change={pctChange(kpi.revenue, kpi.previousRevenue)} days={days} hint={REVENUE_DEFINITION} />
        <KpiCard label="Số đơn" value={formatNumber(kpi.orders)} change={pctChange(kpi.orders, kpi.previousOrders)} days={days} />
        <KpiCard label="Giá trị đơn trung bình" value={formatMoney(kpi.averageOrderValue, labels.currency)} change={pctChange(kpi.averageOrderValue, kpi.previousAverageOrderValue)} days={days} />
        <KpiCard label="Khách hàng mới" value={formatNumber(kpi.newCustomers)} change={pctChange(kpi.newCustomers, kpi.previousNewCustomers)} days={days} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`Doanh thu theo ngày (${labels.currency})`}
            description={REVENUE_DEFINITION}
            actions={<button type="button" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)} className="text-xs font-medium text-accent underline-offset-2 hover:underline">{showTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}</button>}
          />
          {showTable ? (
            <RevenueTable series={data.series} currency={labels.currency} />
          ) : (
            <div className="p-4">
              {noRevenue && <p className="mb-2 text-xs text-muted">Chưa có đơn nào trong kỳ này.</p>}
              <RevenueChart series={data.series} currency={labels.currency} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Cần xử lý" />
          {alerts.length === 0 ? (
            <EmptyState title="Không có việc cần xử lý" />
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => {
                const body = (
                  <>
                    {a.count > 0 ? <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />}
                    <span className="min-w-0 flex-1">{a.label}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', a.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-surface-2 text-muted')}>{formatNumber(a.count)}</span>
                    {a.to && <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                  </>
                )
                return (
                  <li key={a.key}>
                    {a.to ? (
                      <RowLink to={a.to}>{body}</RowLink>
                    ) : (
                      <button type="button" onClick={() => lowStockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2">
                        {body}
                        <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-muted" aria-hidden />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title="Cơ cấu trạng thái đơn" description={`Các đơn đặt trong ${days} ngày qua.`} />
          {shares.length === 0 ? (
            <EmptyState title="Chưa có đơn nào trong kỳ" />
          ) : (
            <div className="space-y-3 p-4">
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={shares.map((s) => `${statusLabel(s.status)} ${s.percent}%`).join(', ')}>
                {shares.map((s) => <div key={s.status} className={statusBarClass(s.status)} style={{ width: `${s.percent}%` }} />)}
              </div>
              <ul className="space-y-1.5">
                {shares.map((s) => (
                  <li key={s.status} className="flex items-center gap-2 text-sm">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', statusBarClass(s.status))} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{statusLabel(s.status)}</span>
                    <span className="font-medium">{formatNumber(s.count)}</span>
                    <span className="w-14 text-right text-xs text-muted">{s.percent.toLocaleString('vi-VN')}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title={`Top ${labels.product.toLowerCase()} bán chạy`} description="Theo số lượng bán trong kỳ." />
          {data.topProducts.length === 0 ? (
            <EmptyState title="Chưa có dữ liệu bán hàng" />
          ) : (
            <ol className="divide-y divide-border">
              {data.topProducts.slice(0, 5).map((t, i) => {
                const inner = (
                  <>
                    <span className="w-5 shrink-0 text-xs font-semibold text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.name}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (t.quantity / maxQty) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium">{formatNumber(t.quantity)} đã bán</span>
                      <span className="block text-xs text-muted">{formatMoney(t.revenue, labels.currency)}</span>
                    </span>
                  </>
                )
                return <li key={`${t.productId ?? t.name}-${i}`}>{t.productId && can(P.ProductView) ? <RowLink to={`/products/${t.productId}`}>{inner}</RowLink> : <RowLink to={null}>{inner}</RowLink>}</li>
              })}
            </ol>
          )}
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title="Đơn gần đây" actions={can(P.OrderView) ? <Link to="/orders" className="text-xs font-medium text-accent underline-offset-2 hover:underline">Xem tất cả</Link> : undefined} />
          {data.recentOrders.length === 0 ? (
            <EmptyState title="Chưa có đơn hàng nào" />
          ) : (
            <ul className="divide-y divide-border">
              {data.recentOrders.map((o) => {
                const inner = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.orderNumber}</span>
                      <span className="block truncate text-xs text-muted">{o.customerName} · {formatDateTime(o.placedAt, labels.timezone)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium">{formatMoney(o.grandTotal, labels.currency)}</span>
                      <OrderStatusBadge status={o.status} />
                    </span>
                  </>
                )
                return <li key={o.id}><RowLink to={can(P.OrderView) ? `/orders/${o.id}` : null}>{inner}</RowLink></li>
              })}
            </ul>
          )}
        </Card>

        <div ref={lowStockRef} id="low-stock" className="scroll-mt-20">
          <Card>
            <CardHeader title={`${labels.product} sắp hết hàng`} description={data.alerts.lowStockCount > data.lowStock.length ? `Hiển thị ${data.lowStock.length} trên ${formatNumber(data.alerts.lowStockCount)} mục.` : undefined} />
            {data.lowStock.length === 0 ? (
              <EmptyState title="Tồn kho ổn định" description="Chưa có mục nào dưới ngưỡng cảnh báo." />
            ) : (
              <ul className="divide-y divide-border">
                {data.lowStock.map((s) => {
                  const inner = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.productName}</span>
                        <span className="block truncate text-xs text-muted">{s.sku}{s.variantLabel ? ` · ${s.variantLabel}` : ''}</span>
                      </span>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', s.stock <= 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800')}>
                        {s.stock <= 0 ? 'Hết hàng' : `Còn ${formatNumber(s.stock)}`}
                      </span>
                    </>
                  )
                  return <li key={s.variantId}><RowLink to={can(P.ProductView) ? `/products/${s.productId}` : null}>{inner}</RowLink></li>
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function BodySkeleton() {
  return (
    <div aria-busy aria-label="Đang tải số liệu">
      <Skeleton className="mb-3 h-3 w-64" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><KpiSkeleton /></div>
      <div className="mb-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-4 lg:col-span-2"><Skeleton className="h-60" /></Card>
        <Card className="space-y-3 p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></Card>
      </div>
    </div>
  )
}

/** Tổng quan: số liệu kinh doanh theo kỳ (cần quyền xem tổng quan) + việc cần làm để thiết lập website. */
export default function DashboardPage() {
  const { user, can } = useAuth()
  const labels = useLabels()
  const { data: site } = useSiteConfig()
  const [days, setDays] = useState<Period>(7)
  const canView = can(P.DashboardView)
  const dash = useDashboard(days, canView)
  const products = useCount('products', '/api/admin/products', can(P.ProductView))
  const brands = useCount('brands', '/api/admin/brands', can(P.BrandView))
  const banners = useCount('banners', '/api/admin/banners', can(P.BannerManage))
  const pages = useCount('pages', '/api/admin/pages', can(P.PageManage))

  // Khi không có quyền xem tổng quan, vẫn cho thấy số lượng danh mục mà người dùng được phép xem.
  const stats = [
    { label: labels.product, query: products, to: '/products', show: can(P.ProductView) },
    { label: labels.brand, query: brands, to: '/brands', show: can(P.BrandView) },
    { label: 'Banner', query: banners, to: '/banners', show: can(P.BannerManage) },
    { label: 'Trang nội dung', query: pages, to: '/pages', show: can(P.PageManage) },
  ].filter((s) => s.show)

  const hasLogo = !!site?.media?.['general.logo']
  const hasBusiness = !!site && site.businessType.code !== 'other'
  const checklist = [
    { done: hasLogo, text: 'Tải logo và đặt tên website', to: '/settings/website', show: can(P.WebsiteConfigView) },
    { done: hasBusiness, text: 'Chọn ngành hàng (Business Type)', to: '/settings/store', show: can(P.WebsiteConfigView) },
    { done: (products.data ?? 0) > 0, text: `Thêm ${labels.product.toLowerCase()} đầu tiên`, to: '/products', show: can(P.ProductView) },
    { done: (banners.data ?? 0) > 0, text: 'Tạo banner cho trang chủ', to: '/banners', show: can(P.BannerManage) },
  ].filter((c) => c.show)
  const setupDone = checklist.length > 0 && checklist.every((c) => c.done) && !!site

  return (
    <>
      <PageHeader
        title={`Xin chào, ${user?.fullName ?? ''}`}
        description={`Tổng quan ${labels.siteName}.`}
        actions={canView ? <PeriodPicker value={days} onChange={setDays} /> : undefined}
      />

      {canView && (
        dash.isLoading ? <BodySkeleton />
        : dash.error ? <Card><ErrorState error={dash.error} onRetry={() => dash.refetch()} /></Card>
        : dash.data ? <div className={cn(dash.isPlaceholderData && 'opacity-60 transition-opacity')} aria-busy={dash.isPlaceholderData}><DashboardBody data={dash.data} days={days} /></div>
        : null
      )}

      {!canView && stats.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Link key={s.to} to={s.to}>
              <Card className="p-4 transition hover:border-muted">
                <p className="text-xs text-muted">{s.label}</p>
                <div className="mt-1 text-2xl font-semibold">{s.query.isLoading ? <Skeleton className="h-8 w-12" /> : formatNumber(s.query.data)}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {checklist.length > 0 && !(canView && setupDone) && (
        <Card>
          <CardHeader title="Thiết lập website" description="Các bước nên hoàn tất trước khi mở bán." />
          <ul className="divide-y divide-border">
            {checklist.map((c) => (
              <li key={c.text}>
                <Link to={c.to} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                  {c.done ? <CheckCircle2 className="h-5 w-5 text-success" aria-label="Đã xong" /> : <Circle className="h-5 w-5 text-muted" aria-label="Chưa xong" />}
                  <span className={c.done ? 'text-muted line-through' : ''}>{c.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
