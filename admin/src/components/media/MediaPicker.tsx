import { ImagePlus, X } from 'lucide-react'
import { useState } from 'react'
import type { MediaRef } from '@/api/types'
import { Modal } from '@/components/ui/overlays'
import { Button } from '@/components/ui/primitives'
import { MediaBrowser } from '@/features/media/MediaBrowser'
import type { MediaItem } from '@/features/media/api'
import { cn } from '@/lib/utils'

/** Hộp chọn ảnh từ Thư viện; trả về danh sách ảnh đã chọn khi bấm "Chọn". */
export function MediaPickerModal({ open, onClose, onPick, multiple, title = 'Chọn ảnh', initial }: {
  open: boolean
  onClose: () => void
  onPick: (items: MediaItem[]) => void
  multiple?: boolean
  title?: string
  initial?: MediaItem[]
}) {
  const [picked, setPicked] = useState<Map<string, MediaItem>>(new Map((initial ?? []).map((m) => [m.id, m])))

  const toggle = (m: MediaItem) =>
    setPicked((prev) => {
      const next = new Map(multiple ? prev : [])
      if (prev.has(m.id)) next.delete(m.id)
      else next.set(m.id, m)
      return next
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={multiple ? 'Chọn một hoặc nhiều ảnh.' : 'Chọn một ảnh, hoặc tải ảnh mới lên.'}
      size="xl"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-muted">{picked.size > 0 ? `Đã chọn ${picked.size}` : 'Chưa chọn ảnh nào'}</span>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button disabled={picked.size === 0} onClick={() => { onPick([...picked.values()]); onClose() }}>Chọn</Button>
        </>
      }
    >
      <MediaBrowser selectable imagesOnly selected={new Set(picked.keys())} onToggle={toggle} pageSize={18} />
    </Modal>
  )
}

/**
 * Trường chọn một ảnh (logo, banner, icon danh mục...). `value` là mã ảnh; `preview` là thông tin ảnh để hiển thị
 * (lấy từ DTO của backend). `onChange` nhận mã ảnh mới và thông tin xem trước.
 */
export function ImageField({ label, value, preview, onChange, className, aspect = 'square' }: {
  label?: string
  value: string | null | undefined
  preview?: Pick<MediaRef, 'url' | 'altText'> | null
  onChange: (id: string | null, preview: Pick<MediaRef, 'url' | 'altText'> | null) => void
  className?: string
  aspect?: 'square' | 'wide'
}) {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<Pick<MediaRef, 'url' | 'altText'> | null>(null)
  const shown = local ?? preview ?? null

  return (
    <div className={cn('space-y-1', className)}>
      {label && <p className="text-xs font-medium">{label}</p>}
      <div className="flex items-center gap-3">
        <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-surface-2', aspect === 'wide' ? 'h-20 w-36' : 'h-20 w-20')}>
          {value && shown ? <img src={shown.url} alt={shown.altText ?? ''} className="h-full w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-muted" aria-hidden />}
        </div>
        <div className="flex flex-col gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>{value ? 'Đổi ảnh' : 'Chọn ảnh'}</Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => { setLocal(null); onChange(null, null) }}><X className="h-3.5 w-3.5" aria-hidden /> Gỡ ảnh</Button>
          )}
        </div>
      </div>
      {open && (
        <MediaPickerModal
          open
          onClose={() => setOpen(false)}
          title={label ? `Chọn ảnh: ${label}` : 'Chọn ảnh'}
          onPick={([m]) => {
            const p = { url: m.url, altText: m.altText ?? null }
            setLocal(p)
            onChange(m.id, p)
          }}
        />
      )}
    </div>
  )
}
