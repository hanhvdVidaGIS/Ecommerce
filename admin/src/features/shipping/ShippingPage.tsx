import { Info, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useLabels } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { Can } from '@/auth/guards'
import { DataTable, EmptyState, PageHeader, type Column } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { formatMoney } from '@/lib/format'
import { ShippingQuoteCard } from './ShippingQuoteCard'
import { ShippingRateFormModal } from './ShippingRateFormModal'
import { useDeleteShippingRate, useShippingRates } from './api'
import { nextSortOrder, type ShippingRate } from './model'

/** Luật tính phí hiển thị cho người quản trị; phải khớp thuật toán chọn mức ở backend. */
const RULES = [
  'Ưu tiên mức riêng của tỉnh/thành khách chọn, rồi mới đến mức áp dụng cho tất cả tỉnh/thành.',
  'Trong cùng nhóm, chọn mức có "đơn tối thiểu" cao hơn mà tạm tính còn đạt; bằng nhau thì thứ tự nhỏ hơn được chọn trước.',
  'Tạm tính đạt "miễn phí từ" của mức được chọn thì phí giao hàng bằng 0.',
  'Không có mức nào đang bật khớp với đơn thì phí giao hàng bằng 0.',
]

export default function ShippingPage() {
  const { currency } = useLabels()
  const { can } = useAuth()
  const confirm = useConfirm()
  const list = useShippingRates()
  const del = useDeleteShippingRate()
  const [editing, setEditing] = useState<ShippingRate | 'new' | null>(null)
  const canManage = can(P.StoreConfigUpdate)
  const money = (n: number) => formatMoney(n, currency)

  const remove = async (r: ShippingRate) => {
    if (!(await confirm({ title: `Xoá mức phí "${r.name}"?`, message: 'Các đơn mới sẽ không còn được tính theo mức này.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(r.id)
      toast.success('Đã xoá mức phí')
    } catch (e) {
      toastError(e, 'Không xoá được.')
    }
  }

  const columns: Column<ShippingRate>[] = [
    {
      key: 'name', header: 'Tên mức phí',
      cell: (r) => (
        <div>
          <span className="font-medium">{r.name}</span>
          {/* Điện thoại: cột phụ nằm ngoài vùng nhìn thấy nên tóm tắt ngay dưới tên. */}
          <span className="block text-xs text-muted md:hidden">{r.provinceCode ? (r.provinceName ?? r.provinceCode) : 'Tất cả tỉnh/thành'} · {money(r.fee)}</span>
        </div>
      ),
    },
    { key: 'province', header: 'Áp dụng cho', cell: (r) => (r.provinceCode ? (r.provinceName ?? r.provinceCode) : <span className="text-muted">Tất cả tỉnh/thành</span>), hideOnMobile: true },
    { key: 'min', header: 'Đơn tối thiểu', cell: (r) => (r.minOrderAmount ? money(r.minOrderAmount) : '—'), hideOnMobile: true },
    { key: 'fee', header: 'Phí', cell: (r) => money(r.fee), hideOnMobile: true },
    { key: 'free', header: 'Miễn phí từ', cell: (r) => (r.freeShipThreshold ? money(r.freeShipThreshold) : '—'), hideOnMobile: true },
    { key: 'sort', header: 'Thứ tự', cell: (r) => r.sortOrder, hideOnMobile: true },
    { key: 'status', header: 'Trạng thái', cell: (r) => <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Đang bật' : 'Đã tắt'}</Badge> },
    {
      key: 'actions', header: <span className="sr-only">Thao tác</span>, className: 'w-24 text-right',
      cell: (r) => canManage && (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label={`Sửa mức phí ${r.name}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" aria-label={`Xoá mức phí ${r.name}`} onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-danger" /></Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Vận chuyển"
        description="Cấu hình phí giao hàng theo tỉnh/thành và giá trị đơn."
        actions={<Can permission={P.StoreConfigUpdate}><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Thêm mức phí</Button></Can>}
      />
      <Card className="mb-4 flex gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <div className="text-xs text-muted">
          <p className="mb-1 font-medium text-text">Cách tính phí giao hàng</p>
          <ol className="list-decimal space-y-0.5 pl-4">{RULES.map((r) => <li key={r}>{r}</li>)}</ol>
        </div>
      </Card>
      <Card>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(r) => r.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          empty={<EmptyState title="Chưa có mức phí nào" description="Khi chưa có mức nào đang bật, phí giao hàng là 0." action={canManage ? <Button onClick={() => setEditing('new')}>Thêm mức phí</Button> : undefined} />}
        />
      </Card>
      <ShippingQuoteCard />
      {editing && <ShippingRateFormModal rate={editing === 'new' ? null : editing} defaultSortOrder={nextSortOrder(list.data)} onClose={() => setEditing(null)} />}
    </>
  )
}
