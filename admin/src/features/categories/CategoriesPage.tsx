import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Folder, GripVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useLabels } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthProvider'
import { Can } from '@/auth/guards'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Input, Skeleton } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { cn } from '@/lib/utils'
import { useCategories, useDeleteCategory, useReorderCategories, type CategoryItem } from './api'
import { CategoryFormModal } from './CategoryFormModal'
import {
  availableMoves, blockMessage, dropPositionFromRatio, planDrop, planKeyboardMove, visibleRows,
  type DropPosition, type KeyboardMove, type MoveFailure, type MoveResult,
} from './tree'

type Editing = { id: string } | { parentId: string | null } | null
interface DropTarget { overId: string; position: DropPosition; blocked: boolean }

const MOVE_LABELS: Record<KeyboardMove, string> = { up: 'Lên', down: 'Xuống', indent: 'Vào trong', outdent: 'Ra ngoài' }

/** Con trỏ → vị trí thả trong hàng đích (theo toạ độ dọc). Chỉ dùng cho chuột/cảm ứng; bàn phím dùng các nút di chuyển. */
function pointerDrop(e: DragMoveEvent | DragEndEvent): { overId: string; position: DropPosition } | null {
  if (!e.over || !(e.activatorEvent instanceof PointerEvent)) return null
  const rect = e.over.rect
  const y = e.activatorEvent.clientY + e.delta.y
  return { overId: String(e.over.id), position: dropPositionFromRatio((y - rect.top) / Math.max(rect.height, 1)) }
}

function failureText(reason: MoveFailure): string | null {
  return reason === 'cycle' || reason === 'too_deep' ? blockMessage[reason] : null
}

export default function CategoriesPage() {
  const labels = useLabels()
  const { can } = useAuth()
  const confirm = useConfirm()
  const list = useCategories()
  const reorder = useReorderCategories()
  const del = useDeleteCategory()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Editing>(null)
  const [moveRowId, setMoveRowId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [announce, setAnnounce] = useState('')

  const flat = useMemo(() => list.data ?? [], [list.data])
  const rows = useMemo(() => visibleRows(flat, collapsed, search), [flat, collapsed, search])
  const canUpdate = can(P.CategoryUpdate)
  const filtering = search.trim() !== ''
  const noun = labels.category.toLowerCase()
  // Kéo bằng chuột cần khoảng nhích tối thiểu để không nuốt thao tác bấm.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const activeItem = activeId ? flat.find((c) => c.id === activeId) : undefined

  const toggle = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  /** Gửi kết quả di chuyển lên backend; giao diện đã cập nhật lạc quan và tự hoàn nguyên nếu lỗi. */
  const commit = async (plan: Extract<MoveResult, { ok: true }>, message: string) => {
    try {
      await reorder.mutateAsync({ items: plan.items, next: plan.next })
      setAnnounce(message)
      toast.success('Đã cập nhật thứ tự')
    } catch (e) {
      const reason = e instanceof ApiError ? e.message : 'Không lưu được.'
      toast.error(`${reason} Đã hoàn nguyên thay đổi.`)
    }
  }

  const onDragStart = (e: DragStartEvent) => { setActiveId(String(e.active.id)); setMoveRowId(null) }
  const onDragMove = (e: DragMoveEvent) => {
    const d = pointerDrop(e)
    if (!d) return setDropTarget(null)
    const plan = planDrop(flat, String(e.active.id), d.overId, d.position)
    setDropTarget({ ...d, blocked: !plan.ok && (plan.reason === 'cycle' || plan.reason === 'too_deep') })
  }
  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id)
    setActiveId(null)
    setDropTarget(null)
    const d = pointerDrop(e)
    if (!d) return
    const plan = planDrop(flat, id, d.overId, d.position)
    if (!plan.ok) {
      const msg = failureText(plan.reason)
      if (msg) toast.error(msg)
      return
    }
    // Thả vào nhánh đang thu gọn thì mở ra để thấy kết quả.
    if (d.position === 'inside') setCollapsed((prev) => { const n = new Set(prev); n.delete(d.overId); return n })
    const name = flat.find((c) => c.id === id)?.name ?? ''
    await commit(plan, `Đã chuyển ${name}`)
  }

  const moveByButton = async (item: CategoryItem, dir: KeyboardMove) => {
    const plan = planKeyboardMove(flat, item.id, dir)
    if (!plan.ok) {
      const msg = failureText(plan.reason)
      if (msg) toast.error(msg)
      return
    }
    await commit(plan, `Đã chuyển ${item.name}: ${MOVE_LABELS[dir].toLowerCase()}`)
    // Hàng được dựng lại ở vị trí mới nên trả tiêu điểm về nút vừa bấm (hoặc nút bật/tắt nếu nút đó hết dùng được).
    setTimeout(() => {
      const btn = document.getElementById(`mv-${item.id}-${dir}`) as HTMLButtonElement | null
      if (btn && !btn.disabled) btn.focus()
      else document.getElementById(`mv-${item.id}-toggle`)?.focus()
    }, 50)
  }

  const remove = async (c: CategoryItem) => {
    const msg = c.childCount > 0
      ? `Còn ${c.childCount} ${noun} con; cần xoá hoặc chuyển chúng trước.`
      : c.productCount > 0 ? `Đang có ${c.productCount} ${labels.product.toLowerCase()}; cần chuyển sang ${noun} khác trước.` : undefined
    if (!(await confirm({ title: `Xoá ${noun} "${c.name}"?`, message: msg, confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(c.id)
      toast.success('Đã xoá')
    } catch (e) {
      toastError(e, 'Không xoá được.')
    }
  }

  const allBranchIds = flat.filter((c) => c.childCount > 0).map((c) => c.id)

  return (
    <>
      <PageHeader
        title={labels.category}
        description={`Sắp xếp ${noun} thành cây tối đa 5 cấp. Kéo biểu tượng tay nắm để đổi thứ tự hoặc đổi ${noun} cha; hoặc dùng nút “Di chuyển”.`}
        actions={<Can permission={P.CategoryCreate}><Button onClick={() => setEditing({ parentId: null })}><Plus className="h-4 w-4" aria-hidden /> Thêm {noun}</Button></Can>}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-48 max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label={`Lọc ${noun} theo tên`} placeholder={`Lọc ${noun} theo tên...`} className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="secondary" size="sm" disabled={filtering || allBranchIds.length === 0} onClick={() => setCollapsed(new Set())}>Mở rộng tất cả</Button>
          <Button variant="secondary" size="sm" disabled={filtering || allBranchIds.length === 0} onClick={() => setCollapsed(new Set(allBranchIds))}>Thu gọn tất cả</Button>
          {filtering && canUpdate && <span className="text-xs text-muted">Xoá bộ lọc để kéo-thả hoặc di chuyển.</span>}
        </div>

        {list.isLoading ? (
          <div className="space-y-2 p-4" aria-busy>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : flat.length === 0 ? (
          <EmptyState title={`Chưa có ${noun} nào`} action={<Can permission={P.CategoryCreate}><Button onClick={() => setEditing({ parentId: null })}>Thêm {noun}</Button></Can>} />
        ) : rows.length === 0 ? (
          <EmptyState title="Không tìm thấy kết quả" description="Thử từ khoá khác." />
        ) : (
          <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); setDropTarget(null) }}>
            <ul className="[--indent:14px] sm:[--indent:22px]" aria-label={`Cây ${noun}`}>
              {rows.map((c) => (
                <CategoryRow
                  key={c.id}
                  item={c}
                  flat={flat}
                  collapsed={collapsed.has(c.id)}
                  searching={filtering}
                  dragEnabled={canUpdate && !filtering}
                  dragging={activeId === c.id}
                  drop={dropTarget?.overId === c.id ? dropTarget : null}
                  moveOpen={moveRowId === c.id}
                  onToggle={() => toggle(c.id)}
                  onToggleMove={() => setMoveRowId((cur) => (cur === c.id ? null : c.id))}
                  onMove={(dir) => moveByButton(c, dir)}
                  onAddChild={() => setEditing({ parentId: c.id })}
                  onEdit={() => setEditing({ id: c.id })}
                  onDelete={() => remove(c)}
                />
              ))}
            </ul>
            <DragOverlay dropAnimation={null}>
              {activeItem && <div className="flex items-center gap-2 rounded-md border border-accent bg-surface px-3 py-2 text-sm font-medium shadow-lg"><GripVertical className="h-4 w-4 text-muted" aria-hidden />{activeItem.name}</div>}
            </DragOverlay>
          </DndContext>
        )}
      </Card>
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
      {editing && <CategoryFormModal flat={flat} target={editing} readOnly={'id' in editing && !canUpdate} onClose={() => setEditing(null)} />}
    </>
  )
}

function CategoryRow({ item, flat, collapsed, searching, dragEnabled, dragging, drop, moveOpen, onToggle, onToggleMove, onMove, onAddChild, onEdit, onDelete }: {
  item: CategoryItem
  flat: CategoryItem[]
  collapsed: boolean
  searching: boolean
  dragEnabled: boolean
  dragging: boolean
  drop: DropTarget | null
  moveOpen: boolean
  onToggle: () => void
  onToggleMove: () => void
  onMove: (dir: KeyboardMove) => void
  onAddChild: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const labels = useLabels()
  const { can } = useAuth()
  const { setNodeRef: setDragRef, setActivatorNodeRef, attributes, listeners } = useDraggable({ id: item.id, disabled: !dragEnabled })
  const { setNodeRef: setDropRef } = useDroppable({ id: item.id })
  const canUpdate = can(P.CategoryUpdate)
  const noun = labels.category.toLowerCase()
  const moves = useMemo(() => (moveOpen ? availableMoves(flat, item.id) : null), [moveOpen, flat, item.id])

  // Chỉ báo thả: vạch trên/dưới = chèn làm anh em, tô nền = làm con; đỏ nếu bị chặn.
  const dropStyle = !drop ? undefined
    : drop.blocked ? { boxShadow: 'inset 0 0 0 2px var(--danger)' }
    : drop.position === 'before' ? { boxShadow: 'inset 0 3px 0 0 var(--accent)' }
    : drop.position === 'after' ? { boxShadow: 'inset 0 -3px 0 0 var(--accent)' }
    : { boxShadow: 'inset 0 0 0 2px var(--accent)' }

  return (
    <li ref={(n) => { setDragRef(n); setDropRef(n) }} className={cn('border-b border-border last:border-0', dragging && 'opacity-40')}>
      <div className={cn('flex items-center gap-1.5 py-2 pr-2', !item.isActive && 'opacity-70')} style={{ paddingLeft: `calc(0.5rem + ${item.depth} * var(--indent))`, ...dropStyle }}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Kéo ${item.name}`}
          disabled={!dragEnabled}
          className={cn('shrink-0 touch-none rounded p-1 text-muted', dragEnabled ? 'cursor-grab hover:bg-surface-2 active:cursor-grabbing' : 'invisible')}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        {item.childCount > 0 && !searching ? (
          <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Mở rộng' : 'Thu gọn'} ${item.name}`} className="shrink-0 rounded p-1 text-muted hover:bg-surface-2">
            {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          </button>
        ) : <span className="w-6 shrink-0" aria-hidden />}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2">
          {item.icon ? <img src={item.icon.url} alt="" className="h-full w-full object-contain" /> : <Folder className="h-4 w-4 text-muted" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onEdit} className="block max-w-full truncate text-left text-sm font-medium hover:underline">{item.name}</button>
          <p className="truncate text-xs text-muted">
            {item.slug}<span className="sm:hidden"> · {item.productCount} {labels.product.toLowerCase()}</span>
          </p>
        </div>
        {!item.isActive && <Badge>Ẩn</Badge>}
        <span className="hidden w-28 shrink-0 text-right text-xs text-muted sm:inline">{item.productCount} {labels.product.toLowerCase()}</span>
        <div className="flex shrink-0 items-center">
          {canUpdate && !searching && (
            <Button id={`mv-${item.id}-toggle`} variant="ghost" size="sm" aria-label={`Di chuyển ${item.name}`} aria-expanded={moveOpen} onClick={onToggleMove} className="px-2"><ArrowUpDown className="h-4 w-4" aria-hidden /></Button>
          )}
          <Can permission={P.CategoryCreate}>
            {item.depth < 4 && <Button variant="ghost" size="sm" aria-label={`Thêm ${noun} con cho ${item.name}`} onClick={onAddChild} className="px-2"><Plus className="h-4 w-4" aria-hidden /></Button>}
          </Can>
          <Button variant="ghost" size="sm" aria-label={`${canUpdate ? 'Sửa' : 'Xem'} ${item.name}`} onClick={onEdit} className="px-2"><Pencil className="h-4 w-4" aria-hidden /></Button>
          <Can permission={P.CategoryDelete}>
            <Button variant="ghost" size="sm" aria-label={`Xoá ${item.name}`} onClick={onDelete} className="px-2"><Trash2 className="h-4 w-4 text-danger" aria-hidden /></Button>
          </Can>
        </div>
      </div>
      {moves && (
        <div role="group" aria-label={`Di chuyển ${item.name}`} className="flex flex-wrap items-center gap-1.5 bg-surface-2 py-2 pr-3" style={{ paddingLeft: `calc(2.5rem + ${item.depth} * var(--indent))` }}>
          {(['up', 'down', 'indent', 'outdent'] as const).map((dir) => (
            <Button key={dir} id={`mv-${item.id}-${dir}`} variant="secondary" size="sm" disabled={!moves[dir]} onClick={() => onMove(dir)}>
              {dir === 'up' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : dir === 'down' ? <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : dir === 'indent' ? <ArrowRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowLeft className="h-3.5 w-3.5" aria-hidden />}
              {MOVE_LABELS[dir]}
            </Button>
          ))}
          <span className="text-xs text-muted">“Vào trong” đưa vào làm con của mục phía trên; “Ra ngoài” đưa lên ngang hàng với {noun} cha.</span>
        </div>
      )}
    </li>
  )
}
