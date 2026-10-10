import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronLeft, ChevronRight, GripVertical, ImagePlus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { MediaPickerModal } from '@/components/media/MediaPicker'
import { Badge, Button, Card, CardHeader } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { addImages, moveImage, removeImage, setPrimaryImage, type ImageFormValue, type ProductFormValues } from './model'

function ImageCard({ image, index, total, disabled, onMove, onPrimary, onRemove }: {
  image: ImageFormValue
  index: number
  total: number
  disabled: boolean
  onMove: (to: number) => void
  onPrimary: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: image.mediaId, disabled })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative flex flex-col overflow-hidden rounded-lg border bg-surface', image.isPrimary ? 'border-accent' : 'border-border', isDragging && 'z-10 opacity-70 shadow-lg')}
    >
      <div className="relative aspect-square bg-surface-2">
        <img src={image.url} alt={image.altText ?? `Ảnh ${index + 1}`} className="h-full w-full object-contain" />
        {image.isPrimary && <Badge tone="info" className="absolute left-1.5 top-1.5">Ảnh chính</Badge>}
        {!disabled && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Kéo để sắp xếp ảnh ${index + 1}`}
            className="absolute right-1.5 top-1.5 cursor-grab touch-none rounded bg-surface/90 p-1 text-muted hover:text-text active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {!disabled && (
        <div className="flex items-center justify-between gap-1 p-1.5">
          <div className="flex">
            <Button variant="ghost" size="sm" className="px-1.5" disabled={index === 0} aria-label={`Dời ảnh ${index + 1} lên trước`} onClick={() => onMove(index - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="px-1.5" disabled={index === total - 1} aria-label={`Dời ảnh ${index + 1} ra sau`} onClick={() => onMove(index + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="flex">
            <Button variant="ghost" size="sm" className="px-1.5" disabled={image.isPrimary} aria-label={`Đặt ảnh ${index + 1} làm ảnh chính`} title="Đặt làm ảnh chính" onClick={onPrimary}><Star className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="px-1.5" aria-label={`Gỡ ảnh ${index + 1}`} onClick={onRemove}><Trash2 className="h-4 w-4 text-danger" /></Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Thư viện ảnh của sản phẩm: chọn nhiều ảnh từ Thư viện, kéo thả (hoặc nút mũi tên) để sắp xếp, đúng một ảnh chính. */
export function ImagesTab({ form, canEdit }: { form: UseFormReturn<ProductFormValues>; canEdit: boolean }) {
  const [picking, setPicking] = useState(false)
  const images = form.watch('images')
  const rootError = form.formState.errors.images?.root?.message
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const update = (next: ImageFormValue[]) => form.setValue('images', next, { shouldDirty: true })
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = images.findIndex((i) => i.mediaId === e.active.id)
    const to = images.findIndex((i) => i.mediaId === e.over!.id)
    if (from >= 0 && to >= 0) update(arrayMove(images, from, to))
  }

  return (
    <Card>
      <CardHeader
        title="Hình ảnh"
        description="Ảnh đầu tiên (hoặc ảnh được đặt làm chính) là ảnh đại diện. Kéo thả để đổi thứ tự."
        actions={canEdit && <Button variant="secondary" size="sm" onClick={() => setPicking(true)}><ImagePlus className="h-4 w-4" aria-hidden /> Thêm ảnh</Button>}
      />
      <div className="p-4">
        {images.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <ImagePlus className="h-8 w-8 text-muted" aria-hidden />
            <p className="text-sm font-medium">Chưa có ảnh nào</p>
            {canEdit && <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>Chọn ảnh từ thư viện</Button>}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={images.map((i) => i.mediaId)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {images.map((image, index) => (
                  <ImageCard
                    key={image.mediaId}
                    image={image}
                    index={index}
                    total={images.length}
                    disabled={!canEdit}
                    onMove={(to) => update(moveImage(images, index, to))}
                    onPrimary={() => update(setPrimaryImage(images, image.mediaId))}
                    onRemove={() => update(removeImage(images, image.mediaId))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        {rootError && <p role="alert" className="mt-2 text-xs text-danger">{rootError}</p>}
      </div>
      {picking && (
        <MediaPickerModal
          open
          multiple
          title="Chọn ảnh sản phẩm"
          onClose={() => setPicking(false)}
          onPick={(items) => update(addImages(images, items.map((m) => ({ mediaId: m.id, url: m.url, altText: m.altText ?? null }))))}
        />
      )}
    </Card>
  )
}
