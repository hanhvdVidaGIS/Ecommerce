import type { Dto } from '@/api/types'

export type SortItem = Dto<'SortItem'>

/** Di chuyển phần tử từ vị trí `from` đến `to`; trả mảng mới (không đổi mảng gốc). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items]
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Tính payload cho `POST .../reorder`. Danh sách đang hiển thị có thể chỉ là một phần của dữ liệu (đã lọc),
 * nên ta TRÁO các giá trị sortOrder sẵn có giữa các mục thay vì đánh số lại, để không phá vị trí so với mục đang bị ẩn.
 * Khi các giá trị trùng nhau (không đủ làm "ô cắm") thì đánh số lại từ giá trị nhỏ nhất, bước 10.
 * Chỉ trả các mục có sortOrder thay đổi; mảng rỗng nghĩa là không cần gọi API.
 */
export function buildReorderPayload(before: readonly { id: string; sortOrder: number }[], afterIds: readonly string[]): SortItem[] {
  const slots = before.map((b) => b.sortOrder).sort((a, b) => a - b)
  const strictlyIncreasing = slots.every((v, i) => i === 0 || v > slots[i - 1])
  const base = slots.length > 0 ? slots[0] : 0
  const current = new Map(before.map((b) => [b.id, b.sortOrder]))
  const payload: SortItem[] = []
  afterIds.forEach((id, i) => {
    const sortOrder = strictlyIncreasing ? slots[i] : base + i * 10
    if (current.get(id) !== sortOrder) payload.push({ id, sortOrder })
  })
  return payload
}
