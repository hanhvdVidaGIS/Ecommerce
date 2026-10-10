import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useEnumLabel } from '@/api/hooks'
import { DataTable, EmptyState, type Column } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Button, Card, CardHeader } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { useDeleteAttributeValue, useSaveAttributeValue } from './api'
import { ValueFormModal } from './ValueFormModal'
import { planValueMove, sortValues, valueKind, valueToRequest, type Attribute, type AttributeValue } from './rules'

/** Tab "Giá trị": chỉ có ý nghĩa với kiểu có danh sách (Select/MultiSelect/Color/Image). */
export function ValuesTab({ attribute, canManage }: { attribute: Attribute; canManage: boolean }) {
  const confirm = useConfirm()
  const typeLabel = useEnumLabel('AttributeDataType')
  const save = useSaveAttributeValue(attribute.id)
  const del = useDeleteAttributeValue(attribute.id)
  const [editing, setEditing] = useState<AttributeValue | 'new' | null>(null)
  const [moving, setMoving] = useState(false)
  const kind = valueKind(attribute.dataType)

  if (!kind) {
    return (
      <Card>
        <EmptyState title="Không có danh sách giá trị" description={`Thuộc tính kiểu ${typeLabel(attribute.dataType)} nhận giá trị nhập trực tiếp trên sản phẩm, nên không cần danh sách giá trị.`} />
      </Card>
    )
  }

  const values = sortValues(attribute.values)

  const remove = async (v: AttributeValue) => {
    if (!(await confirm({ title: `Xoá giá trị "${v.label}"?`, message: 'Không xoá được nếu giá trị đang được sản phẩm sử dụng.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(v.id)
      toast.success('Đã xoá')
    } catch (e) {
      toastError(e, 'Không xoá được.')
    }
  }

  // Backend không có API sắp xếp hàng loạt cho giá trị: mỗi giá trị đổi thứ tự là một lần lưu.
  const move = async (v: AttributeValue, dir: 'up' | 'down') => {
    const changes = planValueMove(attribute.values, v.id, dir)
    if (changes.length === 0) return
    setMoving(true)
    try {
      await Promise.all(changes.map((c) => {
        const target = attribute.values.find((x) => x.id === c.id)!
        return save.mutateAsync({ valueId: c.id, body: valueToRequest(target, { sortOrder: c.sortOrder }) })
      }))
    } catch (e) {
      toastError(e, 'Không đổi được thứ tự.')
    } finally {
      setMoving(false)
    }
  }

  const columns: Column<AttributeValue>[] = [
    {
      key: 'label', header: 'Giá trị',
      cell: (v) => (
        <div className="flex items-center gap-3">
          {kind === 'color' && <span aria-hidden className="h-6 w-6 shrink-0 rounded-full border border-border" style={{ backgroundColor: v.colorHex ?? 'transparent' }} />}
          {kind === 'image' && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2">{v.image && <img src={v.image.url} alt="" className="h-full w-full object-contain" />}</span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{v.label}</p>
            {kind === 'color' && <p className="font-mono text-xs text-muted">{v.colorHex}</p>}
          </div>
        </div>
      ),
    },
    { key: 'code', header: 'Mã', cell: (v) => <code className="text-xs">{v.code}</code>, hideOnMobile: true },
    { key: 'sort', header: 'Thứ tự', cell: (v) => v.sortOrder, hideOnMobile: true },
    {
      key: 'actions', header: <span className="sr-only">Thao tác</span>, className: 'w-44 text-right',
      cell: (v) => canManage && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="px-2" aria-label={`Đưa ${v.label} lên`} disabled={moving || v.id === values[0].id} onClick={() => move(v, 'up')}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
          <Button variant="ghost" size="sm" className="px-2" aria-label={`Đưa ${v.label} xuống`} disabled={moving || v.id === values[values.length - 1].id} onClick={() => move(v, 'down')}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
          <Button variant="ghost" size="sm" className="px-2" aria-label={`Sửa ${v.label}`} onClick={() => setEditing(v)}><Pencil className="h-4 w-4" aria-hidden /></Button>
          <Button variant="ghost" size="sm" className="px-2" aria-label={`Xoá ${v.label}`} onClick={() => remove(v)}><Trash2 className="h-4 w-4 text-danger" aria-hidden /></Button>
        </div>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader
        title={`Giá trị (${values.length})`}
        description={kind === 'color' ? 'Mỗi giá trị gồm nhãn và mã màu #RRGGBB.' : kind === 'image' ? 'Mỗi giá trị gồm nhãn và một ảnh.' : 'Danh sách lựa chọn của thuộc tính.'}
        actions={canManage && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Thêm giá trị</Button>}
      />
      <DataTable
        columns={columns}
        rows={values}
        rowKey={(v) => v.id}
        empty={<EmptyState title="Chưa có giá trị nào" description="Thêm giá trị để người dùng chọn khi nhập sản phẩm." action={canManage ? <Button onClick={() => setEditing('new')}>Thêm giá trị</Button> : undefined} />}
      />
      {editing && (
        <ValueFormModal attributeId={attribute.id} kind={kind} value={editing === 'new' ? null : editing} values={attribute.values} onClose={() => setEditing(null)} />
      )}
    </Card>
  )
}
