import { describe, expect, it } from 'vitest'
import { attrDef, COLOR, detail, SIZE, variant } from './fixtures'
import {
  addImages, buildAttributeEntries, emptyProductValues, hasAttributeValue, moveImage, normalizePrimary, planCategoryChange, productFormSchema,
  removeImage, requestAttributes, setPrimaryImage, tabForPath, toFormValues, toRequest, type AttributeFormValue, type ProductFormValues,
} from './model'

const defs = new Map([SIZE, COLOR].map((d) => [d.id, d]))

function valid(over: Partial<ProductFormValues> = {}): ProductFormValues {
  return { ...emptyProductValues(), name: 'Sản phẩm A', variants: [variant({ sku: 'A-1', price: '100', stockQuantity: '3' })], ...over }
}

describe('toRequest', () => {
  it('chuẩn hoá chuỗi rỗng thành null, chuỗi số thành số, bỏ danh mục phụ trùng danh mục chính', () => {
    const req = toRequest(valid({ slug: ' ', primaryCategoryId: 'c1', categoryIds: ['c1', 'c2'], brandId: '', shortDescription: '', videoUrl: ' https://v ' }), { canViewCost: true })
    expect(req).toMatchObject({ name: 'Sản phẩm A', slug: null, primaryCategoryId: 'c1', categoryIds: ['c2'], brandId: null, shortDescription: null, videoUrl: 'https://v' })
    expect(req.variants[0]).toMatchObject({ id: null, sku: 'A-1', price: 100, salePrice: null, stockQuantity: 3, options: [] })
  })

  it('không gửi giá vốn khi không có quyền xem giá vốn', () => {
    const values = valid({ variants: [variant({ costPrice: '77', salePrice: '50' })] })
    expect(toRequest(values, { canViewCost: true }).variants[0].costPrice).toBe(77)
    expect(toRequest(values, { canViewCost: false }).variants[0].costPrice).toBeNull()
    expect(toRequest(values, { canViewCost: false }).variants[0].salePrice).toBe(50)
  })

  it('gửi mã biến thể sẵn có và các tuỳ chọn', () => {
    const v = variant({ variantId: 'id-1', options: [{ attributeId: SIZE.id, valueId: 'v-50' }] })
    expect(toRequest(valid({ variants: [v] }), { canViewCost: true }).variants[0]).toMatchObject({ id: 'id-1', options: [{ attributeId: SIZE.id, valueId: 'v-50' }] })
  })

  it('luôn có đúng một ảnh chính, theo thứ tự đã sắp', () => {
    const images = [
      { mediaId: 'm1', url: 'u1', altText: null, isPrimary: false },
      { mediaId: 'm2', url: 'u2', altText: null, isPrimary: false },
    ]
    const req = toRequest(valid({ images }), { canViewCost: true })
    expect(req.images).toEqual([{ mediaId: 'm1', isPrimary: true }, { mediaId: 'm2', isPrimary: false }])
  })

  it('chỉ gửi thuộc tính có giá trị, đúng trường theo kiểu dữ liệu', () => {
    const mk = (over: Partial<AttributeFormValue>): AttributeFormValue => ({ attributeId: 'x', name: 'X', dataType: 'Text', isRequired: false, unit: null, valueIds: [], text: '', number: '', bool: null, ...over })
    const attributes = [
      mk({ attributeId: 't', dataType: 'Text', text: ' abc ' }),
      mk({ attributeId: 'empty', dataType: 'Text', text: '  ' }),
      mk({ attributeId: 'n', dataType: 'Number', number: '12.5' }),
      mk({ attributeId: 'b', dataType: 'Boolean', bool: false }),
      mk({ attributeId: 'b2', dataType: 'Boolean', bool: null }),
      mk({ attributeId: 's', dataType: 'Select', valueIds: ['v1'] }),
      mk({ attributeId: 'm', dataType: 'MultiSelect', valueIds: ['v1', 'v2'] }),
    ]
    const req = toRequest(valid({ attributes }), { canViewCost: true })
    expect(req.attributes).toEqual([
      { attributeId: 't', valueIds: null, text: 'abc', number: null, bool: null },
      { attributeId: 'n', valueIds: null, text: null, number: 12.5, bool: null },
      { attributeId: 'b', valueIds: null, text: null, number: null, bool: false },
      { attributeId: 's', valueIds: ['v1'], text: null, number: null, bool: null },
      { attributeId: 'm', valueIds: ['v1', 'v2'], text: null, number: null, bool: null },
    ])
    expect(requestAttributes({ attributes }).map((a) => a.entry.attributeId)).toEqual(['t', 'n', 'b', 's', 'm'])
  })
})

describe('toFormValues', () => {
  it('đọc chi tiết sản phẩm: danh mục phụ không chứa danh mục chính, nhãn biến thể theo thứ tự thuộc tính áp dụng', () => {
    const d = detail({
      attributes: [],
      optionAttributeIds: [SIZE.id, COLOR.id],
      variants: [{
        id: 'v1', sku: 'S', barcode: null, price: 10, salePrice: null, costPrice: null, stockQuantity: 2, isDefault: false, isActive: true, imageMediaId: null, image: null,
        options: [{ attributeId: COLOR.id, valueId: 'c-red' }, { attributeId: SIZE.id, valueId: 'v-100' }],
      }],
    })
    const f = toFormValues(d, defs, [SIZE.id, COLOR.id])
    expect(f.categoryIds).toEqual(['cat-2'])
    expect(f.variants[0]).toMatchObject({ variantId: 'v1', price: '10', salePrice: '', costPrice: '', stockQuantity: '2', label: '100 ml / Đỏ' })
  })

  it('đọc rồi ghi lại (khi không đổi gì) cho ra yêu cầu tương đương dữ liệu đã lưu', () => {
    const d = detail()
    const req = toRequest(toFormValues(d, defs, []), { canViewCost: true })
    expect(req).toMatchObject({ name: 'SP', slug: 'sp', primaryCategoryId: 'cat-1', categoryIds: ['cat-2'], brandId: 'b-1', status: 'Active', isFeatured: true })
    expect(req.variants).toEqual([{ id: 'var-1', sku: 'SP-1', barcode: null, price: 100, salePrice: 90, costPrice: 50, stockQuantity: 5, isActive: true, imageMediaId: null, options: [] }])
  })

  it('không có quyền xem giá vốn: chi tiết trả costPrice null và yêu cầu cũng null', () => {
    const d = detail({ canViewCost: false })
    d.variants[0].costPrice = null
    const form = toFormValues(d, defs, [])
    expect(form.variants[0].costPrice).toBe('')
    expect(toRequest(form, { canViewCost: false }).variants[0].costPrice).toBeNull()
  })
})

describe('thuộc tính mô tả', () => {
  const text = attrDef({ id: 't', name: 'Xuất xứ', dataType: 'Text', isRequired: true })
  const flag = attrDef({ id: 'f', name: 'Hữu cơ', dataType: 'Boolean', isRequired: true })
  const off = attrDef({ id: 'off', name: 'Tắt', dataType: 'Text', isActive: false })

  it('bỏ thuộc tính tuỳ chọn biến thể và thuộc tính đã tắt; đúng/sai bắt buộc mặc định là không', () => {
    const entries = buildAttributeEntries([text, SIZE, off, flag], {})
    expect(entries.map((e) => e.attributeId)).toEqual(['t', 'f'])
    expect(entries[1].bool).toBe(false)
  })

  it('giữ giá trị đã nhập khi dựng lại bộ thuộc tính', () => {
    const prev = buildAttributeEntries([text], {}).map((e) => ({ ...e, text: 'VN' }))
    const next = buildAttributeEntries([text, flag], { previous: prev })
    expect(next[0].text).toBe('VN')
    expect(next).toHaveLength(2)
  })

  it('đổi danh mục: chỉ báo mất dữ liệu với thuộc tính đang có giá trị và tuỳ chọn biến thể đang dùng', () => {
    const entries = buildAttributeEntries([text, flag], {}).map((e) => (e.attributeId === 't' ? { ...e, text: 'VN' } : e))
    const plan = planCategoryChange({ attributes: entries, usedOptionAttributeIds: [SIZE.id, COLOR.id], newDescriptiveIds: [], newOptionIds: [COLOR.id] })
    // 'f' là đúng/sai bắt buộc mặc định false, có giá trị nên cũng được tính
    expect(plan.lostAttributeIds).toEqual(['t', 'f'])
    expect(plan.lostOptionAttributeIds).toEqual([SIZE.id])
    expect(planCategoryChange({ attributes: entries, usedOptionAttributeIds: [], newDescriptiveIds: ['t', 'f'], newOptionIds: [] })).toEqual({ lostAttributeIds: [], lostOptionAttributeIds: [] })
  })

  it('nhận diện ô có giá trị theo kiểu dữ liệu', () => {
    const base = { valueIds: [], text: '', number: '', bool: null }
    expect(hasAttributeValue({ ...base, dataType: 'Number', number: '0' })).toBe(true)
    expect(hasAttributeValue({ ...base, dataType: 'Number', number: '' })).toBe(false)
    expect(hasAttributeValue({ ...base, dataType: 'Select', valueIds: ['a', 'b'] })).toBe(false)
    expect(hasAttributeValue({ ...base, dataType: 'MultiSelect', valueIds: ['a', 'b'] })).toBe(true)
  })
})

describe('ảnh sản phẩm', () => {
  const img = (id: string, isPrimary = false) => ({ mediaId: id, url: id, altText: null, isPrimary })

  it('ảnh đầu tiên thêm vào tự thành ảnh chính; không thêm ảnh trùng', () => {
    const r = addImages([], [img('a'), img('b'), img('a')])
    expect(r.map((i) => [i.mediaId, i.isPrimary])).toEqual([['a', true], ['b', false]])
    expect(addImages(r, [img('b'), img('c')]).map((i) => i.mediaId)).toEqual(['a', 'b', 'c'])
  })

  it('gỡ ảnh chính thì chuyển sang ảnh đầu; đặt ảnh chính chỉ một ảnh', () => {
    const r = removeImage([img('a', true), img('b'), img('c')], 'a')
    expect(r.map((i) => [i.mediaId, i.isPrimary])).toEqual([['b', true], ['c', false]])
    expect(setPrimaryImage(r, 'c').filter((i) => i.isPrimary).map((i) => i.mediaId)).toEqual(['c'])
    expect(normalizePrimary([img('a', true), img('b', true)]).filter((i) => i.isPrimary)).toHaveLength(1)
  })

  it('đổi chỗ ảnh', () => {
    expect(moveImage(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveImage(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })
})

describe('productFormSchema', () => {
  const errorsOf = (v: ProductFormValues) => {
    const r = productFormSchema.safeParse(v)
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  }

  it('hợp lệ với sản phẩm một biến thể', () => {
    expect(errorsOf(valid())).toEqual([])
  })

  it('giá khuyến mãi phải nhỏ hơn giá bán', () => {
    expect(errorsOf(valid({ variants: [variant({ price: '100', salePrice: '100' })] }))).toContain('variants.0.salePrice: Giá khuyến mãi phải nhỏ hơn giá bán')
    expect(errorsOf(valid({ variants: [variant({ price: '100', salePrice: '99' })] }))).toEqual([])
  })

  it('SKU lặp (không phân biệt hoa thường), thiếu giá, tồn kho không nguyên', () => {
    const errs = errorsOf(valid({ variants: [variant({ sku: 'ab' }), variant({ sku: 'AB', price: '', stockQuantity: '1.5' })] }))
    expect(errs).toContain('variants.1.sku: SKU bị lặp trong sản phẩm')
    expect(errs).toContain('variants.1.price: Nhập giá bán')
    expect(errs).toContain('variants.1.stockQuantity: Tồn kho phải là số nguyên từ 0')
  })

  it('đang bán cần ít nhất một biến thể bật; thuộc tính bắt buộc phải có giá trị', () => {
    expect(errorsOf(valid({ status: 'Active', variants: [variant({ isActive: false })] }))).toContain('status: Sản phẩm đang bán cần ít nhất một biến thể đang bật')
    const a = buildAttributeEntries([attrDef({ id: 't', name: 'Xuất xứ', dataType: 'Text', isRequired: true })], {})
    expect(errorsOf(valid({ attributes: a }))).toContain('attributes.0: Nhập giá trị cho "Xuất xứ"')
  })

  it('slug và liên kết video', () => {
    expect(errorsOf(valid({ slug: 'Sai Slug' })).some((e) => e.startsWith('slug'))).toBe(true)
    expect(errorsOf(valid({ videoUrl: 'ftp://x' })).some((e) => e.startsWith('videoUrl'))).toBe(true)
    expect(errorsOf(valid({ slug: 'ok-slug', videoUrl: 'https://youtu.be/x' }))).toEqual([])
  })
})

describe('tabForPath', () => {
  it('đường dẫn lỗi → tab chứa ô', () => {
    expect(tabForPath('name')).toBe('general')
    expect(tabForPath('status')).toBe('general')
    expect(tabForPath('images.root')).toBe('images')
    expect(tabForPath('attributes.2')).toBe('attributes')
    expect(tabForPath('variants.0.price')).toBe('variants')
    expect(tabForPath('seo.metaTitle')).toBe('seo')
  })
})
