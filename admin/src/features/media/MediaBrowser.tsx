import { Check, Film, Search, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/lib/useDebounce'
import { toastError } from '@/lib/forms'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/data'
import { Button, Input, Select, Skeleton } from '@/components/ui/primitives'
import { ACCEPTED_UPLOAD, useMediaFolders, useMediaList, useUploadMedia, type MediaItem } from './api'

/**
 * Lưới thư viện ảnh dùng chung cho trang Thư viện ảnh và hộp chọn ảnh (MediaPicker).
 * `selectable` bật chế độ chọn; `selected` là tập mã đang chọn.
 */
export function MediaBrowser({ selectable, selected, onToggle, onOpen, imagesOnly, pageSize = 24 }: {
  selectable?: boolean
  selected?: ReadonlySet<string>
  onToggle?: (item: MediaItem) => void
  onOpen?: (item: MediaItem) => void
  imagesOnly?: boolean
  pageSize?: number
}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('')
  const [kind, setKind] = useState(imagesOnly ? 'image' : '')
  const q = useDebounce(search, 300)
  const list = useMediaList({ page, pageSize, q: q || undefined, folder: folder || undefined, kind: kind || undefined })
  const folders = useMediaFolders()
  const upload = useUploadMedia()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const doUpload = async (files: File[]) => {
    if (files.length === 0) return
    try {
      const result = await upload.mutateAsync({ files, folder: folder || undefined })
      if (result.items.length > 0) toast.success(`Đã tải lên ${result.items.length} tệp`)
      for (const err of result.errors) toast.error(`${err.fileName}: ${err.message}`)
      setPage(1)
    } catch (e) {
      toastError(e, 'Không tải lên được.')
    }
  }

  const items = list.data?.data ?? []
  const meta = list.data?.meta

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void doUpload(Array.from(e.dataTransfer.files)) }}
      className={cn('rounded-lg', dragging && 'outline-dashed outline-2 outline-accent')}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
          <Input aria-label="Tìm ảnh" placeholder="Tìm theo tên hoặc mô tả ảnh..." className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select aria-label="Thư mục" className="w-40" value={folder} onChange={(e) => { setFolder(e.target.value); setPage(1) }}>
          <option value="">Mọi thư mục</option>
          {folders.data?.map((f) => <option key={f} value={f}>{f}</option>)}
        </Select>
        {!imagesOnly && (
          <Select aria-label="Loại tệp" className="w-32" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1) }}>
            <option value="">Mọi loại</option>
            <option value="image">Ảnh</option>
            <option value="video">Video</option>
          </Select>
        )}
        <input ref={fileInput} type="file" multiple accept={ACCEPTED_UPLOAD} className="sr-only" aria-label="Chọn tệp tải lên" onChange={(e) => { void doUpload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        <Button onClick={() => fileInput.current?.click()} loading={upload.isPending}><Upload className="h-4 w-4" aria-hidden /> Tải lên</Button>
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-square h-auto" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Chưa có ảnh" description="Kéo thả tệp vào đây hoặc nhấn Tải lên. Hỗ trợ JPG, PNG, WebP, GIF, MP4, WebM." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((m) => {
            const isSelected = selected?.has(m.id)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => (selectable ? onToggle?.(m) : onOpen?.(m))}
                  onDoubleClick={() => onOpen?.(m)}
                  aria-pressed={selectable ? !!isSelected : undefined}
                  aria-label={m.altText || m.fileName}
                  className={cn('group relative block w-full overflow-hidden rounded-lg border bg-surface-2 text-left', isSelected ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-muted')}
                >
                  <div className="aspect-square">
                    {m.kind === 'video' ? (
                      <div className="flex h-full items-center justify-center text-muted"><Film className="h-8 w-8" aria-hidden /></div>
                    ) : (
                      <img src={m.url} alt={m.altText ?? ''} loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </div>
                  {isSelected && <span className="absolute right-1.5 top-1.5 rounded-full bg-accent p-1 text-accent-fg"><Check className="h-3 w-3" aria-hidden /></span>}
                  <div className="truncate px-2 py-1.5 text-xs">{m.fileName}</div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {meta && <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPageChange={setPage} />}
    </div>
  )
}
