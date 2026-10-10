import { describe, expect, it } from 'vitest'
import { isSafeLink } from '@/components/content/links'
import {
  addNode, canAddChild, canIndent, canMove, canOutdent, countNodes, createNode, flatten, fromDto, indentNode, mapItemErrors, MAX_DEPTH, MAX_ITEMS,
  moveNode, outdentNode, removeNode, subtreeHeight, toRequestItems, updateNode, validateTree, type MenuItemEdit, type MenuNode,
} from './tree'

/** Dựng cây ngắn gọn: t('A', [t('A1')]) với khoá = tiêu đề để dễ đọc. */
function t(title: string, children: MenuNode[] = []): MenuNode {
  return createNode({ key: title, title, url: '/' + title, children })
}
const titles = (nodes: MenuNode[]): string[] => flatten(nodes).map((f) => `${'-'.repeat(f.depth - 1)}${f.node.title}`)

describe('thêm / xoá / sửa', () => {
  it('thêm vào gốc và vào cha, mục mới nằm cuối', () => {
    let tree = [t('A'), t('B')]
    tree = addNode(tree, null, t('C'))
    tree = addNode(tree, 'A', t('A1'))
    tree = addNode(tree, 'A', t('A2'))
    expect(titles(tree)).toEqual(['A', '-A1', '-A2', 'B', 'C'])
  })

  it('xoá mục kéo theo cả cây con', () => {
    const tree = [t('A', [t('A1', [t('A1a')])]), t('B')]
    expect(titles(removeNode(tree, 'A1'))).toEqual(['A', 'B'])
    expect(titles(removeNode(tree, 'A'))).toEqual(['B'])
  })

  it('sửa một trường không làm đổi cấu trúc và không đổi cây gốc', () => {
    const tree = [t('A', [t('A1')])]
    const next = updateNode(tree, 'A1', { title: 'Mới', isActive: false })
    expect(flatten(next).map((f) => f.node.title)).toEqual(['A', 'Mới'])
    expect(flatten(next)[1].node.isActive).toBe(false)
    expect(tree[0].children[0].title).toBe('A1')
  })
})

describe('giới hạn độ sâu và số mục', () => {
  it('không thêm con vào mục ở cấp tối đa', () => {
    const tree = [t('A', [t('A1', [t('A1a')])])]
    expect(MAX_DEPTH).toBe(3)
    expect(canAddChild(tree, 'A1')).toBe(true)
    expect(canAddChild(tree, 'A1a')).toBe(false)
    expect(addNode(tree, 'A1a', t('X'))).toBe(tree)
  })

  it('không thêm khi đã đủ MAX_ITEMS mục', () => {
    const tree = Array.from({ length: MAX_ITEMS }, (_, i) => t(`m${i}`))
    expect(countNodes(tree)).toBe(MAX_ITEMS)
    expect(canAddChild(tree, null)).toBe(false)
    expect(canAddChild(tree, 'm0')).toBe(false)
    expect(addNode(tree, null, t('thừa'))).toBe(tree)
    expect(canAddChild(tree.slice(1), null)).toBe(true)
  })

  it('đếm cả mục con', () => {
    expect(countNodes([t('A', [t('A1'), t('A2', [t('A2a')])]), t('B')])).toBe(5)
    expect(subtreeHeight(t('A', [t('A1', [t('A1a')])]))).toBe(3)
  })
})

describe('lên / xuống', () => {
  it('đổi chỗ với anh em cùng cấp, con đi theo cha', () => {
    const tree = [t('A', [t('A1')]), t('B'), t('C')]
    expect(titles(moveNode(tree, 'B', -1))).toEqual(['B', 'A', '-A1', 'C'])
    expect(titles(moveNode(tree, 'A', 1))).toEqual(['B', 'A', '-A1', 'C'])
  })

  it('không vượt quá đầu/cuối danh sách anh em', () => {
    const tree = [t('A'), t('B', [t('B1'), t('B2')])]
    expect(canMove(tree, 'A', -1)).toBe(false)
    expect(canMove(tree, 'B', 1)).toBe(false)
    expect(moveNode(tree, 'A', -1)).toBe(tree)
    expect(canMove(tree, 'B2', 1)).toBe(false)
    expect(titles(moveNode(tree, 'B2', -1))).toEqual(['A', 'B', '-B2', '-B1'])
  })
})

describe('thụt vào / đưa ra', () => {
  it('thụt vào thành con cuối của anh em liền trước, mang theo cây con', () => {
    const tree = [t('A', [t('A1')]), t('B', [t('B1')]), t('C')]
    expect(titles(indentNode(tree, 'B'))).toEqual(['A', '-A1', '-B', '--B1', 'C'])
  })

  it('mục đầu tiên không thụt vào được', () => {
    const tree = [t('A'), t('B')]
    expect(canIndent(tree, 'A')).toBe(false)
    expect(indentNode(tree, 'A')).toBe(tree)
  })

  it('không thụt vào nếu cây con sẽ vượt MAX_DEPTH', () => {
    // B có 1 con: thụt B vào A => B cấp 2, B1 cấp 3 (còn được). Thêm cháu thì B1a cấp 4 (không được).
    const ok = [t('A'), t('B', [t('B1')])]
    expect(canIndent(ok, 'B')).toBe(true)
    const tooDeep = [t('A'), t('B', [t('B1', [t('B1a')])])]
    expect(canIndent(tooDeep, 'B')).toBe(false)
    expect(indentNode(tooDeep, 'B')).toBe(tooDeep)
    // Mục lá ở cấp 3 không thụt vào được dù có anh em trước.
    const leaf = [t('A', [t('A1', [t('x'), t('y')])])]
    expect(canIndent(leaf, 'y')).toBe(false)
  })

  it('đưa ra thành anh em ngay sau cha, đúng vị trí', () => {
    const tree = [t('A', [t('A1'), t('A2'), t('A3')]), t('B')]
    expect(titles(outdentNode(tree, 'A2'))).toEqual(['A', '-A1', '-A3', 'A2', 'B'])
  })

  it('đưa ra từ cấp 3 về cấp 2; mục gốc không đưa ra được', () => {
    const tree = [t('A', [t('A1', [t('A1a')])])]
    expect(titles(outdentNode(tree, 'A1a'))).toEqual(['A', '-A1', '-A1a'])
    expect(canOutdent(tree, 'A')).toBe(false)
    expect(outdentNode(tree, 'A')).toBe(tree)
  })

  it('thụt vào rồi đưa ra trả lại cây ban đầu', () => {
    const tree = [t('A'), t('B'), t('C')]
    expect(titles(outdentNode(indentNode(tree, 'B'), 'B'))).toEqual(titles(tree))
  })
})

describe('ánh xạ lỗi items[n]', () => {
  const tree = [t('A', [t('A1'), t('A2', [t('A2a')])]), t('B')]

  it('chỉ số theo thứ tự duyệt phẳng trước-sau: A=0, A1=1, A2=2, A2a=3, B=4', () => {
    const r = mapItemErrors(tree, [
      { field: 'items[3]', message: 'Lỗi cháu' },
      { field: 'items[4]', message: 'Lỗi B' },
      { field: 'items[0]', message: 'Lỗi A' },
    ])
    expect(r.byKey).toEqual({ A2a: 'Lỗi cháu', B: 'Lỗi B', A: 'Lỗi A' })
    expect(r.general).toEqual([])
  })

  it('nhiều lỗi cùng một mục được nối lại', () => {
    const r = mapItemErrors(tree, [{ field: 'items[1]', message: 'Một.' }, { field: 'items[1]', message: 'Hai.' }])
    expect(r.byKey).toEqual({ A1: 'Một. Hai.' })
  })

  it('lỗi không có chỉ số hoặc chỉ số ngoài phạm vi vào nhóm chung', () => {
    const r = mapItemErrors(tree, [
      { field: 'items', message: 'Quá sâu.' },
      { field: 'items[99]', message: 'Xa quá.' },
      { field: 'name', message: 'Tên sai.' },
    ])
    expect(r.byKey).toEqual({})
    expect(r.general).toEqual(['Quá sâu.', 'Xa quá.', 'Tên sai.'])
  })
})

describe('chuyển đổi DTO <-> nút', () => {
  const dto: MenuItemEdit[] = [
    { id: 'i1', title: 'Trang chủ', targetType: 'Url', targetId: null, url: '/', isActive: true, children: [] },
    {
      id: 'i2', title: 'Danh mục', targetType: 'Category', targetId: 'c1', url: null, isActive: false,
      children: [{ id: 'i3', title: 'Con', targetType: 'Page', targetId: 'p1', url: null, isActive: true, children: null }],
    },
  ]

  it('giữ id của mục sẵn có và cấu trúc khi gửi lại', () => {
    const req = toRequestItems(fromDto(dto))
    expect(req[0].id).toBe('i1')
    expect(req[1].id).toBe('i2')
    expect(req[1].children?.[0].id).toBe('i3')
    expect(req[1].isActive).toBe(false)
  })

  it('mục mới có id null; trường không dùng theo loại được đặt null', () => {
    const fresh = createNode({ title: '  Mới  ', targetType: 'Category', targetId: 'c9', url: 'bỏ qua' })
    const urlNode = createNode({ title: 'U', targetType: 'Url', targetId: 'bỏ qua', url: ' /x ' })
    const [a, b] = toRequestItems([fresh, urlNode])
    expect(a).toMatchObject({ id: null, title: 'Mới', targetId: 'c9', url: null })
    expect(b).toMatchObject({ targetId: null, url: '/x' })
  })
})

describe('kiểm tra cây ở giao diện', () => {
  it('báo lỗi đúng mục: thiếu tiêu đề, liên kết nguy hiểm, thiếu đối tượng', () => {
    const tree = [
      createNode({ key: 'a', title: '', url: '/ok' }),
      createNode({ key: 'b', title: 'B', url: 'javascript:alert(1)' }),
      createNode({ key: 'c', title: 'C', targetType: 'Category', targetId: null }),
      createNode({ key: 'd', title: 'D', targetType: 'Page', targetId: 'p1' }),
      createNode({ key: 'e', title: 'E', url: 'https://example.com/x' }),
    ]
    const errors = validateTree(tree, isSafeLink)
    expect(Object.keys(errors).sort()).toEqual(['a', 'b', 'c'])
  })
})
