import { describe, expect, it } from 'vitest'
import { clearFilters, hasActiveFilters, parseFilters, toApiQuery, toggle, toPageQuery, withFilters } from './filters'

describe('parseFilters', () => {
  it('đọc đủ các tham số và tách danh sách bằng dấu phẩy', () => {
    const f = parseFilters({ category: 'nuoc-hoa-nam', q: '  rose ', brand: 'a, b ,', priceMin: '100000', priceMax: '500000', 'attr.scent': 'go,hoa', flag: 'sale', sort: 'price_asc', page: '3' })
    expect(f).toEqual({ category: 'nuoc-hoa-nam', q: 'rose', brands: ['a', 'b'], priceMin: 100000, priceMax: 500000, attrs: { scent: ['go', 'hoa'] }, flag: 'sale', sort: 'price_asc', page: 3 })
  })

  it('bỏ giá trị không hợp lệ thay vì chuyển tiếp cho API', () => {
    const f = parseFilters({ priceMin: 'abc', priceMax: '-5', flag: 'hack', sort: 'cost', page: '-2' })
    expect(f.priceMin).toBeUndefined()
    expect(f.priceMax).toBeUndefined()
    expect(f.flag).toBeUndefined()
    expect(f.sort).toBeUndefined()
    expect(f.page).toBe(1)
  })

  it('giá 0 là hợp lệ, chuỗi rỗng thì không', () => {
    expect(parseFilters({ priceMin: '0' }).priceMin).toBe(0)
    expect(parseFilters({ priceMin: '' }).priceMin).toBeUndefined()
    expect(parseFilters({ priceMin: '-1' }).priceMin).toBeUndefined()
  })

  it('giới hạn số giá trị mỗi danh sách và độ dài từ khoá', () => {
    const many = Array.from({ length: 50 }, (_, i) => 'b' + i).join(',')
    expect(parseFilters({ brand: many }).brands).toHaveLength(20)
    expect(parseFilters({ q: 'x'.repeat(500) }).q).toHaveLength(100)
  })

  it('lấy phần tử đầu khi tham số lặp lại', () => {
    expect(parseFilters({ category: ['a', 'b'], page: ['2', '9'] })).toMatchObject({ category: 'a', page: 2 })
  })
})

describe('toApiQuery / toPageQuery', () => {
  const base = parseFilters({ category: 'c', brand: 'x,y', 'attr.color': 'red', priceMin: '10', page: '2' })

  it('dựng query cho API, có thể kèm tham số phân trang', () => {
    const q = new URLSearchParams(toApiQuery(base, { page: 2, pageSize: 24 }))
    expect(q.get('category')).toBe('c')
    expect(q.get('brand')).toBe('x,y')
    expect(q.get('attr.color')).toBe('red')
    expect(q.get('priceMin')).toBe('10')
    expect(q.get('pageSize')).toBe('24')
  })

  it('URL trang chỉ có page khi > 1 và vòng đi vòng lại không đổi', () => {
    expect(new URLSearchParams(toPageQuery(base)).get('page')).toBe('2')
    expect(new URLSearchParams(toPageQuery({ ...base, page: 1 })).has('page')).toBe(false)
    const again = parseFilters(Object.fromEntries(new URLSearchParams(toPageQuery(base))))
    expect(again).toEqual(base)
  })

  it('không đưa mã người dùng vào query một cách nguyên văn (được mã hoá)', () => {
    const f = parseFilters({ q: 'a&b=c#d' })
    expect(toApiQuery(f)).toBe('q=a%26b%3Dc%23d')
  })

  it('withFilters trả về đường dẫn gốc khi không có bộ lọc', () => {
    expect(withFilters('/products', parseFilters({}))).toBe('/products')
    expect(withFilters('/products', parseFilters({ category: 'x' }))).toBe('/products?category=x')
  })
})

describe('toggle / clear', () => {
  it('bật rồi tắt một giá trị mà không đổi mảng gốc', () => {
    const a = ['x']
    expect(toggle(a, 'y')).toEqual(['x', 'y'])
    expect(toggle(a, 'x')).toEqual([])
    expect(a).toEqual(['x'])
  })

  it('xoá bộ lọc giữ danh mục, từ khoá, sắp xếp và đưa về trang 1', () => {
    const f = parseFilters({ category: 'c', q: 'k', sort: 'name', brand: 'b', priceMax: '9', 'attr.a': 'v', flag: 'new', page: '4' })
    expect(hasActiveFilters(f)).toBe(true)
    const cleared = clearFilters(f)
    expect(hasActiveFilters(cleared)).toBe(false)
    expect(cleared).toMatchObject({ category: 'c', q: 'k', sort: 'name', page: 1 })
  })
})
