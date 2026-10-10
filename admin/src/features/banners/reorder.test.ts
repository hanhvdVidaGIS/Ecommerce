import { describe, expect, it } from 'vitest'
import { isSafeLink } from '@/components/content/links'
import { buildReorderPayload, moveItem } from '@/components/content/reorder'

const item = (id: string, sortOrder: number) => ({ id, sortOrder })

describe('moveItem', () => {
  it('di chuyển và không đổi mảng gốc', () => {
    const src = ['a', 'b', 'c', 'd']
    expect(moveItem(src, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(src, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(src).toEqual(['a', 'b', 'c', 'd'])
  })

  it('chỉ số ngoài phạm vi hoặc không đổi thì trả bản sao nguyên vẹn', () => {
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})

describe('buildReorderPayload', () => {
  it('tráo các giá trị sortOrder sẵn có theo thứ tự mới, chỉ gửi mục thay đổi', () => {
    const before = [item('a', 10), item('b', 20), item('c', 30)]
    expect(buildReorderPayload(before, ['a', 'c', 'b'])).toEqual([{ id: 'c', sortOrder: 20 }, { id: 'b', sortOrder: 30 }])
  })

  it('giữ nguyên vị trí so với mục bị ẩn khi lọc: dùng lại đúng các ô 10 và 50', () => {
    // Danh sách đã lọc chỉ gồm a(10) và e(50); mục ẩn b,c,d nằm ở giữa không bị đụng.
    const before = [item('a', 10), item('e', 50)]
    expect(buildReorderPayload(before, ['e', 'a'])).toEqual([{ id: 'e', sortOrder: 10 }, { id: 'a', sortOrder: 50 }])
  })

  it('không gửi gì khi thứ tự không đổi', () => {
    const before = [item('a', 10), item('b', 20)]
    expect(buildReorderPayload(before, ['a', 'b'])).toEqual([])
  })

  it('giá trị trùng nhau thì đánh số lại từ giá trị nhỏ nhất, bước 10', () => {
    const before = [item('a', 0), item('b', 0), item('c', 0)]
    expect(buildReorderPayload(before, ['c', 'a', 'b'])).toEqual([{ id: 'a', sortOrder: 10 }, { id: 'b', sortOrder: 20 }])
    // c đã có 0 nên không cần gửi
  })

  it('xử lý đầu vào có sortOrder không theo thứ tự hiển thị', () => {
    const before = [item('a', 30), item('b', 10), item('c', 20)]
    // Hiển thị a,b,c nhưng ô nhỏ nhất là 10: thứ tự mới [b,c,a] nhận 10,20,30
    expect(buildReorderPayload(before, ['b', 'c', 'a'])).toEqual([])
  })

  it('danh sách rỗng', () => {
    expect(buildReorderPayload([], [])).toEqual([])
  })
})

describe('isSafeLink', () => {
  it('chấp nhận đường dẫn nội bộ và http(s), kể cả để trống', () => {
    for (const ok of ['', '  ', '/', '/products?sort=newest', 'http://a.b', 'https://a.b/c?d=1']) expect(isSafeLink(ok), ok).toBe(true)
  })

  it('từ chối scheme nguy hiểm, //host, dấu \\ và đường dẫn tương đối', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil', 'ftp://x.y', 'products', 'mailto:a@b.c']) {
      expect(isSafeLink(bad), bad).toBe(false)
    }
  })
})
