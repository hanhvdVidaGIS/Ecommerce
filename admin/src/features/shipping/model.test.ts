import { describe, expect, it } from 'vitest'
import { describeQuote, nextSortOrder, shippingSchema, toFormValues, toPayload, type ShippingFormValues, type ShippingRate } from './model'

const base: ShippingFormValues = { name: 'Nội thành', provinceCode: '', minOrderAmount: '', fee: '30000', freeShipThreshold: '', isActive: true, sortOrder: '0' }
const errorsOf = (v: Partial<ShippingFormValues>) => {
  const r = shippingSchema.safeParse({ ...base, ...v })
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))
}

describe('shippingSchema', () => {
  it('tên bắt buộc, tối đa 200', () => {
    expect(errorsOf({})).toEqual({})
    expect(errorsOf({ name: '  ' }).name).toBeDefined()
    expect(errorsOf({ name: 'a'.repeat(200) })).toEqual({})
    expect(errorsOf({ name: 'a'.repeat(201) }).name).toBeDefined()
  })

  it('phí: 0 hợp lệ, âm và vượt trần bị chặn', () => {
    expect(errorsOf({ fee: '0' })).toEqual({})
    expect(errorsOf({ fee: '100000000' })).toEqual({})
    expect(errorsOf({ fee: '100000001' }).fee).toBeDefined()
    expect(errorsOf({ fee: '-1' }).fee).toBeDefined()
    expect(errorsOf({ fee: '' }).fee).toBeDefined()
    expect(errorsOf({ fee: 'x' }).fee).toBeDefined()
  })

  it('đơn tối thiểu >= 0; ngưỡng miễn phí > 0', () => {
    expect(errorsOf({ minOrderAmount: '0' })).toEqual({})
    expect(errorsOf({ minOrderAmount: '-1' }).minOrderAmount).toBeDefined()
    expect(errorsOf({ freeShipThreshold: '0' }).freeShipThreshold).toBeDefined()
    expect(errorsOf({ freeShipThreshold: '-5' }).freeShipThreshold).toBeDefined()
    expect(errorsOf({ freeShipThreshold: '500000' })).toEqual({})
  })

  it('thứ tự là số nguyên 0..10000', () => {
    expect(errorsOf({ sortOrder: '10000' })).toEqual({})
    expect(errorsOf({ sortOrder: '10001' }).sortOrder).toBeDefined()
    expect(errorsOf({ sortOrder: '-1' }).sortOrder).toBeDefined()
    expect(errorsOf({ sortOrder: '1.5' }).sortOrder).toBeDefined()
    expect(errorsOf({ sortOrder: '' }).sortOrder).toBeDefined()
  })
})

describe('toPayload / toFormValues', () => {
  it('tỉnh rỗng => null (mọi tỉnh); ô tuỳ chọn trống => null', () => {
    expect(toPayload(base)).toEqual({ name: 'Nội thành', provinceCode: null, minOrderAmount: null, fee: 30000, freeShipThreshold: null, isActive: true, sortOrder: 0 })
    expect(toPayload({ ...base, minOrderAmount: ' ', freeShipThreshold: ' ' })).toMatchObject({ minOrderAmount: null, freeShipThreshold: null })
  })

  it('giữ tỉnh và số khi có nhập; "0" đơn tối thiểu là 0 thật', () => {
    expect(toPayload({ ...base, provinceCode: '01', minOrderAmount: '0', freeShipThreshold: '500000', fee: '0' }))
      .toMatchObject({ provinceCode: '01', minOrderAmount: 0, freeShipThreshold: 500000, fee: 0 })
  })

  it('đi vòng rate → form → payload', () => {
    const rate: ShippingRate = { id: '1', name: 'HN', provinceCode: '01', provinceName: 'Hà Nội', minOrderAmount: null, fee: 20000, freeShipThreshold: 300000, isActive: false, sortOrder: 3 }
    expect(toFormValues(rate)).toEqual({ name: 'HN', provinceCode: '01', minOrderAmount: '', fee: '20000', freeShipThreshold: '300000', isActive: false, sortOrder: '3' })
    expect(toPayload(toFormValues(rate))).toEqual({ name: 'HN', provinceCode: '01', minOrderAmount: null, fee: 20000, freeShipThreshold: 300000, isActive: false, sortOrder: 3 })
    expect(toFormValues(null, 7)).toMatchObject({ provinceCode: '', sortOrder: '7', isActive: true })
  })
})

describe('nextSortOrder', () => {
  it('lớn hơn thứ tự hiện có, có trần', () => {
    expect(nextSortOrder(undefined)).toBe(0)
    expect(nextSortOrder([])).toBe(0)
    expect(nextSortOrder([{ sortOrder: 2 }, { sortOrder: 5 }])).toBe(6)
    expect(nextSortOrder([{ sortOrder: 10000 }])).toBe(10000)
  })
})

describe('describeQuote', () => {
  const money = (n: number) => `${n}đ`
  it('còn thiếu bao nhiêu để miễn phí', () => {
    expect(describeQuote({ fee: 30000, rateName: 'Mặc định', freeShipThreshold: 500000, amountToFreeShip: 200000 }, money))
      .toEqual({ fee: '30000đ', rate: 'Mặc định', freeShip: 'Còn thiếu 200000đ để được miễn phí (ngưỡng 500000đ)' })
  })
  it('đã đạt ngưỡng => miễn phí', () => {
    const r = describeQuote({ fee: 0, rateName: 'Mặc định', freeShipThreshold: 500000, amountToFreeShip: null }, money)
    expect(r.fee).toBe('Miễn phí')
    expect(r.freeShip).toMatch(/Đã đạt/)
  })
  it('mức không có ngưỡng; không có mức nào', () => {
    expect(describeQuote({ fee: 15000, rateName: 'A', freeShipThreshold: null, amountToFreeShip: null }, money).freeShip).toBe('Mức này không có ngưỡng miễn phí')
    const none = describeQuote({ fee: 0, rateName: null, freeShipThreshold: null, amountToFreeShip: null }, money)
    expect(none.freeShip).toBeNull()
    expect(none.rate).toMatch(/Không có mức/)
  })
})
