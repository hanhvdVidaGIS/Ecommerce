import type { Dto } from '@/api/types'

/**
 * Quy tắc giao diện cho thuộc tính theo kiểu dữ liệu. Phản chiếu AttributeService ở backend để chặn sớm và gợi ý;
 * backend vẫn là nơi quyết định, nên mọi lỗi nó trả về vẫn được hiển thị.
 */
export type AttributeDataType = Dto<'AttributeDataType'>
export type Attribute = Dto<'AttributeDetailDto'>
export type AttributeListItem = Dto<'AttributeListItemDto'>
export type AttributeValue = Dto<'AttributeValueDto'>
export type SaveAttributeRequest = Dto<'SaveAttributeRequest'>
export type SaveAttributeValueRequest = Dto<'SaveAttributeValueRequest'>

/** Chỉ các kiểu này mới tạo được biến thể (AttributeService.Validate). */
export const VARIANT_TYPES: readonly AttributeDataType[] = ['Select', 'Color', 'Image']
/** Các kiểu có danh sách giá trị (AttributeService.HasValueList). */
export const VALUE_LIST_TYPES: readonly AttributeDataType[] = ['Select', 'MultiSelect', 'Color', 'Image']

export const canBeVariantOption = (t: AttributeDataType) => VARIANT_TYPES.includes(t)
/** Kiểu Text không dùng làm bộ lọc. */
export const canBeFilterable = (t: AttributeDataType) => t !== 'Text'
export const hasValueList = (t: AttributeDataType) => VALUE_LIST_TYPES.includes(t)

export interface AttributeFlags {
  isFilterable: boolean
  isVariantOption: boolean
  isRequired: boolean
}

/** Lý do một cờ bị khoá: 'type' = kiểu dữ liệu không cho phép; 'variant' = thuộc tính tạo biến thể thì không có "bắt buộc". */
export type FlagLock = 'type' | 'variant' | null
export interface FlagRestrictions { isFilterable: FlagLock; isVariantOption: FlagLock; isRequired: FlagLock }

export function flagRestrictions(dataType: AttributeDataType, flags: Pick<AttributeFlags, 'isVariantOption'>): FlagRestrictions {
  return {
    isFilterable: canBeFilterable(dataType) ? null : 'type',
    isVariantOption: canBeVariantOption(dataType) ? null : 'type',
    // Backend lưu IsRequired = IsRequired && !IsVariantOption, nên hiển thị khoá để không gây hiểu nhầm.
    isRequired: flags.isVariantOption ? 'variant' : null,
  }
}

/** Đưa các cờ về trạng thái hợp lệ sau khi đổi kiểu hoặc đổi cờ khác (tắt cờ đang bị khoá). */
export function normalizeFlags<T extends AttributeFlags>(dataType: AttributeDataType, flags: T): T {
  const lock = flagRestrictions(dataType, flags)
  const variant = lock.isVariantOption ? false : flags.isVariantOption
  return {
    ...flags,
    isFilterable: lock.isFilterable ? false : flags.isFilterable,
    isVariantOption: variant,
    isRequired: variant ? false : flags.isRequired,
  }
}

/** Lỗi cho các tổ hợp mà backend sẽ từ chối (dùng làm kiểm tra cuối trước khi gửi). */
export function validateFlags(dataType: AttributeDataType, flags: AttributeFlags): Partial<Record<'isFilterable' | 'isVariantOption', string>> {
  const errors: Partial<Record<'isFilterable' | 'isVariantOption', string>> = {}
  if (flags.isVariantOption && !canBeVariantOption(dataType)) errors.isVariantOption = 'Kiểu dữ liệu này không dùng để tạo biến thể.'
  if (flags.isFilterable && !canBeFilterable(dataType)) errors.isFilterable = 'Kiểu dữ liệu này không dùng làm bộ lọc.'
  return errors
}

/* ---------- Giá trị ---------- */

/** Trường nhập theo kiểu: Color cần màu, Image cần ảnh, Select/MultiSelect chỉ cần nhãn, kiểu khác không có danh sách. */
export type ValueKind = 'plain' | 'color' | 'image'
export function valueKind(t: AttributeDataType): ValueKind | null {
  if (t === 'Color') return 'color'
  if (t === 'Image') return 'image'
  return hasValueList(t) ? 'plain' : null
}

export const isHexColor = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v.trim())

/** "#abc" → "#AABBCC"; "ff0000" → "#FF0000"; không hợp lệ → null. */
export function normalizeHex(v: string): string | null {
  let s = v.trim().replace(/^#/, '')
  if (/^[0-9A-Fa-f]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('')
  return /^[0-9A-Fa-f]{6}$/.test(s) ? `#${s.toUpperCase()}` : null
}

const SORT_STEP = 10

export function nextValueSortOrder(values: readonly Pick<AttributeValue, 'sortOrder'>[]): number {
  return values.length ? Math.max(...values.map((v) => v.sortOrder)) + SORT_STEP : SORT_STEP
}

export function sortValues<T extends Pick<AttributeValue, 'sortOrder' | 'label'>>(values: readonly T[]): T[] {
  return [...values].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'vi'))
}

/**
 * Đổi chỗ một giá trị với giá trị kề bên rồi đánh số lại 10/20/30...
 * Trả về chỉ các giá trị đổi `sortOrder` (backend không có API sắp xếp hàng loạt nên mỗi giá trị là một lần lưu).
 */
export function planValueMove<T extends Pick<AttributeValue, 'id' | 'sortOrder' | 'label'>>(values: readonly T[], id: string, dir: 'up' | 'down'): { id: string; sortOrder: number }[] {
  const sorted = sortValues(values)
  const i = sorted.findIndex((v) => v.id === id)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= sorted.length) return []
  const order = sorted.map((v) => v.id)
  ;[order[i], order[j]] = [order[j], order[i]]
  const current = new Map(sorted.map((v) => [v.id, v.sortOrder]))
  return order.flatMap((vid, k) => {
    const sortOrder = (k + 1) * SORT_STEP
    return current.get(vid) === sortOrder ? [] : [{ id: vid, sortOrder }]
  })
}

/** Gói một giá trị hiện có thành request lưu (PUT cần đủ trường). */
export function valueToRequest(v: AttributeValue, patch: Partial<SaveAttributeValueRequest> = {}): SaveAttributeValueRequest {
  return { code: v.code, label: v.label, colorHex: v.colorHex, imageMediaId: v.imageMediaId, sortOrder: v.sortOrder, ...patch }
}
