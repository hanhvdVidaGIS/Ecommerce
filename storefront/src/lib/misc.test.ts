import { describe, expect, it } from 'vitest'
import { discountPercent, formatMoney } from './format'
import { isExternal, menuHref } from './menu'
import { pageWindow } from '@/components/product/Pagination'
import { googleFontUrl, readableOn, safeColor, safeFontName } from './theme'

describe('menuHref', () => {
  it('ánh xạ theo loại đích', () => {
    expect(menuHref({ targetType: 'Category', slug: 'nuoc-hoa', url: null })).toBe('/products?category=nuoc-hoa')
    expect(menuHref({ targetType: 'Page', slug: 'faq', url: null })).toBe('/pages/faq')
    expect(menuHref({ targetType: 'Url', slug: null, url: '/gioi-thieu' })).toBe('/gioi-thieu')
  })
  it('thiếu dữ liệu đích thì trả về # thay vì URL hỏng; slug được mã hoá', () => {
    expect(menuHref({ targetType: 'Category', slug: null, url: null })).toBe('#')
    expect(menuHref({ targetType: 'Url', slug: null, url: null })).toBe('#')
    expect(menuHref({ targetType: 'Page', slug: 'a b/c', url: null })).toBe('/pages/a%20b%2Fc')
  })
  it('nhận biết liên kết ngoài', () => {
    expect(isExternal('https://x.com')).toBe(true)
    expect(isExternal('/products')).toBe(false)
  })
})

describe('theme', () => {
  it('chọn chữ trắng trên nền tối, chữ đen trên nền sáng', () => {
    expect(readableOn('#000000')).toBe('#ffffff')
    expect(readableOn('#ffffff')).toBe('#111111')
    expect(readableOn('#b8860b')).toBe('#111111') // vàng đồng: chữ đen đạt tương phản cao hơn
    expect(readableOn('abc')).toBe('#111111') // "abc" là mã hex 3 ký tự hợp lệ (xám nhạt)
    expect(readableOn('không phải màu')).toBe('#ffffff')
  })
  it('màu và font không hợp lệ rơi về mặc định (không chèn chuỗi tuỳ ý vào CSS)', () => {
    expect(safeColor('#123456')).toBe('#123456')
    expect(safeColor('123456')).toBe('#123456')
    expect(safeColor('red; background:url(x)')).toBeUndefined()
    expect(safeColor(undefined)).toBeUndefined()
    expect(safeFontName('Playfair Display')).toBe('Playfair Display')
    expect(safeFontName("x'; } body { display:none")).toBe('Be Vietnam Pro')
    expect(googleFontUrl('Playfair Display')).toContain('family=Playfair+Display:')
  })
})

describe('format', () => {
  it('định dạng VND không phần lẻ và rỗng khi không có giá trị', () => {
    expect(formatMoney(1250000)).toMatch(/1\.250\.000/)
    expect(formatMoney(null)).toBe('')
  })
  it('phần trăm giảm chỉ khi giá gốc cao hơn', () => {
    expect(discountPercent(800, 1000)).toBe(20)
    expect(discountPercent(1000, 1000)).toBeNull()
    expect(discountPercent(1000, null)).toBeNull()
    expect(discountPercent(1200, 1000)).toBeNull()
  })
})

describe('pageWindow', () => {
  it('ít trang thì liệt kê hết', () => expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]))
  it('nhiều trang thì rút gọn bằng …', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, '…', 19, 20])
    expect(pageWindow(10, 20)).toEqual([1, 2, '…', 9, 10, 11, '…', 19, 20])
    expect(pageWindow(20, 20)).toEqual([1, 2, '…', 19, 20])
  })
})
