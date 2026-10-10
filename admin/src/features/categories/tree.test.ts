import { describe, expect, it } from 'vitest'
import {
  applyReorder, availableMoves, buildTree, checkMoveUnder, dropPositionFromRatio, flattenTree, getDescendantIds, inheritedIds, nextSortOrder,
  normalizeFlat, parentOptions, planDrop, planKeyboardMove, planMove, subtreeHeight, visibleRows, type CategoryItem,
} from './tree'

function item(id: string, parentId: string | null, sortOrder: number, name = id): CategoryItem {
  return { id, parentId, depth: 0, path: name, name, slug: id, sortOrder, isActive: true, childCount: 0, productCount: 0, icon: null }
}

/*
 * A(10)
 *  ├ A1(10)
 *  │  └ A1a(10)
 *  ├ A2(20)
 *  └ A3(30)
 * B(20)
 * C(30)
 */
const sample = (): CategoryItem[] => normalizeFlat([
  item('A', null, 10), item('A1', 'A', 10), item('A1a', 'A1', 10), item('A2', 'A', 20), item('A3', 'A', 30), item('B', null, 20), item('C', null, 30),
])

const ids = (flat: CategoryItem[]) => flat.map((c) => c.id)

describe('dựng cây và hậu duệ', () => {
  it('sắp theo thứ tự, bất kể thứ tự của danh sách đầu vào, và tính depth/path/childCount', () => {
    const shuffled = [item('B', null, 20), item('A2', 'A', 20), item('A', null, 10), item('A1', 'A', 10)]
    const flat = normalizeFlat(shuffled)
    expect(ids(flat)).toEqual(['A', 'A1', 'A2', 'B'])
    expect(flat.map((c) => c.depth)).toEqual([0, 1, 1, 0])
    expect(flat[1].path).toBe('A / A1')
    expect(flat[0].childCount).toBe(2)
  })

  it('trùng thứ tự thì giữ vị trí của danh sách gốc (đúng như backend đã sắp)', () => {
    const flat = normalizeFlat([item('x', null, 0), item('y', null, 0), item('z', null, 0)])
    expect(ids(flat)).toEqual(['x', 'y', 'z'])
  })

  it('mục mồ côi được coi như gốc, không biến mất', () => {
    expect(ids(normalizeFlat([item('A', null, 10), item('orphan', 'missing', 20)]))).toEqual(['A', 'orphan'])
  })

  it('buildTree/flattenTree khép kín', () => {
    const flat = sample()
    expect(ids(flattenTree(buildTree(flat)))).toEqual(ids(flat))
    expect(buildTree(flat)).toHaveLength(3)
    expect(buildTree(flat)[0].children).toHaveLength(3)
  })

  it('getDescendantIds lấy mọi cấp, không gồm chính nó', () => {
    const flat = sample()
    expect([...getDescendantIds(flat, 'A')].sort()).toEqual(['A1', 'A1a', 'A2', 'A3'])
    expect([...getDescendantIds(flat, 'A1')]).toEqual(['A1a'])
    expect(getDescendantIds(flat, 'C').size).toBe(0)
  })

  it('getDescendantIds không lặp vô hạn khi dữ liệu có vòng', () => {
    const cyc = [item('p', 'q', 1), item('q', 'p', 1)]
    expect(getDescendantIds(cyc, 'p').size).toBeLessThanOrEqual(2)
  })

  it('subtreeHeight và inheritedIds', () => {
    const flat = sample()
    expect(subtreeHeight(flat, 'A')).toBe(2)
    expect(subtreeHeight(flat, 'A2')).toBe(0)
    expect([...inheritedIds(flat, new Set(['A1']))]).toEqual(['A1a'])
    // mục đã được chọn tường minh thì không tính là "kế thừa"
    expect([...inheritedIds(flat, new Set(['A', 'A1']))].sort()).toEqual(['A1a', 'A2', 'A3'])
  })
})

describe('ô chọn cha và thứ tự mặc định', () => {
  it('loại chính nó và hậu duệ khỏi danh sách cha', () => {
    const labels = parentOptions(sample(), 'A1').map((o) => o.id)
    expect(labels).not.toContain('A1')
    expect(labels).not.toContain('A1a')
    expect(labels).toContain('A')
  })

  it('vô hiệu mục khiến cây vượt 5 cấp', () => {
    // chuỗi 5 cấp: d0 > d1 > d2 > d3 > d4
    const chain = normalizeFlat([item('d0', null, 1), item('d1', 'd0', 1), item('d2', 'd1', 1), item('d3', 'd2', 1), item('d4', 'd3', 1)])
    const options = parentOptions(chain, null)
    expect(options.find((o) => o.id === 'd3')!.disabled).toBe(false)
    expect(options.find((o) => o.id === 'd4')!.disabled).toBe(true)
  })

  it('nextSortOrder đặt cuối nhóm anh em', () => {
    const flat = sample()
    expect(nextSortOrder(flat, null)).toBe(40)
    expect(nextSortOrder(flat, 'A')).toBe(40)
    expect(nextSortOrder(flat, 'B')).toBe(10)
  })
})

describe('lọc và thu gọn', () => {
  it('thu gọn ẩn hậu duệ ở mọi cấp', () => {
    expect(ids(visibleRows(sample(), new Set(['A']), ''))).toEqual(['A', 'B', 'C'])
    expect(ids(visibleRows(sample(), new Set(['A1']), ''))).toEqual(['A', 'A1', 'A2', 'A3', 'B', 'C'])
  })

  it('lọc theo tên không phân biệt dấu, giữ tổ tiên và bỏ qua thu gọn', () => {
    const flat = normalizeFlat([item('a', null, 1, 'Nước hoa'), item('b', 'a', 1, 'Nước hoa nam'), item('c', null, 2, 'Phụ kiện')])
    expect(ids(visibleRows(flat, new Set(['a']), 'NUOC HOA NAM'))).toEqual(['a', 'b'])
    expect(ids(visibleRows(flat, new Set(), 'phu'))).toEqual(['c'])
    expect(visibleRows(flat, new Set(), 'zzz')).toEqual([])
  })
})

describe('planMove: đổi thứ tự và đổi cha', () => {
  it('đổi thứ tự trong cùng cha chỉ gửi các mục thay đổi, đánh số lại 10/20/30', () => {
    const r = planMove(sample(), { id: 'C', parentId: null, index: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // C lên đầu: C=10, A=20, B=30 (cả ba đều đổi)
    expect(r.items).toEqual([
      { id: 'C', parentId: null, sortOrder: 10 },
      { id: 'A', parentId: null, sortOrder: 20 },
      { id: 'B', parentId: null, sortOrder: 30 },
    ])
    expect(ids(r.next).filter((i) => ['A', 'B', 'C'].includes(i))).toEqual(['C', 'A', 'B'])
  })

  it('không gửi mục không đổi', () => {
    // đưa A3 về vị trí đầu của A: A3=10, A1=20, A2=30; mục khác (A1a, B, C) không có trong payload
    const r = planMove(sample(), { id: 'A3', parentId: 'A', index: 0 })
    expect(r.ok && r.items.map((i) => i.id)).toEqual(['A3', 'A1', 'A2'])
  })

  it('đổi cha: mục vào nhóm mới ở đúng vị trí, nhóm cũ giữ nguyên', () => {
    const r = planMove(sample(), { id: 'B', parentId: 'A', index: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.items).toEqual([
      { id: 'B', parentId: 'A', sortOrder: 20 },
      { id: 'A2', parentId: 'A', sortOrder: 30 },
      { id: 'A3', parentId: 'A', sortOrder: 40 },
    ])
    const next = r.next
    expect(next.find((c) => c.id === 'B')!.depth).toBe(1)
    expect(next.find((c) => c.id === 'B')!.path).toBe('A / B')
    expect(next.find((c) => c.id === 'A')!.childCount).toBe(4)
    expect(ids(next)).toEqual(['A', 'A1', 'A1a', 'B', 'A2', 'A3', 'C'])
  })

  it('đưa cả nhánh đi thì con cháu đi theo và độ sâu được tính lại', () => {
    const r = planMove(sample(), { id: 'A1', parentId: 'B', index: 0 })
    expect(r.ok && r.next.find((c) => c.id === 'A1a')!.depth).toBe(2)
    expect(r.ok && r.next.find((c) => c.id === 'A1a')!.path).toBe('B / A1 / A1a')
  })

  it('chuyển ra gốc', () => {
    const r = planMove(sample(), { id: 'A2', parentId: null, index: 99 })
    expect(r.ok && r.items.find((i) => i.id === 'A2')).toEqual({ id: 'A2', parentId: null, sortOrder: 40 })
  })

  it('không thay đổi gì thì báo noop', () => {
    const flat = sample()
    expect(planMove(flat, { id: 'B', parentId: null, index: 1 })).toEqual({ ok: false, reason: 'noop' })
    expect(planMove(flat, { id: 'B', parentId: null, index: 99 }).ok).toBe(true) // B xuống cuối: đổi chỗ với C
  })

  it('chặn đưa vào chính nó hoặc hậu duệ của nó', () => {
    const flat = sample()
    expect(planMove(flat, { id: 'A', parentId: 'A', index: 0 })).toEqual({ ok: false, reason: 'cycle' })
    expect(planMove(flat, { id: 'A', parentId: 'A1a', index: 0 })).toEqual({ ok: false, reason: 'cycle' })
    expect(checkMoveUnder(flat, 'A1', 'A1a')).toBe('cycle')
    expect(checkMoveUnder(flat, 'A1a', 'A')).toBeNull()
  })

  it('chặn vượt 5 cấp, tính cả cây con đi kèm', () => {
    const chain = normalizeFlat([item('d0', null, 1), item('d1', 'd0', 1), item('d2', 'd1', 1), item('d3', 'd2', 1), item('d4', 'd3', 1), item('x', null, 2), item('x1', 'x', 1)])
    expect(planMove(chain, { id: 'x', parentId: 'd4', index: 0 })).toEqual({ ok: false, reason: 'too_deep' })
    expect(planMove(chain, { id: 'x1', parentId: 'd4', index: 0 })).toEqual({ ok: false, reason: 'too_deep' })
    expect(planMove(chain, { id: 'x1', parentId: 'd3', index: 0 }).ok).toBe(true)
    // x có con (cao 1) nên chỉ vào được cha ở cấp ≤ 2
    expect(planMove(chain, { id: 'x', parentId: 'd3', index: 0 })).toEqual({ ok: false, reason: 'too_deep' })
    expect(planMove(chain, { id: 'x', parentId: 'd2', index: 0 }).ok).toBe(true)
  })

  it('mã không tồn tại', () => {
    expect(planMove(sample(), { id: 'nope', parentId: null, index: 0 })).toEqual({ ok: false, reason: 'not_found' })
    expect(planMove(sample(), { id: 'A', parentId: 'nope', index: 0 })).toEqual({ ok: false, reason: 'not_found' })
  })

  it('applyReorder áp payload và tính lại cây', () => {
    const next = applyReorder(sample(), [{ id: 'C', parentId: 'B', sortOrder: 10 }])
    expect(next.find((c) => c.id === 'C')).toMatchObject({ parentId: 'B', depth: 1, path: 'B / C' })
  })
})

describe('planKeyboardMove: nút lên/xuống/vào trong/ra ngoài', () => {
  it('lên và xuống đổi chỗ với anh em kề bên', () => {
    const down = planKeyboardMove(sample(), 'A1', 'down')
    expect(down.ok && ids(down.next)).toEqual(['A', 'A2', 'A1', 'A1a', 'A3', 'B', 'C'])
    const up = planKeyboardMove(sample(), 'A3', 'up')
    expect(up.ok && ids(up.next)).toEqual(['A', 'A1', 'A1a', 'A3', 'A2', 'B', 'C'])
  })

  it('đầu/cuối danh sách thì không lên/xuống được', () => {
    expect(planKeyboardMove(sample(), 'A', 'up')).toEqual({ ok: false, reason: 'noop' })
    expect(planKeyboardMove(sample(), 'C', 'down')).toEqual({ ok: false, reason: 'noop' })
  })

  it('vào trong: thành con cuối của anh em phía trên', () => {
    const r = planKeyboardMove(sample(), 'B', 'indent')
    expect(r.ok && r.next.find((c) => c.id === 'B')).toMatchObject({ parentId: 'A', depth: 1 })
    expect(r.ok && r.items).toEqual([{ id: 'B', parentId: 'A', sortOrder: 40 }])
    expect(planKeyboardMove(sample(), 'A', 'indent')).toEqual({ ok: false, reason: 'noop' })
  })

  it('ra ngoài: ngang hàng ngay sau cha cũ', () => {
    const r = planKeyboardMove(sample(), 'A2', 'outdent')
    expect(r.ok && ids(r.next)).toEqual(['A', 'A1', 'A1a', 'A3', 'A2', 'B', 'C'])
    expect(r.ok && r.next.find((c) => c.id === 'A2')).toMatchObject({ parentId: null, depth: 0 })
    expect(planKeyboardMove(sample(), 'A', 'outdent')).toEqual({ ok: false, reason: 'noop' })
  })

  it('vào trong bị chặn khi quá sâu; availableMoves phản ánh đúng', () => {
    const chain = normalizeFlat([item('d0', null, 1), item('d1', 'd0', 1), item('d2', 'd1', 1), item('d3', 'd2', 1), item('d4', 'd3', 1), item('e', 'd3', 2)])
    // e vào trong d4 → cấp 5 (chỉ số 5) → vượt
    expect(planKeyboardMove(chain, 'e', 'indent')).toEqual({ ok: false, reason: 'too_deep' })
    expect(availableMoves(chain, 'e')).toEqual({ up: true, down: false, indent: false, outdent: true })
    expect(availableMoves(sample(), 'B')).toEqual({ up: true, down: true, indent: true, outdent: false })
  })
})

describe('planDrop: kéo-thả', () => {
  it('đổi cha khi thả vào giữa hàng đích', () => {
    const r = planDrop(sample(), 'C', 'A2', 'inside')
    expect(r.ok && r.next.find((c) => c.id === 'C')).toMatchObject({ parentId: 'A2', depth: 2 })
  })

  it('thả phía trên / dưới hàng đích thì làm anh em của hàng đó', () => {
    const before = planDrop(sample(), 'C', 'A2', 'before')
    expect(before.ok && ids(before.next)).toEqual(['A', 'A1', 'A1a', 'C', 'A2', 'A3', 'B'])
    const after = planDrop(sample(), 'C', 'A2', 'after')
    expect(after.ok && ids(after.next)).toEqual(['A', 'A1', 'A1a', 'A2', 'C', 'A3', 'B'])
  })

  it('chặn thả cha lên con cháu của nó (mọi vị trí)', () => {
    for (const pos of ['before', 'after', 'inside'] as const) {
      expect(planDrop(sample(), 'A', 'A1a', pos)).toEqual({ ok: false, reason: 'cycle' })
      expect(planDrop(sample(), 'A', 'A2', pos)).toEqual({ ok: false, reason: 'cycle' })
    }
  })

  it('thả lên chính nó là noop', () => {
    expect(planDrop(sample(), 'B', 'B', 'inside')).toEqual({ ok: false, reason: 'noop' })
  })

  it('thả ngay vị trí cũ là noop', () => {
    expect(planDrop(sample(), 'B', 'A', 'after')).toEqual({ ok: false, reason: 'noop' })
  })

  it('ngưỡng vị trí theo tỉ lệ chiều cao hàng', () => {
    expect(dropPositionFromRatio(0.1)).toBe('before')
    expect(dropPositionFromRatio(0.5)).toBe('inside')
    expect(dropPositionFromRatio(0.9)).toBe('after')
  })
})
