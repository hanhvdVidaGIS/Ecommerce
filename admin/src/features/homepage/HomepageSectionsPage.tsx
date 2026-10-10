import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useEnumLabel } from '@/api/hooks'
import { Can } from '@/auth/guards'
import { buildReorderPayload } from '@/components/content/reorder'
import { SortableList } from '@/components/content/SortableList'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Skeleton, Switch } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { toggleBody, useDeleteSection, useHomepageSections, useReorderSections, useSaveSection, type HomepageSection } from './api'
import { SectionFormModal } from './SectionFormModal'

export default function HomepageSectionsPage() {
  const typeLabel = useEnumLabel('HomepageSectionType')
  const confirm = useConfirm()
  const list = useHomepageSections()
  const save = useSaveSection()
  const del = useDeleteSection()
  const reorder = useReorderSections()
  const [editing, setEditing] = useState<HomepageSection | 'new' | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const rows = list.data

  const toggle = async (s: HomepageSection, isActive: boolean) => {
    setTogglingId(s.id)
    try {
      await save.mutateAsync({ id: s.id, body: toggleBody(s, isActive) })
      toast.success(isActive ? 'Đã bật section' : 'Đã tắt section')
    } catch (e) {
      toastError(e, 'Không đổi được trạng thái.')
    } finally {
      setTogglingId(null)
    }
  }

  const remove = async (s: HomepageSection) => {
    const name = s.title || typeLabel(s.type)
    if (!(await confirm({ title: `Xoá section "${name}"?`, message: 'Section sẽ biến mất khỏi trang chủ. Không thể hoàn tác.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(s.id)
      toast.success('Đã xoá section')
    } catch (e) {
      toastError(e, 'Không xoá được section.')
    }
  }

  const onReorder = async (next: HomepageSection[]) => {
    const payload = buildReorderPayload(rows ?? [], next.map((s) => s.id))
    if (payload.length === 0) return
    try {
      await reorder.mutateAsync(payload)
      toast.success('Đã lưu thứ tự')
    } catch (e) {
      toastError(e, 'Không lưu được thứ tự.')
    }
  }

  const nextSort = (rows ?? []).reduce((max, s) => Math.max(max, s.sortOrder), 0) + 10

  return (
    <>
      <PageHeader
        title="Section trang chủ"
        description="Các khối nội dung trên trang chủ, hiển thị từ trên xuống theo thứ tự. Kéo để đổi thứ tự."
        actions={<Can permission={P.HomepageSectionManage}><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Thêm section</Button></Can>}
      />
      <Card>
        {list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isLoading || !rows ? (
          <div className="space-y-3 p-4" aria-busy>
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Chưa có section nào" description="Thêm section để dựng trang chủ." action={<Button onClick={() => setEditing('new')}>Thêm section</Button>} />
        ) : (
          <SortableList
            items={rows}
            onReorder={onReorder}
            getLabel={(s) => s.title || typeLabel(s.type)}
            renderItem={(s) => (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={s.isActive ? 'info' : 'neutral'}>{typeLabel(s.type)}</Badge>
                    <p className="truncate font-medium">{s.title || <span className="text-muted">(Không có tiêu đề)</span>}</p>
                  </div>
                  {s.subtitle && <p className="mt-0.5 truncate text-xs text-muted">{s.subtitle}</p>}
                </div>
                <Switch
                  aria-label={`${s.isActive ? 'Tắt' : 'Bật'} section ${s.title || typeLabel(s.type)}`}
                  checked={s.isActive}
                  disabled={togglingId === s.id}
                  onChange={(e) => toggle(s, e.target.checked)}
                />
                <div className="flex shrink-0">
                  <Button variant="ghost" size="sm" aria-label={`Sửa ${s.title || typeLabel(s.type)}`} onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" aria-label={`Xoá ${s.title || typeLabel(s.type)}`} onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                </div>
              </div>
            )}
          />
        )}
      </Card>
      {editing && <SectionFormModal section={editing === 'new' ? null : editing} defaultSortOrder={nextSort} onClose={() => setEditing(null)} />}
    </>
  )
}
