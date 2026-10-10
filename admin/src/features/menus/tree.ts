import type { Dto } from '@/api/types'

/** Giới hạn của backend (MenuService.MaxDepth/MaxItems); giao diện chặn trước, backend vẫn kiểm tra lại. */
export const MAX_DEPTH = 3
export const MAX_ITEMS = 100

export const TARGET_CATEGORY = 'Category'
export const TARGET_PAGE = 'Page'
export const TARGET_URL = 'Url'

/** OpenAPI sinh `children: unknown[]` cho DTO đệ quy nên khai báo lại kiểu cây ở đây, vẫn dựa trên DTO gốc. */
export type MenuItemEdit = Omit<Dto<'MenuItemEditDto'>, 'children'> & { children: MenuItemEdit[] | null }

/** Nút trên cây ở phía giao diện. `key` ổn định trong phiên soạn (mục mới chưa có id). */
export interface MenuNode {
  key: string
  id: string | null
  title: string
  targetType: string
  targetId: string | null
  url: string
  isActive: boolean
  children: MenuNode[]
}

let seq = 0
export function newKey(): string {
  seq += 1
  return `n${seq}`
}

export function createNode(partial: Partial<MenuNode> = {}): MenuNode {
  return { key: newKey(), id: null, title: '', targetType: TARGET_URL, targetId: null, url: '', isActive: true, children: [], ...partial }
}

export function fromDto(items: readonly MenuItemEdit[]): MenuNode[] {
  return items.map((i) => ({
    key: newKey(),
    id: i.id,
    title: i.title,
    targetType: i.targetType,
    targetId: i.targetId,
    url: i.url ?? '',
    isActive: i.isActive,
    children: fromDto(i.children ?? []),
  }))
}

/** Dựng phần thân gửi PUT. Mục có id được gửi kèm để backend giữ nguyên; trường không dùng theo loại được đặt null. */
export function toRequestItems(nodes: readonly MenuNode[]): MenuItemEdit[] {
  return nodes.map((n) => {
    const isUrl = n.targetType === TARGET_URL
    return {
      id: n.id,
      title: n.title.trim(),
      targetType: n.targetType,
      targetId: isUrl ? null : n.targetId,
      url: isUrl ? n.url.trim() : null,
      isActive: n.isActive,
      children: toRequestItems(n.children),
    }
  })
}

export interface FlatNode {
  node: MenuNode
  /** Cấp 1..MAX_DEPTH. */
  depth: number
  parentKey: string | null
  /** Vị trí trong danh sách anh em. */
  index: number
  siblings: number
}

/** Duyệt trước-sau (cha trước, rồi từng con) — cùng thứ tự backend đánh chỉ số `items[n]`. */
export function flatten(nodes: readonly MenuNode[], depth = 1, parentKey: string | null = null): FlatNode[] {
  return nodes.flatMap((node, index) => [{ node, depth, parentKey, index, siblings: nodes.length }, ...flatten(node.children, depth + 1, node.key)])
}

export function countNodes(nodes: readonly MenuNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)
}

/** Số cấp của cây con có gốc là `node` (một nút đơn = 1). */
export function subtreeHeight(node: MenuNode): number {
  return 1 + node.children.reduce((max, c) => Math.max(max, subtreeHeight(c)), 0)
}

function find(nodes: readonly MenuNode[], key: string): FlatNode | undefined {
  return flatten(nodes).find((f) => f.node.key === key)
}

/** Áp `fn` lên danh sách anh em chứa `parentKey` (null = gốc) và trả cây mới. */
function mapSiblings(nodes: MenuNode[], parentKey: string | null, fn: (siblings: MenuNode[]) => MenuNode[]): MenuNode[] {
  if (parentKey === null) return fn(nodes)
  return nodes.map((n) => (n.key === parentKey ? { ...n, children: fn(n.children) } : { ...n, children: mapSiblings(n.children, parentKey, fn) }))
}

export function canAddChild(nodes: readonly MenuNode[], parentKey: string | null): boolean {
  if (countNodes(nodes) >= MAX_ITEMS) return false
  if (parentKey === null) return true
  const parent = find(nodes, parentKey)
  return !!parent && parent.depth < MAX_DEPTH
}

/** Thêm `node` vào cuối danh sách con của `parentKey` (null = gốc). Không đổi gì nếu vượt giới hạn. */
export function addNode(nodes: MenuNode[], parentKey: string | null, node: MenuNode): MenuNode[] {
  if (!canAddChild(nodes, parentKey)) return nodes
  return mapSiblings(nodes, parentKey, (s) => [...s, node])
}

export function removeNode(nodes: MenuNode[], key: string): MenuNode[] {
  return nodes.filter((n) => n.key !== key).map((n) => ({ ...n, children: removeNode(n.children, key) }))
}

export function updateNode(nodes: MenuNode[], key: string, patch: Partial<Omit<MenuNode, 'key' | 'children'>>): MenuNode[] {
  return nodes.map((n) => (n.key === key ? { ...n, ...patch } : { ...n, children: updateNode(n.children, key, patch) }))
}

export function canMove(nodes: readonly MenuNode[], key: string, dir: -1 | 1): boolean {
  const f = find(nodes, key)
  return !!f && f.index + dir >= 0 && f.index + dir < f.siblings
}

/** Đổi chỗ với anh em liền kề (cả cây con đi theo). */
export function moveNode(nodes: MenuNode[], key: string, dir: -1 | 1): MenuNode[] {
  const f = find(nodes, key)
  if (!f || !canMove(nodes, key, dir)) return nodes
  return mapSiblings(nodes, f.parentKey, (s) => {
    const next = [...s]
    ;[next[f.index], next[f.index + dir]] = [next[f.index + dir], next[f.index]]
    return next
  })
}

/** Thụt vào: trở thành con cuối của anh em liền trước; chỉ khi cây con vẫn nằm trong MAX_DEPTH. */
export function canIndent(nodes: readonly MenuNode[], key: string): boolean {
  const f = find(nodes, key)
  return !!f && f.index > 0 && f.depth + subtreeHeight(f.node) <= MAX_DEPTH
}

export function indentNode(nodes: MenuNode[], key: string): MenuNode[] {
  const f = find(nodes, key)
  if (!f || !canIndent(nodes, key)) return nodes
  return mapSiblings(nodes, f.parentKey, (s) => {
    const prev = s[f.index - 1]
    const without = s.filter((n) => n.key !== key)
    return without.map((n) => (n.key === prev.key ? { ...n, children: [...n.children, f.node] } : n))
  })
}

/** Đưa ra: trở thành anh em ngay sau cha. */
export function canOutdent(nodes: readonly MenuNode[], key: string): boolean {
  const f = find(nodes, key)
  return !!f && f.parentKey !== null
}

export function outdentNode(nodes: MenuNode[], key: string): MenuNode[] {
  const f = find(nodes, key)
  if (!f || f.parentKey === null) return nodes
  const parent = find(nodes, f.parentKey)!
  const detached = removeNode(nodes, key)
  return mapSiblings(detached, parent.parentKey, (s) => {
    const at = s.findIndex((n) => n.key === parent.node.key)
    return [...s.slice(0, at + 1), f.node, ...s.slice(at + 1)]
  })
}

export interface MenuErrors {
  /** Lỗi theo `key` của nút. */
  byKey: Record<string, string>
  /** Lỗi không gắn được vào một mục cụ thể (quá sâu, quá nhiều mục, ...). */
  general: string[]
}

/**
 * Ánh xạ lỗi 400 của backend (`items[n]`, n theo thứ tự duyệt phẳng trước-sau) về từng nút.
 * Cây phải là đúng cây đã gửi; `items` không chỉ số hoặc chỉ số ngoài phạm vi vào `general`.
 */
export function mapItemErrors(nodes: readonly MenuNode[], details: readonly { field: string; message: string }[]): MenuErrors {
  const flat = flatten(nodes)
  const out: MenuErrors = { byKey: {}, general: [] }
  for (const d of details) {
    const m = /^items\[(\d+)\]$/.exec(d.field)
    const target = m ? flat[Number(m[1])] : undefined
    if (target) out.byKey[target.node.key] = out.byKey[target.node.key] ? `${out.byKey[target.node.key]} ${d.message}` : d.message
    else out.general.push(d.message)
  }
  return out
}

/** Lỗi kiểm tra ở giao diện trước khi gửi (cùng quy tắc backend); khoá theo `key` của nút. */
export function validateTree(nodes: readonly MenuNode[], isSafe: (url: string) => boolean): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const { node } of flatten(nodes)) {
    if (!node.title.trim()) errors[node.key] = 'Nhập tiêu đề.'
    else if (node.title.trim().length > 200) errors[node.key] = 'Tiêu đề tối đa 200 ký tự.'
    else if (node.targetType === TARGET_URL) {
      if (!node.url.trim() || !isSafe(node.url)) errors[node.key] = 'Liên kết phải bắt đầu bằng / hoặc http(s)://.'
    } else if (!node.targetId) errors[node.key] = 'Chọn đối tượng liên kết.'
  }
  return errors
}
