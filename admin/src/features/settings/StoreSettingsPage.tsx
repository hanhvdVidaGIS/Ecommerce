import { Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthProvider'
import { ErrorState, PageHeader } from '@/components/ui/data'
import { Modal } from '@/components/ui/overlays'
import { Badge, Button, Card, CardHeader, Checkbox, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { SettingsForm } from './SettingsForm'
import { useApplyPreset, useBusinessTypes, type ApplyPresetResult, type BusinessTypeItem } from './api'

const onlyStore = (group: string) => group === 'store'
// Ngành hàng được đổi bằng "Áp dụng gói" (an toàn, chỉ thêm), không sửa trực tiếp như các khoá khác.
const notBusinessType = (s: { control: string }) => s.control === 'business-type'

export default function StoreSettingsPage() {
  const { can } = useAuth()
  const canEdit = can(P.StoreConfigUpdate)
  return (
    <>
      <PageHeader title="Store Configuration" description="Ngành hàng, nhãn hiển thị, tiền tệ và thanh toán. Đổi ngành hàng sẽ thêm danh mục, thuộc tính và nhãn của ngành đó." />
      <div className="space-y-4">
        <BusinessTypePanel canEdit={canEdit} />
        <SettingsForm include={onlyStore} exclude={notBusinessType} canEdit={canEdit} />
      </div>
    </>
  )
}

function BusinessTypePanel({ canEdit }: { canEdit: boolean }) {
  const types = useBusinessTypes()
  const [target, setTarget] = useState<BusinessTypeItem | null>(null)

  return (
    <Card>
      <CardHeader title="Ngành hàng (Business Type)" description="Mỗi ngành là một gói cấu hình gồm nhãn, thuộc tính và danh mục gợi ý. Áp dụng chỉ thêm mới, không xoá hay sửa dữ liệu hiện có." />
      <div className="p-4">
        {types.error ? (
          <ErrorState error={types.error} onRetry={() => types.refetch()} />
        ) : types.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {types.data?.map((t) => (
              <li key={t.code}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setTarget(t)}
                  className={cn('h-full w-full rounded-lg border p-3 text-left transition disabled:cursor-default', t.isCurrent ? 'border-accent bg-surface-2' : 'border-border hover:border-muted')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    {t.isCurrent && <Badge tone="success"><Check className="mr-1 h-3 w-3" aria-hidden />Đang dùng</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{t.description}</p>
                  <p className="mt-2 text-xs text-muted">{t.attributeCount} thuộc tính · {t.categoryCount} danh mục gợi ý</p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!canEdit && <p className="mt-3 text-xs text-muted">Bạn không có quyền đổi ngành hàng.</p>}
      </div>
      {target && <ApplyPresetModal type={target} onClose={() => setTarget(null)} />}
    </Card>
  )
}

function ApplyPresetModal({ type, onClose }: { type: BusinessTypeItem; onClose: () => void }) {
  const apply = useApplyPreset()
  const [applyLabels, setApplyLabels] = useState(true)
  const [preview, setPreview] = useState<ApplyPresetResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (dryRun: boolean) => {
    setError(null)
    try {
      const result = await apply.mutateAsync({ code: type.code, dryRun, applyLabels })
      if (dryRun) setPreview(result)
      else {
        toast.success(`Đã áp dụng gói "${type.name}"`)
        onClose()
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không áp dụng được gói')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Áp dụng gói "${type.name}"`}
      description="Xem trước phạm vi ảnh hưởng trước khi áp dụng."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button variant="secondary" loading={apply.isPending && !preview} onClick={() => run(true)}>Xem trước</Button>
          <Button onClick={() => run(false)} loading={apply.isPending && !!preview} disabled={!preview}>Áp dụng</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <Checkbox checked={applyLabels} onChange={(e) => { setApplyLabels(e.target.checked); setPreview(null) }} label="Cập nhật nhãn hiển thị (sản phẩm, danh mục, thương hiệu) theo ngành" />
        {preview ? (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md bg-surface-2 p-3 text-xs">
            <dt>Thuộc tính sẽ tạo mới</dt><dd className="font-medium">{preview.attributesCreated}</dd>
            <dt>Thuộc tính đã có (giữ nguyên)</dt><dd>{preview.attributesExisting}</dd>
            <dt>Giá trị thuộc tính sẽ thêm</dt><dd className="font-medium">{preview.valuesCreated}</dd>
            <dt>Danh mục sẽ tạo mới</dt><dd className="font-medium">{preview.categoriesCreated}</dd>
            <dt>Danh mục đã có (giữ nguyên)</dt><dd>{preview.categoriesExisting}</dd>
          </dl>
        ) : (
          <p className="text-xs text-muted">Nhấn "Xem trước" để biết sẽ thêm bao nhiêu mục. Sản phẩm, danh mục và thuộc tính hiện có không bị xoá hay đổi.</p>
        )}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
