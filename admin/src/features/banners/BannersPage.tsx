import { ImageOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useLabels, useMeta } from '@/api/hooks'
import { Can } from '@/auth/guards'
import { buildReorderPayload } from '@/components/content/reorder'
import { SortableList } from '@/components/content/SortableList'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Select, Skeleton } from '@/components/ui/primitives'
import { formatDateTime } from '@/lib/format'
import { toastError } from '@/lib/forms'
import { useBanners, useDeleteBanner, useReorderBanners, type Banner } from './api'
import { BannerFormModal } from './BannerFormModal'
import { placementLabel } from './placements'
import { bannerSchedule, SCHEDULE_LABEL, SCHEDULE_TONE } from './schedule'

function Thumb({ banner }: { banner: Banner }) {
  const img = banner.desktopImage ?? banner.mobileImage
  return (
    <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2 sm:h-14 sm:w-28">
      {img ? <img src={img.url} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-muted" aria-label="Chưa có ảnh" />}
    </div>
  )
}

export default function BannersPage() {
  const labels = useLabels()
  const meta = useMeta()
  const confirm = useConfirm()
  const [placement, setPlacement] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<Banner | 'new' | null>(null)
  const list = useBanners({ placement: placement || undefined, status: status || undefined })
  const del = useDeleteBanner()
  const reorder = useReorderBanners()
  const rows = list.data?.data
  const filtered = !!placement || !!status

  const remove = async (b: Banner) => {
    if (!(await confirm({ title: `Xoá banner "${b.title}"?`, message: 'Banner sẽ biến mất khỏi trang web ngay. Không thể hoàn tác.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(b.id)
      toast.success('Đã xoá banner')
    } catch (e) {
      toastError(e, 'Không xoá được banner.')
    }
  }

  const onReorder = async (next: Banner[]) => {
    const payload = buildReorderPayload(rows ?? [], next.map((b) => b.id))
    if (payload.length === 0) return
    try {
      await reorder.mutateAsync(payload)
      toast.success('Đã lưu thứ tự')
    } catch (e) {
      toastError(e, 'Không lưu được thứ tự.')
    }
  }

  const statusOptions = meta.data?.enums['PublishStatus'] ?? []
  const nextSort = (rows ?? []).reduce((max, b) => Math.max(max, b.sortOrder), 0) + 10

  return (
    <>
      <PageHeader
        title="Banner"
        description={`Ảnh quảng bá trên website ${labels.siteName}. Kéo để đổi thứ tự hiển thị.`}
        actions={<Can permission={P.BannerManage}><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Thêm banner</Button></Can>}
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-3">
          <Select aria-label="Lọc theo vị trí" className="w-44" value={placement} onChange={(e) => setPlacement(e.target.value)}>
            <option value="">Mọi vị trí</option>
            {(meta.data?.bannerPlacements ?? []).map((p) => <option key={p} value={p}>{placementLabel(p)}</option>)}
          </Select>
          <Select aria-label="Lọc theo trạng thái" className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Mọi trạng thái</option>
            {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>

        {list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isLoading || !rows ? (
          <div className="space-y-3 p-4" aria-busy>
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'Không có banner nào khớp bộ lọc' : 'Chưa có banner nào'}
            description={filtered ? 'Thử đổi bộ lọc.' : 'Thêm banner đầu tiên để hiển thị trên trang chủ.'}
            action={!filtered ? <Can permission={P.BannerManage}><Button onClick={() => setEditing('new')}>Thêm banner</Button></Can> : undefined}
          />
        ) : (
          <SortableList
            items={rows}
            onReorder={onReorder}
            getLabel={(b) => b.title}
            renderItem={(b) => {
              const schedule = bannerSchedule(b)
              return (
                <div className="flex items-center gap-3">
                  <Thumb banner={b} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{b.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <Badge tone={SCHEDULE_TONE[schedule]}>{SCHEDULE_LABEL[schedule]}</Badge>
                      <span>{placementLabel(b.placement)}</span>
                      <span>Thứ tự {b.sortOrder}</span>
                    </div>
                    {(b.startAt || b.endAt) && (
                      <p className="mt-1 text-xs text-muted">{b.startAt ? formatDateTime(b.startAt, labels.timezone) : '...'} → {b.endAt ? formatDateTime(b.endAt, labels.timezone) : 'không giới hạn'}</p>
                    )}
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="sm" aria-label={`Sửa ${b.title}`} onClick={() => setEditing(b)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" aria-label={`Xoá ${b.title}`} onClick={() => remove(b)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                </div>
              )
            }}
          />
        )}
      </Card>
      {editing && <BannerFormModal banner={editing === 'new' ? null : editing} defaultSortOrder={nextSort} onClose={() => setEditing(null)} />}
    </>
  )
}
