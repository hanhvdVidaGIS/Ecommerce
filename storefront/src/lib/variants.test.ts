import { describe, expect, it } from 'vitest'
import { defaultSelection, findVariant, isValueAvailable, selectValue, type Option, type Variant } from './variants'

// Hai thuộc tính: dung tích (30, 50, 100) và nồng độ (EDT, EDP). Biến thể 100ml EDT hết hàng; 30ml chỉ có EDT.
const option = (id: string, name: string, values: string[]): Option => ({ attributeId: id, code: id, name, dataType: 'Select', values: values.map((v) => ({ id: v, code: v, label: v, colorHex: null, image: null })) }) as Option
const v = (sku: string, ids: string[], price: number, inStock = true): Variant => ({ id: sku, sku, price, salePrice: null, effectivePrice: price, inStock, maxPurchasable: inStock ? 5 : 0, optionValueIds: ids, label: ids.join('/'), image: null }) as Variant

const options = [option('vol', 'Dung tích', ['30', '50', '100']), option('conc', 'Nồng độ', ['edt', 'edp'])]
const variants = [
  v('30-edt', ['30', 'edt'], 800),
  v('50-edt', ['50', 'edt'], 1200),
  v('50-edp', ['50', 'edp'], 1500),
  v('100-edt', ['100', 'edt'], 2000, false),
  v('100-edp', ['100', 'edp'], 2400),
]

describe('findVariant', () => {
  it('khớp đúng tổ hợp, chưa chọn đủ thì không có biến thể', () => {
    expect(findVariant(options, variants, { vol: '50', conc: 'edp' })?.sku).toBe('50-edp')
    expect(findVariant(options, variants, { vol: '50' })).toBeUndefined()
  })

  it('tổ hợp không tồn tại trả về undefined (30ml không có EDP)', () => {
    expect(findVariant(options, variants, { vol: '30', conc: 'edp' })).toBeUndefined()
  })

  it('sản phẩm không có tuỳ chọn dùng biến thể duy nhất', () => {
    expect(findVariant([], [v('only', [], 10)], {})?.sku).toBe('only')
  })
})

describe('defaultSelection', () => {
  it('chọn biến thể còn hàng rẻ nhất', () => {
    expect(defaultSelection(options, variants)).toEqual({ vol: '30', conc: 'edt' })
  })

  it('hết sạch hàng thì chọn biến thể rẻ nhất để vẫn hiển thị giá', () => {
    const none = variants.map((x) => ({ ...x, inStock: false }))
    expect(defaultSelection(options, none)).toEqual({ vol: '30', conc: 'edt' })
  })
})

describe('isValueAvailable', () => {
  it('giá trị chỉ chọn được khi có biến thể còn hàng khớp các lựa chọn khác', () => {
    const sel = { vol: '100', conc: 'edp' }
    expect(isValueAvailable(options, variants, sel, 'conc', 'edt')).toBe(false) // 100ml EDT hết hàng
    expect(isValueAvailable(options, variants, sel, 'conc', 'edp')).toBe(true)
    expect(isValueAvailable(options, variants, { vol: '30', conc: 'edt' }, 'conc', 'edp')).toBe(false) // 30ml không có EDP
  })
})

describe('selectValue', () => {
  it('giữ các lựa chọn khác nếu tổ hợp còn tồn tại', () => {
    expect(selectValue(options, variants, { vol: '30', conc: 'edt' }, 'vol', '50')).toEqual({ vol: '50', conc: 'edt' })
  })

  it('chuyển sang biến thể còn hàng khi tổ hợp mới không tồn tại, không bao giờ để trạng thái không hợp lệ', () => {
    const next = selectValue(options, variants, { vol: '50', conc: 'edp' }, 'vol', '30') // 30ml không có EDP
    expect(next).toEqual({ vol: '30', conc: 'edt' })
    expect(findVariant(options, variants, next)).toBeDefined()
  })

  it('ưu tiên biến thể còn hàng khi chọn giá trị có cả hàng và hết hàng', () => {
    const next = selectValue(options, variants, { vol: '30', conc: 'edt' }, 'vol', '100')
    expect(next.vol).toBe('100')
    expect(findVariant(options, variants, next)?.inStock).toBe(true) // 100 EDP, không phải 100 EDT hết hàng
  })
})
