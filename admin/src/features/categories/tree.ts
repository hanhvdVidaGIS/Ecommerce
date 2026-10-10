import type { Dto } from '@/api/types'

/**
 * Logic thuần cho cây danh mục (không phụ thuộc React) để kiểm thử được.
 * Backend trả danh sách phẳng đã sắp theo cây; ở đây dựng lại cây, tính hậu duệ và tính payload `reorder`.
 * Backend vẫn là nơi quyết định cuối cùng (vòng lặp, độ sâu); các kiểm tra ở đây chỉ để phản hồi ngay và tránh gọi thừa.
 */
export type CategoryItem = Dto<'CategoryListItemDto'>
export type ReorderItem = Dto<'ReorderItem'>

/** Cây tối đa 5 cấp (cấp gốc là 0, cấp sâu nhất là 4) – khớp CategoryService.MaxDepth ở backend. */
export const MAX_DEPTH = 5
/** Khoảng cách giữa các thứ tự khi đánh số lại, chừa chỗ để chèn tay sau này. */
const SORT_STEP = 10

export interface CategoryNode {
  item: CategoryItem
  children: CategoryNode[]
}

/** Bỏ dấu + chữ thường để lọc tên không phân biệt dấu. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim()
}

/** Gom con theo cha, mỗi nhóm sắp theo (thứ tự, vị trí trong danh sách gốc) để ổn định khi trùng thứ tự. */
function groupByParent(flat: readonly CategoryItem[]): Map<string | null, CategoryItem[]> {
  const ids = new Set(flat.map((c) => c.id))
  const index = new Map(flat.map((c, i) => [c.id, i]))
  const groups = new Map<string | null, CategoryItem[]>()
  for (const c of flat) {
    // Mục mồ côi (cha không còn trong danh sách) coi như gốc để không biến mất khỏi giao diện.
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : null
    const list = groups.get(key)
    if (list) list.push(c)
    else groups.set(key, [c])
  }
  for (const list of groups.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || index.get(a.id)! - index.get(b.id)!)
  return groups
}

export function buildTree(flat: readonly CategoryItem[]): CategoryNode[] {
  const groups = groupByParent(flat)
  const build = (parentId: string | null): CategoryNode[] => (groups.get(parentId) ?? []).map((item) => ({ item, children: build(item.id) }))
  return build(null)
}

/** Duyệt tiền thứ tự và tính lại depth/path/childCount từ cấu trúc cha-con (dùng sau khi di chuyển cục bộ). */
export function flattenTree(nodes: readonly CategoryNode[]): CategoryItem[] {
  const out: CategoryItem[] = []
  const walk = (list: readonly CategoryNode[], depth: number, path: string, parentId: string | null) => {
    for (const n of list) {
      const p = path ? `${path} / ${n.item.name}` : n.item.name
      out.push({ ...n.item, parentId, depth, path: p, childCount: n.children.length })
      walk(n.children, depth + 1, p, n.item.id)
    }
  }
  walk(nodes, 0, '', null)
  return out
}

export function normalizeFlat(flat: readonly CategoryItem[]): CategoryItem[] {
  return flattenTree(buildTree(flat))
}

function childrenMap(flat: readonly CategoryItem[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const [parent, list] of groupByParent(flat)) if (parent) map.set(parent, list.map((c) => c.id))
  return map
}

/** Mọi hậu duệ (con, cháu...) của một mục, không gồm chính nó. */
export function getDescendantIds(flat: readonly CategoryItem[], id: string): Set<string> {
  const kids = childrenMap(flat)
  const out = new Set<string>()
  const stack = [...(kids.get(id) ?? [])]
  while (stack.length) {
    const cur = stack.pop()!
    if (out.has(cur)) continue // chống vòng lặp nếu dữ liệu hỏng
    out.add(cur)
    stack.push(...(kids.get(cur) ?? []))
  }
  return out
}

/** Các mục được thừa hưởng thuộc tính từ mục đã chọn (hậu duệ của mục chọn, không gồm mục chọn). */
export function inheritedIds(flat: readonly CategoryItem[], checked: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  for (const id of checked) for (const d of getDescendantIds(flat, id)) if (!checked.has(d)) out.add(d)
  return out
}

/** Chuỗi tổ tiên (cha → gốc) của một mục. */
export function getAncestorIds(flat: readonly CategoryItem[], id: string): string[] {
  const byId = new Map(flat.map((c) => [c.id, c]))
  const out: string[] = []
  let cur = byId.get(id)?.parentId ?? null
  while (cur && !out.includes(cur)) {
    out.push(cur)
    cur = byId.get(cur)?.parentId ?? null
  }
  return out
}

/** Số cấp nằm dưới mục (0 nếu là lá, 1 nếu chỉ có con...). */
export function subtreeHeight(flat: readonly CategoryItem[], id: string): number {
  const kids = childrenMap(flat)
  const height = (cur: string, guard: number): number => {
    if (guard > 50) return 0
    const list = kids.get(cur) ?? []
    return list.length ? 1 + Math.max(...list.map((k) => height(k, guard + 1))) : 0
  }
  return height(id, 0)
}

function depthOf(flat: readonly CategoryItem[], id: string): number {
  return getAncestorIds(flat, id).length
}

export type MoveBlock = 'cycle' | 'too_deep'

/** Có thể đặt `id` dưới `parentId` (null = gốc) không? Chặn vòng lặp và vượt 5 cấp (tính cả cây con đi kèm). */
export function checkMoveUnder(flat: readonly CategoryItem[], id: string, parentId: string | null): MoveBlock | null {
  if (parentId === null) return null
  if (parentId === id || getDescendantIds(flat, id).has(parentId)) return 'cycle'
  if (depthOf(flat, parentId) + 1 + subtreeHeight(flat, id) > MAX_DEPTH - 1) return 'too_deep'
  return null
}

export const blockMessage: Record<MoveBlock, string> = {
  cycle: 'Không thể chuyển vào chính nó hoặc vào mục con của nó.',
  too_deep: `Cây tối đa ${MAX_DEPTH} cấp, không thể chuyển vào đây.`,
}

export interface ParentOption { id: string; label: string; disabled: boolean }

/** Tuỳ chọn cho ô "cha": loại chính nó và hậu duệ; vô hiệu mục khiến cây vượt 5 cấp. `editingId` null = đang tạo mới. */
export function parentOptions(flat: readonly CategoryItem[], editingId: string | null): ParentOption[] {
  const banned = editingId ? getDescendantIds(flat, editingId) : new Set<string>()
  const height = editingId ? subtreeHeight(flat, editingId) : 0
  return normalizeFlat(flat)
    .filter((c) => c.id !== editingId && !banned.has(c.id))
    .map((c) => ({ id: c.id, label: `${'— '.repeat(c.depth)}${c.name}`, disabled: c.depth + 1 + height > MAX_DEPTH - 1 }))
}

/** Thứ tự mặc định cho mục mới: cuối danh sách anh em. */
export function nextSortOrder(flat: readonly CategoryItem[], parentId: string | null): number {
  const siblings = flat.filter((c) => (c.parentId ?? null) === parentId)
  return siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + SORT_STEP : SORT_STEP
}

/* ---------- Lọc & thu gọn ---------- */

/**
 * Các hàng cần hiển thị. Không lọc: ẩn hậu duệ của nhánh đang thu gọn.
 * Có lọc: giữ mục khớp tên và tổ tiên của chúng, bỏ qua thu gọn để thấy kết quả.
 */
export function visibleRows(flat: readonly CategoryItem[], collapsed: ReadonlySet<string>, query: string): CategoryItem[] {
  const rows = normalizeFlat(flat)
  const q = foldText(query)
  if (q) {
    const keep = new Set<string>()
    for (const c of rows) {
      if (foldText(c.name).includes(q)) {
        keep.add(c.id)
        for (const a of getAncestorIds(rows, c.id)) keep.add(a)
      }
    }
    return rows.filter((c) => keep.has(c.id))
  }
  const visible = new Set<string>()
  const out: CategoryItem[] = []
  for (const c of rows) {
    if (c.parentId === null || (visible.has(c.parentId) && !collapsed.has(c.parentId))) {
      visible.add(c.id)
      out.push(c)
    }
  }
  return out
}

/* ---------- Di chuyển / sắp xếp ---------- */

export type MoveFailure = 'not_found' | 'noop' | MoveBlock
export type MoveResult = { ok: true; items: ReorderItem[]; next: CategoryItem[] } | { ok: false; reason: MoveFailure }

/** Áp danh sách `reorder` vào danh sách phẳng, trả về danh sách mới đã tính lại cấp/đường dẫn. */
export function applyReorder(flat: readonly CategoryItem[], items: readonly ReorderItem[]): CategoryItem[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  return normalizeFlat(flat.map((c) => {
    const r = byId.get(c.id)
    return r ? { ...c, parentId: r.parentId, sortOrder: r.sortOrder } : c
  }))
}

/**
 * Chuyển `id` vào `parentId` tại vị trí `index` trong danh sách con của cha mới (đã bỏ chính nó ra, chặn về [0, độ dài]).
 * Đánh số lại toàn bộ nhóm anh em đích (10, 20, 30...) và chỉ gửi các mục thật sự thay đổi.
 */
export function planMove(flat: readonly CategoryItem[], move: { id: string; parentId: string | null; index: number }): MoveResult {
  const byId = new Map(flat.map((c) => [c.id, c]))
  const node = byId.get(move.id)
  if (!node || (move.parentId !== null && !byId.has(move.parentId))) return { ok: false, reason: 'not_found' }
  const block = checkMoveUnder(flat, move.id, move.parentId)
  if (block) return { ok: false, reason: block }

  const groups = groupByParent(flat)
  const before = (groups.get(move.parentId) ?? []).map((c) => c.id)
  const siblings = before.filter((id) => id !== move.id)
  const index = Math.max(0, Math.min(move.index, siblings.length))
  siblings.splice(index, 0, move.id)

  const sameParent = (node.parentId ?? null) === move.parentId
  if (sameParent && siblings.length === before.length && siblings.every((id, i) => id === before[i])) return { ok: false, reason: 'noop' }

  const items: ReorderItem[] = []
  siblings.forEach((id, i) => {
    const current = byId.get(id)!
    const sortOrder = (i + 1) * SORT_STEP
    if ((current.parentId ?? null) !== move.parentId || current.sortOrder !== sortOrder) items.push({ id, parentId: move.parentId, sortOrder })
  })
  return { ok: true, items, next: applyReorder(flat, items) }
}

export type KeyboardMove = 'up' | 'down' | 'indent' | 'outdent'

/** Di chuyển bằng nút (thay cho kéo-thả): lên/xuống trong cùng cha, vào trong (làm con của anh phía trên), ra ngoài (ngang hàng với cha). */
export function planKeyboardMove(flat: readonly CategoryItem[], id: string, dir: KeyboardMove): MoveResult {
  const byId = new Map(flat.map((c) => [c.id, c]))
  const node = byId.get(id)
  if (!node) return { ok: false, reason: 'not_found' }
  const groups = groupByParent(flat)
  const parentId = node.parentId && byId.has(node.parentId) ? node.parentId : null
  const siblings = groups.get(parentId) ?? []
  const i = siblings.findIndex((c) => c.id === id)

  switch (dir) {
    case 'up':
      return i <= 0 ? { ok: false, reason: 'noop' } : planMove(flat, { id, parentId, index: i - 1 })
    case 'down':
      return i < 0 || i >= siblings.length - 1 ? { ok: false, reason: 'noop' } : planMove(flat, { id, parentId, index: i + 1 })
    case 'indent': {
      const prev = siblings[i - 1]
      if (!prev) return { ok: false, reason: 'noop' }
      return planMove(flat, { id, parentId: prev.id, index: (groups.get(prev.id) ?? []).length })
    }
    case 'outdent': {
      if (parentId === null) return { ok: false, reason: 'noop' }
      const parent = byId.get(parentId)!
      const grandId = parent.parentId && byId.has(parent.parentId) ? parent.parentId : null
      const uncles = groups.get(grandId) ?? []
      return planMove(flat, { id, parentId: grandId, index: uncles.findIndex((c) => c.id === parentId) + 1 })
    }
  }
}

/** Nút di chuyển nào dùng được cho mục này (để vô hiệu nút, tránh bấm vô nghĩa). */
export function availableMoves(flat: readonly CategoryItem[], id: string): Record<KeyboardMove, boolean> {
  const dirs: KeyboardMove[] = ['up', 'down', 'indent', 'outdent']
  return Object.fromEntries(dirs.map((d) => [d, planKeyboardMove(flat, id, d).ok])) as Record<KeyboardMove, boolean>
}

export type DropPosition = 'before' | 'after' | 'inside'

/** Vị trí thả theo toạ độ dọc của con trỏ trong hàng đích: 25% trên = trước, 25% dưới = sau, giữa = làm con. */
export function dropPositionFromRatio(ratio: number): DropPosition {
  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  return 'inside'
}

/** Kết quả của việc thả `activeId` lên `overId` tại vị trí `position`. */
export function planDrop(flat: readonly CategoryItem[], activeId: string, overId: string, position: DropPosition): MoveResult {
  if (activeId === overId) return { ok: false, reason: 'noop' }
  const byId = new Map(flat.map((c) => [c.id, c]))
  const over = byId.get(overId)
  if (!over || !byId.has(activeId)) return { ok: false, reason: 'not_found' }
  if (position === 'inside') return planMove(flat, { id: activeId, parentId: overId, index: Number.MAX_SAFE_INTEGER })

  const parentId = over.parentId && byId.has(over.parentId) ? over.parentId : null
  const siblings = (groupByParent(flat).get(parentId) ?? []).map((c) => c.id).filter((id) => id !== activeId)
  const overIndex = siblings.indexOf(overId)
  // Nếu `over` là hậu duệ của `active` thì cha mới là chính `active` hoặc con của nó; planMove sẽ báo 'cycle'.
  return planMove(flat, { id: activeId, parentId, index: position === 'before' ? overIndex : overIndex + 1 })
}
