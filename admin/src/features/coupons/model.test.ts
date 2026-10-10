import { describe, expect, it } from 'vitest'
import { COUPON_STATE, couponSchema, couponStateBadge, describeValue, makeCouponSchema, toFormValues, toPayload, type Coupon, type CouponFormValues } from './model'

const base: CouponFormValues = {
  code: 'SALE10', type: 'Percent', value: '10', minOrderAmount: '', maxDiscount: '', usageLimit: '', perUserLimit: '',
  startAt: '', endAt: '', isActive: true,
}
const errorsOf = (v: Partial<CouponFormValues>, schema = couponSchema) => {
  const r = schema.safeParse({ ...base, ...v })
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))
}

describe('couponSchema: giá trị', () => {
  it('Percent: biên 0 / 100 / 101 / âm', () => {
    expect(errorsOf({ value: '100' })).toEqual({})
    expect(errorsOf({ value: '0.5' })).toEqual({})
    expect(errorsOf({ value: '0' }).value).toBeDefined()
    expect(errorsOf({ value: '101' }).value).toMatch(/100/)
    expect(errorsOf({ value: '-1' }).value).toBeDefined()
    expect(errorsOf({ value: '' }).value).toBeDefined()
    expect(errorsOf({ value: 'abc' }).value).toBeDefined()
  })

  it('FixedAmount: > 0, không giới hạn 100, có trần', () => {
    expect(errorsOf({ type: 'FixedAmount', value: '150000' })).toEqual({})
    expect(errorsOf({ type: 'FixedAmount', value: '0' }).value).toBeDefined()
    expect(errorsOf({ type: 'FixedAmount', value: '-5' }).value).toBeDefined()
    expect(errorsOf({ type: 'FixedAmount', value: '1000000000' })).toEqual({})
    expect(errorsOf({ type: 'FixedAmount', value: '1000000001' }).value).toBeDefined()
  })

  it('FreeShipping: bỏ qua giá trị', () => {
    expect(errorsOf({ type: 'FreeShipping', value: '' })).toEqual({})
    expect(errorsOf({ type: 'FreeShipping', value: '-9' })).toEqual({})
  })
})

describe('couponSchema: mã', () => {
  it('chỉ chữ/số/gạch ngang/gạch dưới, tối đa 50, không rỗng', () => {
    expect(errorsOf({ code: 'AB_c-9' })).toEqual({})
    expect(errorsOf({ code: 'A'.repeat(50) })).toEqual({})
    expect(errorsOf({ code: 'A'.repeat(51) }).code).toBeDefined()
    expect(errorsOf({ code: '' }).code).toBeDefined()
    expect(errorsOf({ code: '   ' }).code).toBeDefined()
    expect(errorsOf({ code: 'GIAM 10' }).code).toBeDefined()
    expect(errorsOf({ code: 'GIẢM10' }).code).toBeDefined()
  })
})

describe('couponSchema: ô tuỳ chọn và thời gian', () => {
  it('đơn tối thiểu >= 0; giảm tối đa > 0 (chỉ khi Percent)', () => {
    expect(errorsOf({ minOrderAmount: '0' })).toEqual({})
    expect(errorsOf({ minOrderAmount: '-1' }).minOrderAmount).toBeDefined()
    expect(errorsOf({ maxDiscount: '0' }).maxDiscount).toBeDefined()
    expect(errorsOf({ maxDiscount: '1' })).toEqual({})
    expect(errorsOf({ type: 'FixedAmount', maxDiscount: '0' })).toEqual({})
  })

  it('giới hạn lượt > 0 và là số nguyên', () => {
    expect(errorsOf({ usageLimit: '1' })).toEqual({})
    expect(errorsOf({ usageLimit: '0' }).usageLimit).toBeDefined()
    expect(errorsOf({ usageLimit: '-3' }).usageLimit).toBeDefined()
    expect(errorsOf({ usageLimit: '2.5' }).usageLimit).toBeDefined()
    expect(errorsOf({ perUserLimit: '0' }).perUserLimit).toBeDefined()
    expect(errorsOf({ perUserLimit: '1.5' }).perUserLimit).toBeDefined()
  })

  it('giới hạn lượt không nhỏ hơn số lượt đã dùng', () => {
    const s = makeCouponSchema(5)
    expect(errorsOf({ usageLimit: '4' }, s).usageLimit).toMatch(/5/)
    expect(errorsOf({ usageLimit: '5' }, s)).toEqual({})
    expect(errorsOf({ usageLimit: '' }, s)).toEqual({})
  })

  it('kết thúc phải sau bắt đầu', () => {
    expect(errorsOf({ startAt: '2026-10-10T08:00', endAt: '2026-10-10T08:01' })).toEqual({})
    expect(errorsOf({ startAt: '2026-10-10T08:00', endAt: '2026-10-10T08:00' }).endAt).toBeDefined()
    expect(errorsOf({ startAt: '2026-10-10T08:00', endAt: '2026-10-09T08:00' }).endAt).toBeDefined()
    expect(errorsOf({ startAt: '', endAt: '2026-10-09T08:00' })).toEqual({})
  })
})

describe('toPayload / toFormValues', () => {
  it('ô tuỳ chọn trống => null; mã chuẩn hoá chữ hoa', () => {
    expect(toPayload({ ...base, code: ' sale10 ' })).toEqual({
      code: 'SALE10', type: 'Percent', value: 10, minOrderAmount: null, maxDiscount: null, usageLimit: null, perUserLimit: null,
      startAt: null, endAt: null, isActive: true,
    })
  })

  it('không bao giờ gửi 0 hay chuỗi rỗng cho ô số tuỳ chọn trống', () => {
    const p = toPayload({ ...base, minOrderAmount: '  ', maxDiscount: '', usageLimit: '', perUserLimit: ' ' })
    expect([p.minOrderAmount, p.maxDiscount, p.usageLimit, p.perUserLimit]).toEqual([null, null, null, null])
  })

  it('giữ số khi có nhập; "0" ở đơn tối thiểu là 0 thật', () => {
    const p = toPayload({ ...base, minOrderAmount: '0', maxDiscount: '50000', usageLimit: '100', perUserLimit: '1' })
    expect([p.minOrderAmount, p.maxDiscount, p.usageLimit, p.perUserLimit]).toEqual([0, 50000, 100, 1])
  })

  it('FreeShipping: value = 0, maxDiscount = null; FixedAmount: maxDiscount = null', () => {
    expect(toPayload({ ...base, type: 'FreeShipping', value: '', maxDiscount: '999' })).toMatchObject({ value: 0, maxDiscount: null })
    expect(toPayload({ ...base, type: 'FixedAmount', value: '100000', maxDiscount: '999' })).toMatchObject({ value: 100000, maxDiscount: null })
  })

  it('thời gian đi qua ISO UTC và quay lại đúng giá trị nhập', () => {
    const p = toPayload({ ...base, startAt: '2026-10-10T08:30', endAt: '2026-11-01T00:00' })
    expect(p.startAt).toBe(new Date('2026-10-10T08:30').toISOString())
    const c = { ...makeCoupon(), startAt: p.startAt, endAt: p.endAt }
    const f = toFormValues(c)
    expect([f.startAt, f.endAt]).toEqual(['2026-10-10T08:30', '2026-11-01T00:00'])
  })

  it('toFormValues: mã mới có mặc định, mã cũ ánh xạ đủ trường và null thành rỗng', () => {
    expect(toFormValues(null)).toMatchObject({ code: '', type: 'Percent', value: '', isActive: true, usageLimit: '' })
    const f = toFormValues({ ...makeCoupon(), type: 'FixedAmount', value: 100000, minOrderAmount: 500000, usageLimit: 20 })
    expect(f).toMatchObject({ type: 'FixedAmount', value: '100000', minOrderAmount: '500000', maxDiscount: '', usageLimit: '20', perUserLimit: '' })
    expect(toFormValues({ ...makeCoupon(), type: 'FreeShipping', value: 0 }).value).toBe('')
  })

  it('đi vòng form → payload → form giữ nguyên giá trị', () => {
    const v: CouponFormValues = { ...base, code: 'AB', value: '12.5', minOrderAmount: '100', maxDiscount: '30', usageLimit: '9', perUserLimit: '2', startAt: '2026-01-02T03:04', endAt: '2026-02-03T04:05' }
    const p = toPayload(v)
    const back = toFormValues({ ...makeCoupon(), ...p, id: 'x', usedCount: 0, state: 'running' })
    expect(back).toEqual(v)
  })
})

describe('couponStateBadge', () => {
  it('mỗi state của backend có nhãn tiếng Việt và tông màu riêng', () => {
    for (const s of ['disabled', 'scheduled', 'expired', 'exhausted', 'running']) expect(COUPON_STATE[s]).toBeDefined()
    expect(couponStateBadge('running')).toEqual({ label: 'Đang chạy', tone: 'success' })
    expect(couponStateBadge('exhausted').tone).toBe('danger')
    expect(couponStateBadge('disabled').tone).toBe('neutral')
    expect(new Set(Object.values(COUPON_STATE).map((x) => x.label)).size).toBe(5)
  })

  it('state lạ hiển thị nguyên giá trị', () => {
    expect(couponStateBadge('paused')).toEqual({ label: 'paused', tone: 'neutral' })
  })
})

describe('describeValue', () => {
  const money = (n: number) => `${n}đ`
  it('theo loại', () => {
    expect(describeValue({ type: 'Percent', value: 10, maxDiscount: null }, 'Phần trăm', money)).toBe('10%')
    expect(describeValue({ type: 'Percent', value: 10, maxDiscount: 50000 }, 'Phần trăm', money)).toBe('10% (tối đa 50000đ)')
    expect(describeValue({ type: 'FixedAmount', value: 100000, maxDiscount: null }, 'Giảm tiền', money)).toBe('100000đ')
    expect(describeValue({ type: 'FreeShipping', value: 0, maxDiscount: null }, 'Miễn phí vận chuyển', money)).toBe('Miễn phí vận chuyển')
  })
})

function makeCoupon(): Coupon {
  return {
    id: '1', code: 'X', type: 'Percent', value: 10, minOrderAmount: null, maxDiscount: null, usageLimit: null, usedCount: 0, perUserLimit: null,
    startAt: null, endAt: null, isActive: true, state: 'running',
  }
}
