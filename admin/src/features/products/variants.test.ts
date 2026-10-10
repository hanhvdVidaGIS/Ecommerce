import { describe, expect, it } from 'vitest'
import type { GeneratedVariant } from './api'
import { COLOR, SIZE, variant } from './fixtures'
import { applyBulk, buildGenerateRequest, collapseToSingle, comboKey, mergeGeneratedVariants, selectionFromVariants } from './variants'

const gen = (sku: string, label: string, ...pairs: [string, string][]): GeneratedVariant => ({
  suggestedSku: sku, label,
  options: pairs.map(([attributeId, valueId]) => ({ attributeId, attributeName: attributeId, valueId, valueLabel: valueId })),
})
const size = (v: string) => ({ attributeId: SIZE.id, valueId: v })

describe('comboKey', () => {
  it('không phụ thuộc thứ tự tuỳ chọn', () => {
    const a = comboKey([size('v-50'), { attributeId: COLOR.id, valueId: 'c-red' }])
    const b = comboKey([{ attributeId: COLOR.id, valueId: 'c-red' }, size('v-50')])
    expect(a).toBe(b)
    expect(comboKey([])).toBe('')
  })
})

describe('mergeGeneratedVariants', () => {
  const existing = [
    variant({ variantId: 'id-50', sku: 'X-50', price: '500', salePrice: '450', costPrice: '300', stockQuantity: '7', barcode: 'BC', options: [size('v-50')], label: '50 ml' }),
    variant({ variantId: 'id-100', sku: 'X-100', price: '900', options: [size('v-100')], label: '100 ml' }),
  ]

  it('giữ nguyên mã, SKU, giá, tồn kho của tổ hợp trùng; thêm tổ hợp mới; báo tổ hợp bị loại', () => {
    const generated = [gen('NEW-50', '50 ml', [SIZE.id, 'v-50']), gen('NEW-200', '200 ml', [SIZE.id, 'v-200'])]
    const r = mergeGeneratedVariants(existing, generated)
    expect(r.kept).toBe(1)
    expect(r.added).toBe(1)
    expect(r.removed.map((v) => v.variantId)).toEqual(['id-100'])
    expect(r.variants[0]).toMatchObject({ variantId: 'id-50', sku: 'X-50', price: '500', salePrice: '450', costPrice: '300', stockQuantity: '7', barcode: 'BC' })
    expect(r.variants[1]).toMatchObject({ variantId: null, sku: 'NEW-200', price: '', stockQuantity: '0', isActive: true, label: '200 ml' })
  })

  it('giữ thứ tự của bộ tổ hợp mới sinh', () => {
    const generated = [gen('A', '100 ml', [SIZE.id, 'v-100']), gen('B', '50 ml', [SIZE.id, 'v-50'])]
    expect(mergeGeneratedVariants(existing, generated).variants.map((v) => v.variantId)).toEqual(['id-100', 'id-50'])
  })

  it('tạo lại đúng bộ cũ thì không mất gì', () => {
    const generated = [gen('A', '50 ml', [SIZE.id, 'v-50']), gen('B', '100 ml', [SIZE.id, 'v-100'])]
    const r = mergeGeneratedVariants(existing, generated)
    expect(r).toMatchObject({ kept: 2, added: 0 })
    expect(r.removed).toEqual([])
  })

  it('SKU gợi ý trùng với SKU của biến thể giữ lại thì thêm hậu tố', () => {
    const generated = [gen('A', '50 ml', [SIZE.id, 'v-50']), gen('x-50', '200 ml', [SIZE.id, 'v-200']), gen('x-50', '300 ml', [SIZE.id, 'v-300'])]
    const skus = mergeGeneratedVariants(existing, generated).variants.map((v) => v.sku)
    expect(skus).toEqual(['X-50', 'x-50-2', 'x-50-3'])
  })

  it('từ sản phẩm một biến thể mặc định sang có tuỳ chọn: biến thể mới thừa hưởng giá', () => {
    const lone = [variant({ variantId: 'def', sku: 'D', price: '120', salePrice: '100', costPrice: '60', stockQuantity: '9' })]
    const r = mergeGeneratedVariants(lone, [gen('D-50', '50 ml', [SIZE.id, 'v-50'])])
    expect(r.removed).toHaveLength(1)
    expect(r.variants[0]).toMatchObject({ variantId: null, price: '120', salePrice: '100', costPrice: '60', stockQuantity: '0' })
  })

  it('không thừa hưởng giá khi nhiều biến thể cũ', () => {
    const r = mergeGeneratedVariants(existing, [gen('N', '200 ml', [SIZE.id, 'v-200'])])
    expect(r.variants[0].price).toBe('')
  })
})

describe('applyBulk', () => {
  const vs = [variant({ price: '1', costPrice: '5', stockQuantity: '1' }), variant({ sku: 'B', price: '2', costPrice: '6', stockQuantity: '2' })]

  it('chỉ ghi đè trường có giá trị', () => {
    const r = applyBulk(vs, { price: '10', stockQuantity: '' }, { canViewCost: true })
    expect(r.map((v) => v.price)).toEqual(['10', '10'])
    expect(r.map((v) => v.stockQuantity)).toEqual(['1', '2'])
  })

  it('không đổi giá vốn khi không có quyền', () => {
    const r = applyBulk(vs, { costPrice: '99' }, { canViewCost: false })
    expect(r.map((v) => v.costPrice)).toEqual(['5', '6'])
    expect(applyBulk(vs, { costPrice: '99' }, { canViewCost: true }).map((v) => v.costPrice)).toEqual(['99', '99'])
  })

  it('bật/tắt tất cả', () => {
    expect(applyBulk(vs, { isActive: false }, { canViewCost: true }).every((v) => !v.isActive)).toBe(true)
  })
})

describe('collapseToSingle / selectionFromVariants / buildGenerateRequest', () => {
  it('thu về một biến thể giữ mã và SKU', () => {
    const r = collapseToSingle([variant({ variantId: 'a', sku: 'S', options: [size('v-50')], label: 'x' }), variant({ variantId: 'b' })])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ variantId: 'a', sku: 'S', options: [], label: '' })
  })

  it('suy ra lựa chọn theo thứ tự thuộc tính', () => {
    const vs = [
      variant({ options: [size('v-50'), { attributeId: COLOR.id, valueId: 'c-red' }] }),
      variant({ options: [size('v-100'), { attributeId: COLOR.id, valueId: 'c-red' }] }),
    ]
    expect(selectionFromVariants(vs, [COLOR.id, SIZE.id])).toEqual([
      { attributeId: COLOR.id, valueIds: ['c-red'] },
      { attributeId: SIZE.id, valueIds: ['v-50', 'v-100'] },
    ])
  })

  it('bỏ thuộc tính chưa chọn giá trị; null khi chưa chọn gì', () => {
    expect(buildGenerateRequest([{ attributeId: 'a', valueIds: [] }], 'x')).toBeNull()
    expect(buildGenerateRequest([{ attributeId: 'a', valueIds: ['1'] }, { attributeId: 'b', valueIds: [] }], ' ')).toEqual({ options: [{ attributeId: 'a', valueIds: ['1'] }], baseSku: null })
  })
})
