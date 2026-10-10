import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { P } from '@/api/catalog.generated'
import { ApiError } from '@/api/client'
import { useEnumLabel } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { EmptyState, ErrorState, PageHeader, Tabs } from '@/components/ui/data'
import { Badge, Button, Card, Skeleton } from '@/components/ui/primitives'
import { AttributeForm } from './AttributeForm'
import { CategoriesTab } from './CategoriesTab'
import { ValuesTab } from './ValuesTab'
import { useAttribute } from './api'

type TabKey = 'info' | 'values' | 'categories'

export default function AttributeEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { can } = useAuth()
  const typeLabel = useEnumLabel('AttributeDataType')
  const query = useAttribute(id)
  const [tab, setTab] = useState<TabKey>('info')
  const canManage = can(P.AttributeManage)
  const attribute = query.data

  const back = <Link to="/attributes" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft className="h-4 w-4" aria-hidden /> Thuộc tính</Link>

  if (query.isLoading) {
    return <>{back}<div className="space-y-3" aria-busy><Skeleton className="h-7 w-64" /><Skeleton className="h-9" /><Skeleton className="h-48" /></div></>
  }
  if (query.error || !attribute) {
    const notFound = query.error instanceof ApiError && query.error.status === 404
    return <>{back}<Card>{notFound ? <EmptyState title="Không tìm thấy thuộc tính" description="Thuộc tính có thể đã bị xoá." action={<Link to="/attributes"><Button variant="secondary">Về danh sách</Button></Link>} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />}</Card></>
  }

  return (
    <>
      {back}
      <PageHeader
        title={attribute.name}
        description={<span className="inline-flex flex-wrap items-center gap-2"><code className="text-xs">{attribute.code}</code><Badge>{typeLabel(attribute.dataType)}</Badge>{!attribute.isActive && <Badge>Tắt</Badge>}</span>}
      />
      {!canManage && <p className="mb-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">Bạn chỉ có quyền xem thuộc tính này.</p>}
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'info', label: 'Thông tin' },
          { key: 'values', label: `Giá trị (${attribute.values.length})` },
          { key: 'categories', label: `Danh mục áp dụng (${attribute.categoryIds.length})` },
        ]}
      />
      <div role="tabpanel" className="mt-4">
        {tab === 'info' && (
          <Card className="p-4">
            <AttributeForm
              key={attribute.id}
              formId="attribute-edit"
              attribute={attribute}
              readOnly={!canManage}
              onSaved={() => undefined}
              actions={canManage && <div className="flex justify-end"><Button type="submit">Lưu</Button></div>}
            />
          </Card>
        )}
        {tab === 'values' && <ValuesTab attribute={attribute} canManage={canManage} />}
        {tab === 'categories' && <CategoriesTab key={attribute.categoryIds.join(',')} attribute={attribute} canManage={canManage} />}
      </div>
    </>
  )
}
