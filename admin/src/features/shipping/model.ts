import { z } from 'zod'
import type { Dto } from '@/api/types'
import { emptyToNull, numberOrNull } from '@/lib/forms'

export type ShippingRate = Dto<'ShippingRateDto'>
export type SaveShippingRateRequest = Dto<'SaveShippingRateRequest'>
export type ShippingQuote = Dto<'ShippingQuoteDto'>
export type Province = Dto<'AddressUnitDto'>

const MAX_FEE = 100_000_000
const MAX_SORT = 10_000

function parse(s: string): number | null {
  const t = s.trim()
  return t === '' ? null : Number(t)
}

/** Giá trị form là chuỗi (đúng như ô nhập trả về); chuyển sang kiểu của API ở `toPayload`. */
export interface ShippingFormValues {
  name: string
  provinceCode: string
  minOrderAmount: string
  fee: string
  freeShipThreshold: string
  isActive: boolean
  sortOrder: string
}

export const shippingSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên').max(200, 'Tối đa 200 ký tự'),
  provinceCode: z.string().max(20),
  minOrderAmount: z.string(),
  fee: z.string(),
  freeShipThreshold: z.string(),
  isActive: z.boolean(),
  sortOrder: z.string(),
}).superRefine((v, ctx) => {
  const add = (path: keyof ShippingFormValues, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })

  const fee = parse(v.fee)
  if (fee === null) add('fee', 'Nhập phí')
  else if (Number.isNaN(fee)) add('fee', 'Phải là số')
  else if (fee < 0) add('fee', 'Không được âm')
  else if (fee > MAX_FEE) add('fee', 'Phí quá lớn')

  const min = parse(v.minOrderAmount)
  if (min !== null && (Number.isNaN(min) || min < 0)) add('minOrderAmount', Number.isNaN(min) ? 'Phải là số' : 'Không được âm')

  const free = parse(v.freeShipThreshold)
  if (free !== null && (Number.isNaN(free) || free <= 0)) add('freeShipThreshold', Number.isNaN(free) ? 'Phải là số' : 'Phải lớn hơn 0')

  const sort = parse(v.sortOrder)
  if (sort === null) add('sortOrder', 'Nhập thứ tự')
  else if (!Number.isInteger(sort)) add('sortOrder', 'Phải là số nguyên')
  else if (sort < 0 || sort > MAX_SORT) add('sortOrder', `Từ 0 đến ${MAX_SORT}`)
})

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

export function toFormValues(r: ShippingRate | null, defaultSortOrder = 0): ShippingFormValues {
  return {
    name: r?.name ?? '',
    provinceCode: r?.provinceCode ?? '',
    minOrderAmount: str(r?.minOrderAmount),
    fee: str(r?.fee),
    freeShipThreshold: str(r?.freeShipThreshold),
    isActive: r?.isActive ?? true,
    sortOrder: str(r?.sortOrder ?? defaultSortOrder),
  }
}

/** Tỉnh rỗng = mọi tỉnh (null); ô tuỳ chọn để trống = null (không gửi chuỗi rỗng hay 0). */
export function toPayload(v: ShippingFormValues): SaveShippingRateRequest {
  return {
    name: v.name.trim(),
    provinceCode: emptyToNull(v.provinceCode),
    minOrderAmount: numberOrNull(v.minOrderAmount.trim()),
    fee: Number(v.fee),
    freeShipThreshold: numberOrNull(v.freeShipThreshold.trim()),
    isActive: v.isActive,
    sortOrder: Number(v.sortOrder),
  }
}

/** Thứ tự mặc định cho mức mới: lớn hơn mọi thứ tự đang có (bị chặn ở mức tối đa backend cho phép). */
export function nextSortOrder(rates: Pick<ShippingRate, 'sortOrder'>[] | undefined): number {
  if (!rates || rates.length === 0) return 0
  return Math.min(MAX_SORT, Math.max(...rates.map((r) => r.sortOrder)) + 1)
}

/** Kết quả "Thử tính phí" thành câu mô tả; tách riêng để kiểm thử. */
export function describeQuote(q: ShippingQuote, money: (n: number) => string) {
  return {
    fee: q.fee === 0 ? 'Miễn phí' : money(q.fee),
    rate: q.rateName ?? 'Không có mức nào áp dụng (phí = 0)',
    freeShip:
      q.rateName === null
        ? null
        : q.freeShipThreshold === null
          ? 'Mức này không có ngưỡng miễn phí'
          : q.amountToFreeShip === null
            ? `Đã đạt ngưỡng miễn phí (từ ${money(q.freeShipThreshold)})`
            : `Còn thiếu ${money(q.amountToFreeShip)} để được miễn phí (ngưỡng ${money(q.freeShipThreshold)})`,
  }
}
