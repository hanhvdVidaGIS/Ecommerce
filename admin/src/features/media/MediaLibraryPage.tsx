import { Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Can } from '@/auth/guards'
import { P } from '@/api/catalog.generated'
import { PageHeader } from '@/components/ui/data'
import { Modal, useConfirm } from '@/components/ui/overlays'
import { Button, Card, FormField, Input } from '@/components/ui/primitives'
import { useLabels } from '@/api/hooks'
import { formatBytes, formatDateTime } from '@/lib/format'
import { toastError } from '@/lib/forms'
import { MediaBrowser } from './MediaBrowser'
import { useDeleteMedia, useUpdateMedia, type MediaItem } from './api'

export default function MediaLibraryPage() {
  const [current, setCurrent] = useState<MediaItem | null>(null)
  return (
    <>
      <PageHeader title="Thư viện ảnh" description="Tải lên, tìm kiếm và quản lý ảnh, video dùng trên website." />
      <Card className="p-4">
        <MediaBrowser onOpen={setCurrent} />
      </Card>
      {current && <MediaDetailModal key={current.id} item={current} onClose={() => setCurrent(null)} />}
    </>
  )
}

function MediaDetailModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [altText, setAltText] = useState(item.altText ?? '')
  const [folder, setFolder] = useState(item.folder ?? '')
  const update = useUpdateMedia()
  const del = useDeleteMedia()
  const confirm = useConfirm()
  const labels = useLabels()

  const save = async () => {
    try {
      await update.mutateAsync({ id: item.id, altText: altText.trim() || null, folder: folder.trim() || null })
      toast.success('Đã lưu')
      onClose()
    } catch (e) {
      toastError(e)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Xoá ảnh?', message: `Ảnh "${item.fileName}" sẽ bị xoá vĩnh viễn khỏi thư viện.`, confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(item.id)
      toast.success('Đã xoá')
      onClose()
    } catch (e) {
      toastError(e, 'Không xoá được ảnh.') // ảnh đang được dùng sẽ báo rõ nơi dùng
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item.fileName}
      size="lg"
      footer={
        <>
          <Can permission={P.MediaDelete}>
            <Button variant="danger" className="mr-auto" onClick={remove} loading={del.isPending}><Trash2 className="h-4 w-4" aria-hidden /> Xoá</Button>
          </Can>
          <Button variant="secondary" onClick={onClose}>Đóng</Button>
          <Can permission={P.MediaUpload}><Button onClick={save} loading={update.isPending}>Lưu</Button></Can>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-center rounded-lg bg-surface-2 p-2">
          {item.kind === 'video' ? <video src={item.url} controls className="max-h-72 w-full" /> : <img src={item.url} alt={item.altText ?? ''} className="max-h-72 object-contain" />}
        </div>
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">Kích thước</dt><dd>{formatBytes(item.sizeBytes)}{item.width ? ` · ${item.width}×${item.height}` : ''}</dd>
            <dt className="text-muted">Định dạng</dt><dd>{item.mimeType}</dd>
            <dt className="text-muted">Tải lên</dt><dd>{formatDateTime(item.createdAt, labels.timezone)}</dd>
          </dl>
          <FormField label="Mô tả ảnh (alt)" htmlFor="alt" hint="Dùng cho SEO và trình đọc màn hình."><Input id="alt" value={altText} maxLength={300} onChange={(e) => setAltText(e.target.value)} /></FormField>
          <FormField label="Thư mục" htmlFor="folder"><Input id="folder" value={folder} maxLength={100} onChange={(e) => setFolder(e.target.value)} /></FormField>
          <Button variant="secondary" size="sm" onClick={async () => { await navigator.clipboard.writeText(new URL(item.url, window.location.origin).toString()); toast.success('Đã sao chép liên kết') }}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Sao chép liên kết
          </Button>
        </div>
      </div>
    </Modal>
  )
}
