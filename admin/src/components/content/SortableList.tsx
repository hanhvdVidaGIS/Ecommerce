import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { moveItem } from './reorder'

const VI_ANNOUNCE = {
  screenReaderInstructions: {
    draggable: 'Nhấn phím cách để nhấc mục, dùng phím mũi tên để di chuyển, nhấn phím cách lần nữa để thả, Esc để huỷ.',
  },
}

function Row({ id, disabled, label, index, count, onMove, children }: {
  id: string; disabled?: boolean; label: string; index: number; count: number; onMove: (dir: -1 | 1) => void; children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-2 border-b border-border bg-surface px-2 py-2 last:border-0 sm:px-3', isDragging && 'relative z-10 shadow-lg')}
    >
      {!disabled && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Kéo để sắp xếp: ${label}`}
          className="shrink-0 cursor-grab touch-none rounded p-1 text-muted hover:bg-surface-2 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {!disabled && (
        <div className="flex shrink-0 flex-col sm:flex-row">
          <Button variant="ghost" size="sm" className="h-7 px-1.5" aria-label={`Chuyển lên: ${label}`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="h-7 px-1.5" aria-label={`Chuyển xuống: ${label}`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
        </div>
      )}
    </li>
  )
}

/**
 * Danh sách sắp xếp được: kéo-thả (chuột/cảm ứng), bàn phím trên tay nắm, và nút lên/xuống để dùng khi không kéo được.
 * Thành phần chỉ báo thứ tự mới qua `onReorder`; việc lưu do nơi dùng quyết định.
 */
export function SortableList<T extends { id: string }>({ items, onReorder, renderItem, getLabel, disabled }: {
  items: T[]
  onReorder: (next: T[]) => void
  renderItem: (item: T) => ReactNode
  getLabel: (item: T) => string
  disabled?: boolean
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((i) => i.id === e.active.id)
    const to = items.findIndex((i) => i.id === e.over!.id)
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={VI_ANNOUNCE}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul>
          {items.map((item, index) => (
            <Row key={item.id} id={item.id} disabled={disabled} label={getLabel(item)} index={index} count={items.length} onMove={(dir) => onReorder(moveItem(items, index, index + dir))}>
              {renderItem(item)}
            </Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
