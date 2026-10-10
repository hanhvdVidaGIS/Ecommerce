import { z } from 'zod'
import type { Dto } from '@/api/types'
import { numberOrNull } from '@/lib/forms'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { validateDateRange } from '@/features/banners/schedule'

export type Coupon = Dto<'CouponDto'>
export type SaveCouponRequest = Dto<'SaveCouponRequest'>
export type CouponType = Dto<'CouponType'>

/* ---------- Trạng thái (do backend tính, nhãn định nghĩa 1 chỗ ở đây) ---------- */
type StateTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

export const COUPON_STATE: Record<string, { label: string; tone: StateTone }> = {
  running: { label: 'Đang chạy', tone: 'success' },
  scheduled: { label: 'Chưa bắt đầu', tone: 'info' },
  expired: { label: 'Hết hạn', tone: 'warning' },
  exhausted: { label: 'Hết lượt', tone: 'danger' },
  disabled: { label: 'Đã tắt', tone: 'neutral' },
}

/** Huy hiệu cho state của backend; state lạ (backend thêm mới) hiển thị nguyên giá trị, tông trung tính. */
export function couponStateBadge(state: string): { label: string; tone: StateTone } {
  return COUPON_STATE[state] ?? { label: state, tone: 'neutral' }
}

/* ---------- Form ---------- */
const MAX_VALUE = 1_000_000_000

const TYPES = ['Percent', 'FixedAmount', 'FreeShipping'] as const satisfies readonly CouponType[]

/** Ô số nhập dạng chuỗi: '' là không có; trả số hoặc NaN nếu không phải số. */
function parse(s: string): number | null {
  const t = s.trim()
  return t === '' ? null : Number(t)
}

/** Giá trị form là chuỗi (đúng như ô nhập trả về); chuyển sang kiểu của API ở `toPayload`. */
export interface CouponFormValues {
  code: string
  type: CouponType
  value: string
  minOrderAmount: string
  maxDiscount: string
  usageLimit: string
  perUserLimit: string
  startAt: string
  endAt: string
  isActive: boolean
}

/** `usedCount`: số lượt đã dùng; giới hạn lượt không được nhỏ hơn số này (backend cũng chặn). */
export function makeCouponSchema(usedCount = 0) {
  return z.object({
    code: z.string().trim().min(1, 'Nhập mã').max(50, 'Tối đa 50 ký tự').regex(/^[A-Za-z0-9_-]+$/, 'Chỉ gồm chữ, số, gạch ngang và gạch dưới'),
    type: z.enum(TYPES, 'Chọn loại'),
    value: z.string(),
    minOrderAmount: z.string(),
    maxDiscount: z.string(),
    usageLimit: z.string(),
    perUserLimit: z.string(),
    startAt: z.string(),
    endAt: z.string(),
    isActive: z.boolean(),
  }).superRefine((v, ctx) => {
    const add = (path: keyof CouponFormValues, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })

    if (v.type !== 'FreeShipping') {
      const n = parse(v.value)
      if (n === null) add('value', 'Nhập giá trị')
      else if (Number.isNaN(n)) add('value', 'Phải là số')
      else if (n <= 0) add('value', 'Phải lớn hơn 0')
      else if (v.type === 'Percent' && n > 100) add('value', 'Phần trăm tối đa 100')
      else if (n > MAX_VALUE) add('value', 'Giá trị quá lớn')
    }

    const min = parse(v.minOrderAmount)
    if (min !== null && (Number.isNaN(min) || min < 0)) add('minOrderAmount', Number.isNaN(min) ? 'Phải là số' : 'Không được âm')

    if (v.type === 'Percent') {
      const max = parse(v.maxDiscount)
      if (max !== null && (Number.isNaN(max) || max <= 0)) add('maxDiscount', Number.isNaN(max) ? 'Phải là số' : 'Phải lớn hơn 0')
    }

    const limit = parse(v.usageLimit)
    if (limit !== null) {
      if (!Number.isInteger(limit)) add('usageLimit', 'Phải là số nguyên')
      else if (limit <= 0) add('usageLimit', 'Phải lớn hơn 0')
      else if (limit < usedCount) add('usageLimit', `Đã dùng ${usedCount} lượt, không đặt thấp hơn`)
    }

    const per = parse(v.perUserLimit)
    if (per !== null) {
      if (!Number.isInteger(per)) add('perUserLimit', 'Phải là số nguyên')
      else if (per <= 0) add('perUserLimit', 'Phải lớn hơn 0')
    }

    const range = validateDateRange(v.startAt, v.endAt)
    if (range) add('endAt', range)
  })
}

export const couponSchema = makeCouponSchema()

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

export function toFormValues(c: Coupon | null, defaultType: CouponType = 'Percent'): CouponFormValues {
  return {
    code: c?.code ?? '',
    type: c?.type ?? defaultType,
    value: c && c.type !== 'FreeShipping' ? str(c.value) : '',
    minOrderAmount: str(c?.minOrderAmount),
    maxDiscount: str(c?.maxDiscount),
    usageLimit: str(c?.usageLimit),
    perUserLimit: str(c?.perUserLimit),
    startAt: toLocalInput(c?.startAt),
    endAt: toLocalInput(c?.endAt),
    isActive: c?.isActive ?? true,
  }
}

/** Ô tuỳ chọn để trống => null (không gửi chuỗi rỗng hay 0). Mã tự chuẩn hoá chữ hoa. */
export function toPayload(v: CouponFormValues): SaveCouponRequest {
  const opt = (s: string) => numberOrNull(s.trim())
  return {
    code: v.code.trim().toUpperCase(),
    type: v.type,
    value: v.type === 'FreeShipping' ? 0 : Number(v.value),
    minOrderAmount: opt(v.minOrderAmount),
    maxDiscount: v.type === 'Percent' ? opt(v.maxDiscount) : null,
    usageLimit: opt(v.usageLimit),
    perUserLimit: opt(v.perUserLimit),
    startAt: fromLocalInput(v.startAt),
    endAt: fromLocalInput(v.endAt),
    isActive: v.isActive,
  }
}

/** Mô tả giá trị ngắn gọn cho bảng: "10% (tối đa 50.000 ₫)", "100.000 ₫", hoặc nhãn loại khi miễn phí vận chuyển. */
export function describeValue(c: Pick<Coupon, 'type' | 'value' | 'maxDiscount'>, typeLabel: string, money: (n: number) => string): string {
  if (c.type === 'FreeShipping') return typeLabel
  if (c.type === 'Percent') return `${c.value}%${c.maxDiscount ? ` (tối đa ${money(c.maxDiscount)})` : ''}`
  return money(c.value)
}
