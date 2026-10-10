import { Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useEnumLabel, useLabels } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { Can } from '@/auth/guards'
import { DataTable, EmptyState, PageHeader, type Column } from '@/components/ui/data'
import { Modal, useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Input } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { useDebounce } from '@/lib/useDebounce'
import { AttributeForm } from './AttributeForm'
import { useAttributes, useDeleteAttribute } from './api'
import type { AttributeListItem } from './rules'

export default function AttributesPage() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const confirm = useConfirm()
  const labels = useLabels()
  const typeLabel = useEnumLabel('AttributeDataType')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const q = useDebounce(search.trim(), 300)
  const list = useAttributes(q)
  const del = useDeleteAttribute()
  const canManage = can(P.AttributeManage)

  const remove = async (a: AttributeListItem) => {
    if (!(await confirm({ title: `Xoá thuộc tính "${a.name}"?`, message: 'Các giá trị và liên kết với danh mục cũng bị xoá. Không xoá được nếu thuộc tính đang được sản phẩm sử dụng.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(a.id)
      toast.success('Đã xoá')
    } catch (e) {
      toastError(e, 'Không xoá được.')
    }
  }

  const columns: Column<AttributeListItem>[] = [
    { key: 'name', header: 'Tên', cell: (a) => <div className="min-w-0"><p className="truncate font-medium">{a.name}</p><p className="truncate text-xs text-muted md:hidden">{a.code}</p></div> },
    { key: 'code', header: 'Mã', cell: (a) => <code className="text-xs">{a.code}</code>, hideOnMobile: true },
    { key: 'type', header: 'Kiểu dữ liệu', cell: (a) => typeLabel(a.dataType) },
    {
      key: 'flags', header: 'Đặc tính',
      cell: (a) => (
        <div className="flex flex-wrap gap-1">
          {a.isFilterable && <Badge tone="info">Lọc được</Badge>}
          {a.isVariantOption && <Badge tone="success">Tạo biến thể</Badge>}
          {!a.isActive && <Badge>Tắt</Badge>}
        </div>
      ),
    },
    { key: 'values', header: 'Giá trị', cell: (a) => a.valueCount, hideOnMobile: true },
    { key: 'cats', header: 'Danh mục', cell: (a) => a.categoryCount, hideOnMobile: true },
    {
      key: 'actions', header: <span className="sr-only">Thao tác</span>, className: 'w-14 text-right',
      cell: (a) => canManage && (
        <Button variant="ghost" size="sm" aria-label={`Xoá ${a.name}`} onClick={(e) => { e.stopPropagation(); remove(a) }}><Trash2 className="h-4 w-4 text-danger" aria-hidden /></Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Thuộc tính"
        description={`Thuộc tính động của ${labels.product.toLowerCase()}, kèm danh sách giá trị và ${labels.category.toLowerCase()} áp dụng.`}
        actions={<Can permission={P.AttributeManage}><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Thêm thuộc tính</Button></Can>}
      />
      <Card>
        <div className="border-b border-border p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Tìm thuộc tính" placeholder="Tìm theo tên hoặc mã..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(a) => a.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          onRowClick={(a) => navigate(`/attributes/${a.id}`)}
          empty={<EmptyState title={q ? 'Không tìm thấy kết quả' : 'Chưa có thuộc tính nào'} description={q ? 'Thử từ khoá khác.' : undefined} action={!q && canManage ? <Button onClick={() => setCreating(true)}>Thêm thuộc tính</Button> : undefined} />}
        />
      </Card>
      {creating && (
        <Modal
          open
          onClose={() => setCreating(false)}
          size="lg"
          title="Thêm thuộc tính"
          description="Sau khi tạo, thêm giá trị và chọn danh mục áp dụng ở trang chi tiết."
          footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Huỷ</Button><Button type="submit" form="attribute-create">Tạo</Button></>}
        >
          <AttributeForm formId="attribute-create" attribute={null} onSaved={(a) => { setCreating(false); navigate(`/attributes/${a.id}`) }} />
        </Modal>
      )}
    </>
  )
}
