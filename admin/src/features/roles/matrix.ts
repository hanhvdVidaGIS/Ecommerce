import type { Dto } from '@/api/types'

export type PermissionItem = Dto<'PermissionDto'>

export interface PermissionGroup {
  group: string
  items: PermissionItem[]
}

export type GroupState = 'none' | 'some' | 'all'

/** Nhóm quyền theo `group`, giữ thứ tự xuất hiện đầu tiên do backend trả về. */
export function groupPermissions(perms: readonly PermissionItem[]): PermissionGroup[] {
  const map = new Map<string, PermissionItem[]>()
  for (const p of perms) {
    const list = map.get(p.group)
    if (list) list.push(p)
    else map.set(p.group, [p])
  }
  return [...map].map(([group, items]) => ({ group, items }))
}

/** Quyền `superAdminOnly` không bao giờ gán được cho vai trò khác Super Admin, nên mọi thao tác chọn đều bỏ qua chúng. */
export function isAssignable(p: PermissionItem): boolean {
  return !p.superAdminOnly
}

export function toggleCode(selected: ReadonlySet<string>, perm: PermissionItem, checked: boolean): Set<string> {
  const next = new Set(selected)
  if (!isAssignable(perm)) return next
  if (checked) next.add(perm.code)
  else next.delete(perm.code)
  return next
}

/** Chọn / bỏ cả nhóm, chỉ tác động lên các quyền gán được. */
export function setGroup(selected: ReadonlySet<string>, items: readonly PermissionItem[], checked: boolean): Set<string> {
  const next = new Set(selected)
  for (const p of items) {
    if (!isAssignable(p)) continue
    if (checked) next.add(p.code)
    else next.delete(p.code)
  }
  return next
}

/** Số quyền gán được đã chọn trong nhóm và trạng thái hộp chọn nhóm. Nhóm không có quyền gán được → 'none'. */
export function groupState(selected: ReadonlySet<string>, items: readonly PermissionItem[]): { selected: number; total: number; state: GroupState } {
  const assignable = items.filter(isAssignable)
  const count = assignable.filter((p) => selected.has(p.code)).length
  const state: GroupState = count === 0 ? 'none' : count === assignable.length ? 'all' : 'some'
  return { selected: count, total: assignable.length, state }
}

export function diffCodes(original: Iterable<string>, current: Iterable<string>): { added: string[]; removed: string[] } {
  const a = new Set(original)
  const b = new Set(current)
  return {
    added: [...b].filter((c) => !a.has(c)).sort(),
    removed: [...a].filter((c) => !b.has(c)).sort(),
  }
}

export interface RoleDraft {
  originalName: string
  originalCodes: Iterable<string>
  name: string
  codes: Iterable<string>
}

export const ROLE_NAME_MAX = 100

export function isDirty(d: RoleDraft): boolean {
  if (d.name.trim() !== d.originalName.trim()) return true
  const { added, removed } = diffCodes(d.originalCodes, d.codes)
  return added.length > 0 || removed.length > 0
}

/** Nút Lưu chỉ bật khi có thay đổi, tên hợp lệ, không ở chế độ chỉ đọc và không đang lưu. */
export function canSave(d: RoleDraft, opts: { readOnly: boolean; saving: boolean }): boolean {
  const name = d.name.trim()
  if (opts.readOnly || opts.saving) return false
  if (name.length === 0 || name.length > ROLE_NAME_MAX) return false
  return isDirty(d)
}

/** Danh sách mã gửi lên API: loại quyền superAdminOnly (phòng khi dữ liệu cũ lẫn vào) và sắp xếp ổn định. */
export function payloadCodes(selected: ReadonlySet<string>, perms: readonly PermissionItem[]): string[] {
  const restricted = new Set(perms.filter((p) => p.superAdminOnly).map((p) => p.code))
  return [...selected].filter((c) => !restricted.has(c)).sort()
}
