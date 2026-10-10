import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Printer } from 'lucide-react'
import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { P } from '@/api/catalog.generated'
import { ApiError } from '@/api/client'
import { useEnumLabel, useLabels } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Button, Card, CardHeader, FormField, Skeleton, Textarea } from '@/components/ui/primitives'
import { applyApiError, emptyToNull, toastError } from '@/lib/forms'
import { formatDateTime, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAddOrderNote, useChangeOrderStatus, useMarkOrderPaid, useOrder, useOrderReload, type Order, type OrderStatus } from './api'
import { canMarkPaid, isNoteEntry, shouldReloadAfter, showBankInstructions, statusActions } from './model'
import { OrderStatusBadge, PaymentStatusBadge } from './StatusBadge'

const noteSchema = z.object({ note: z.string().max(500, 'Ghi chú tối đa 500 ký tự.') })
type NoteValues = z.input<typeof noteSchema>

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4 py-1 text-sm', strong && 'border-t border-border pt-2 text-base font-semibold')}>
      <dt className={strong ? '' : 'text-muted'}>{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words text-sm">{children || '—'}</dd>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải đơn hàng">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const query = useOrder(id)
  const order = query.data

  if (query.isLoading) return <DetailSkeleton />
  if (query.error || !order) {
    const notFound = query.error instanceof ApiError && query.error.status === 404
    return (
      <>
        <PageHeader title="Đơn hàng" actions={<Link to="/orders" className="text-sm text-accent hover:underline">Về danh sách đơn</Link>} />
        <Card>
          {notFound ? <EmptyState title="Không tìm thấy đơn hàng" description="Đơn có thể đã bị xoá hoặc đường dẫn không đúng." /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />}
        </Card>
      </>
    )
  }
  return <OrderDetail order={order} />
}

function OrderDetail({ order }: { order: Order }) {
  const labels = useLabels()
  const { can } = useAuth()
  const confirm = useConfirm()
  const statusLabel = useEnumLabel('OrderStatus')
  const methodLabel = useEnumLabel('PaymentMethod')
  const change = useChangeOrderStatus(order.id)
  const markPaid = useMarkOrderPaid(order.id)
  const addNote = useAddOrderNote(order.id)
  const reload = useOrderReload(order.id)
  const form = useForm<NoteValues>({ resolver: zodResolver(noteSchema), defaultValues: { note: '' } })
  const confirmNote = useRef('')
  const money = (v: number) => formatMoney(v, labels.currency)
  const busy = change.isPending || markPaid.isPending || addNote.isPending

  const actions = statusActions(order.nextStatuses, can)
  const markPaidVisible = canMarkPaid(order, can)
  const canNote = can(P.OrderUpdate)

  /** Lỗi 409 (đơn đã đổi ở nơi khác / bước đi không hợp lệ): báo và tải lại đơn để các nút khớp trạng thái thật. */
  const onError = (e: unknown, fallback: string) => {
    toastError(e, fallback)
    if (e instanceof ApiError && shouldReloadAfter(e)) reload()
  }

  const changeStatus = async (status: OrderStatus, destructive: boolean) => {
    let note = form.getValues('note')
    if (!(await form.trigger('note'))) return
    if (destructive) {
      confirmNote.current = note
      const ok = await confirm({
        title: `Chuyển đơn ${order.orderNumber} sang "${statusLabel(status)}"?`,
        message: (
          <div className="space-y-3">
            <p>Thao tác này không hoàn tác được. Có thể ghi chú lý do để lưu vào lịch sử đơn.</p>
            <FormField label="Ghi chú (tuỳ chọn)" htmlFor="confirm-note">
              <Textarea id="confirm-note" maxLength={500} defaultValue={note} onChange={(e) => { confirmNote.current = e.target.value }} />
            </FormField>
          </div>
        ),
        confirmLabel: statusLabel(status),
      })
      if (!ok) return
      note = confirmNote.current
    }
    try {
      await change.mutateAsync({ status, note: emptyToNull(note) })
      form.reset({ note: '' })
      toast.success(`Đã chuyển đơn sang "${statusLabel(status)}"`)
    } catch (e) {
      onError(e, 'Không đổi được trạng thái đơn.')
    }
  }

  const doMarkPaid = async () => {
    try {
      await markPaid.mutateAsync()
      toast.success('Đã ghi nhận thanh toán')
    } catch (e) {
      onError(e, 'Không ghi nhận được thanh toán.')
    }
  }

  const submitNote = async () => {
    const text = form.getValues('note').trim()
    if (!text) { form.setError('note', { type: 'validate', message: 'Nhập nội dung ghi chú.' }); return }
    if (!(await form.trigger('note'))) return
    try {
      await addNote.mutateAsync(text)
      form.reset({ note: '' })
      toast.success('Đã thêm ghi chú')
    } catch (e) {
      applyApiError(form, e, 'Không thêm được ghi chú.')
    }
  }

  const history = [...order.history].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const bank = order.bankTransfer

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>Đơn {order.orderNumber}</span>
            <OrderStatusBadge status={order.status} />
          </span>
        }
        description={`Đặt lúc ${formatDateTime(order.placedAt, labels.timezone)}`}
        actions={
          <div className="print:hidden flex flex-wrap items-center gap-2">
            <Link to="/orders" className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2"><ArrowLeft className="h-4 w-4" aria-hidden /> Danh sách đơn</Link>
            <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> In phiếu</Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Sản phẩm" description={`${order.items.length} dòng`} />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium text-muted">
                    <th scope="col" className="px-4 py-2.5 font-medium">{labels.product}</th>
                    <th scope="col" className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Đơn giá</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">SL</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it) => (
                    <tr key={it.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2">
                            {it.imageUrl && <img src={it.imageUrl} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium">{it.productName}</p>
                            {it.variantName && <p className="text-xs text-muted">{it.variantName}</p>}
                            <p className="text-xs text-muted">SKU: {it.sku}</p>
                            <p className="text-xs text-muted md:hidden">{money(it.unitPrice)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right md:table-cell">{money(it.unitPrice)}</td>
                      <td className="px-4 py-3 text-right">{it.quantity}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{money(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="border-t border-border px-4 py-3">
              <Row label="Tạm tính">{money(order.subtotal)}</Row>
              <Row label={order.couponCode ? `Giảm giá (mã ${order.couponCode})` : 'Giảm giá'}>{order.discountTotal > 0 ? `− ${money(order.discountTotal)}` : money(0)}</Row>
              <Row label="Phí vận chuyển">{money(order.shippingFee)}</Row>
              <Row label="Tổng cộng" strong>{money(order.grandTotal)}</Row>
            </dl>
          </Card>

          <Card className="print:hidden">
            <CardHeader title="Lịch sử đơn hàng" />
            {history.length === 0 ? (
              <EmptyState title="Chưa có lịch sử" />
            ) : (
              <ol className="space-y-0 px-4 py-3">
                {history.map((h, i) => {
                  const note = isNoteEntry(h)
                  return (
                    <li key={`${h.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                      <span aria-hidden className={cn('relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', note ? 'bg-muted' : 'bg-accent')} />
                      {i < history.length - 1 && <span aria-hidden className="absolute left-[4.5px] top-4 h-full w-px bg-border" />}
                      <div className="min-w-0 text-sm">
                        {note ? (
                          <p className="font-medium">Ghi chú nội bộ</p>
                        ) : (
                          <p className="flex flex-wrap items-center gap-1.5 font-medium">
                            {h.from && <><span>{statusLabel(h.from)}</span><span aria-hidden className="text-muted">→</span></>}
                            <span>{statusLabel(h.to)}</span>
                          </p>
                        )}
                        {h.note && <p className="mt-0.5 whitespace-pre-wrap break-words text-muted">{h.note}</p>}
                        <p className="mt-0.5 text-xs text-muted">{formatDateTime(h.at, labels.timezone)}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Khách hàng và giao hàng" />
            <dl className="space-y-3 px-4 py-3">
              <Info label="Người nhận">{order.customerName}</Info>
              <Info label="Số điện thoại">{order.phone}</Info>
              <Info label="Email">{order.email}</Info>
              <Info label="Địa chỉ giao">{[order.shippingAddress, order.wardName, order.provinceName].filter(Boolean).join(', ')}</Info>
              {order.note && <Info label="Ghi chú của khách"><span className="whitespace-pre-wrap">{order.note}</span></Info>}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Thanh toán" />
            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <PaymentStatusBadge status={order.paymentStatus} />
              </div>
              <ul className="space-y-1.5 text-sm">
                {order.payments.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{methodLabel(p.method)}</span>
                    <span className="flex items-center gap-2"><span className="font-medium">{money(p.amount)}</span><PaymentStatusBadge status={p.status} /></span>
                    {p.paidAt && <span className="w-full text-xs text-muted">Thanh toán lúc {formatDateTime(p.paidAt, labels.timezone)}</span>}
                  </li>
                ))}
              </ul>
              {showBankInstructions(order) && bank && (
                <div className="rounded-md bg-surface-2 p-3">
                  <p className="mb-2 text-xs font-medium">Hướng dẫn chuyển khoản</p>
                  <dl className="space-y-2">
                    <Info label="Ngân hàng">{bank.bank}</Info>
                    <Info label="Số tài khoản"><span className="font-mono">{bank.accountNumber}</span></Info>
                    <Info label="Chủ tài khoản">{bank.accountName}</Info>
                    <Info label="Nội dung chuyển khoản"><span className="font-mono">{bank.transferContent}</span></Info>
                  </dl>
                </div>
              )}
              {markPaidVisible && (
                <Button className="print:hidden w-full" variant="secondary" loading={markPaid.isPending} disabled={busy} onClick={doMarkPaid}>Ghi nhận đã thanh toán</Button>
              )}
            </div>
          </Card>

          {(actions.length > 0 || canNote) && (
            <Card className="print:hidden">
              <CardHeader title="Xử lý đơn" description="Ghi chú được lưu vào lịch sử đơn." />
              <div className="space-y-3 px-4 py-3">
                <FormField label="Ghi chú" htmlFor="order-note" error={form.formState.errors.note?.message}>
                  <Textarea id="order-note" maxLength={500} invalid={!!form.formState.errors.note} placeholder="Nội dung ghi chú nội bộ..." {...form.register('note', { onChange: () => form.clearErrors('note') })} />
                </FormField>
                {canNote && (
                  <Button variant="secondary" size="sm" loading={addNote.isPending} disabled={busy} onClick={submitNote}>Thêm ghi chú</Button>
                )}
                {actions.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium">Chuyển trạng thái sang</p>
                    <div className="flex flex-wrap gap-2">
                      {actions.map((a) => (
                        <Button
                          key={a.status}
                          variant={a.destructive ? 'danger' : 'primary'}
                          size="sm"
                          loading={change.isPending && change.variables?.status === a.status}
                          disabled={busy}
                          onClick={() => changeStatus(a.status, a.destructive)}
                        >
                          {statusLabel(a.status)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {actions.length === 0 && order.nextStatuses.length === 0 && <p className="text-xs text-muted">Đơn đã ở trạng thái cuối, không còn bước chuyển tiếp.</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
