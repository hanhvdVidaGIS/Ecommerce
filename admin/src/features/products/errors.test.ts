import { describe, expect, it } from 'vitest'
import { collectErrorPaths, mapApiError, type ErrorLike } from './errors'
import { variant } from './fixtures'
import { buildAttributeEntries } from './model'
import { attrDef } from './fixtures'

const err = (details: [string, string][], code = 'validation_failed', message = 'Dữ liệu không hợp lệ.'): ErrorLike => ({
  code, message, details: details.map(([field, message]) => ({ field, message })),
})

describe('mapApiError', () => {
  const attributes = buildAttributeEntries(
    [
      attrDef({ id: 'a1', name: 'Xuất xứ', dataType: 'Text' }),
      attrDef({ id: 'a2', name: 'Nồng độ', dataType: 'Number' }),
      attrDef({ id: 'a3', name: 'Giới tính', dataType: 'Select' }),
    ],
    {},
  ).map((a) => (a.attributeId === 'a1' ? a : a.attributeId === 'a2' ? { ...a, number: '12' } : { ...a, valueIds: ['x'] }))
  // ô a1 để trống nên không được gửi: chỉ số `attributes[0]` của backend là a2, `attributes[1]` là a3
  const snapshot = { attributes, variants: [variant({ sku: 'AA-1' }), variant({ sku: 'AA-2' })] }

  it('đổi dấu ngoặc thành dấu chấm cho trường biến thể', () => {
    const r = mapApiError(err([['variants[1].price', 'Giá không hợp lệ.'], ['variants[0].salePrice', 'Giá khuyến mãi phải nhỏ hơn giá bán.']]), snapshot)
    expect(r.placed).toEqual([
      { path: 'variants.1.price', message: 'Giá không hợp lệ.' },
      { path: 'variants.0.salePrice', message: 'Giá khuyến mãi phải nhỏ hơn giá bán.' },
    ])
    expect(r.unplaced).toEqual([])
  })

  it('attributes[i] là chỉ số trong danh sách thực gửi, đổi về chỉ số ô trên form', () => {
    const r = mapApiError(err([['attributes[1]', 'Giá trị không thuộc thuộc tính "Giới tính".']]), snapshot)
    expect(r.placed).toEqual([{ path: 'attributes.2', message: 'Giá trị không thuộc thuộc tính "Giới tính".' }])
  })

  it('lỗi thiếu thuộc tính bắt buộc gắn theo tên trong ngoặc kép', () => {
    expect(mapApiError(err([['attributes', 'Thiếu thuộc tính bắt buộc "Xuất xứ".']]), snapshot).placed).toEqual([
      { path: 'attributes.0', message: 'Thiếu thuộc tính bắt buộc "Xuất xứ".' },
    ])
    expect(mapApiError(err([['attributes', 'Thiếu thuộc tính bắt buộc "Lạ".']]), snapshot).placed[0].path).toBe('attributes.root')
  })

  it('SKU trùng sản phẩm khác (báo ở trường chung `variants`) gắn vào dòng có SKU đó', () => {
    const r = mapApiError(err([['variants', 'SKU "aa-2" đã được dùng bởi sản phẩm khác.']]), snapshot)
    expect(r.placed).toEqual([{ path: 'variants.1.sku', message: 'SKU "aa-2" đã được dùng bởi sản phẩm khác.' }])
    expect(mapApiError(err([['variants', 'Cần ít nhất một biến thể.']]), snapshot).placed[0].path).toBe('variants.root')
  })

  it('trùng tổ hợp tuỳ chọn gắn vào nhãn dòng', () => {
    expect(mapApiError(err([['variants[1]', 'Trùng tổ hợp tuỳ chọn với biến thể khác.']]), snapshot).placed[0].path).toBe('variants.1.label')
  })

  it('409 slug_taken gắn vào ô slug', () => {
    expect(mapApiError(err([], 'slug_taken', 'Slug đã được dùng bởi sản phẩm khác.'), snapshot).placed).toEqual([{ path: 'slug', message: 'Slug đã được dùng bởi sản phẩm khác.' }])
  })

  it('trường đơn giản, SEO và trường lạ', () => {
    const r = mapApiError(err([['name', 'Tên là bắt buộc'], ['seo.ogImageMediaId', 'Ảnh không tồn tại'], ['status', 'x'], ['images', 'Ảnh bị lặp.'], ['zzz', 'Lạ']]), snapshot)
    expect(r.placed.map((p) => p.path)).toEqual(['name', 'seo.ogImageMediaId', 'status', 'images.root'])
    expect(r.unplaced).toEqual(['Lạ'])
  })

  it('không có chi tiết thì dùng thông báo chung', () => {
    expect(mapApiError(err([], 'unknown_error', 'Lỗi 500'), snapshot)).toEqual({ placed: [], unplaced: ['Lỗi 500'] })
  })
})

describe('collectErrorPaths', () => {
  it('đi qua mảng/đối tượng lồng nhau, dừng ở nút lỗi và bỏ qua ref', () => {
    const ref = { circular: true }
    const errors = {
      name: { type: 'too_small', message: 'Nhập tên', ref },
      variants: [{ sku: { type: 'custom', message: 'x', ref } }, undefined, { price: { type: 'server', message: 'y' } }],
      attributes: { root: { type: 'server', message: 'z' } },
    }
    expect(collectErrorPaths(errors)).toEqual(['name', 'variants.0.sku', 'variants.2.price', 'attributes.root'])
    expect(collectErrorPaths(undefined)).toEqual([])
  })
})
