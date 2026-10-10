import type { PublicProduct } from '@/api/types'

export type Variant = PublicProduct['variants'][number]
export type Option = PublicProduct['options'][number]
/** attributeId → valueId đang chọn */
export type Selection = Record<string, string>

/** Biến thể khớp đúng với mọi lựa chọn (mỗi thuộc tính một giá trị). Chưa chọn đủ thì trả về undefined. */
export function findVariant(options: Option[], variants: Variant[], selection: Selection): Variant | undefined {
  if (options.length === 0) return variants[0]
  if (options.some((o) => !selection[o.attributeId])) return undefined
  const wanted = new Set(options.map((o) => selection[o.attributeId]))
  return variants.find((v) => v.optionValueIds.length === wanted.size && v.optionValueIds.every((id) => wanted.has(id)))
}

/**
 * Giá trị có chọn được không: có ít nhất một biến thể còn hàng chứa giá trị này và khớp các lựa chọn ở thuộc tính khác.
 * Giá trị hết hàng vẫn hiển thị (gạch) để khách biết có tồn tại.
 */
export function isValueAvailable(options: Option[], variants: Variant[], selection: Selection, attributeId: string, valueId: string): boolean {
  const others = options.filter((o) => o.attributeId !== attributeId && selection[o.attributeId]).map((o) => selection[o.attributeId])
  return variants.some((v) => v.inStock && v.optionValueIds.includes(valueId) && others.every((id) => v.optionValueIds.includes(id)))
}

/** Lựa chọn mặc định: biến thể còn hàng rẻ nhất; không còn hàng thì biến thể rẻ nhất. */
export function defaultSelection(options: Option[], variants: Variant[]): Selection {
  const pool = variants.filter((v) => v.inStock)
  const pick = [...(pool.length ? pool : variants)].sort((a, b) => a.effectivePrice - b.effectivePrice)[0]
  const sel: Selection = {}
  if (!pick) return sel
  for (const o of options) {
    const id = o.values.find((val) => pick.optionValueIds.includes(val.id))?.id
    if (id) sel[o.attributeId] = id
  }
  return sel
}

/**
 * Sau khi khách đổi một thuộc tính: giữ các lựa chọn khác nếu tổ hợp còn hàng. Nếu tổ hợp hết hàng hoặc không tồn tại thì chuyển
 * sang biến thể còn hàng chứa giá trị vừa chọn và giữ được nhiều lựa chọn cũ nhất; không còn biến thể nào còn hàng thì giữ tổ hợp
 * (nếu có) để khách thấy "Hết hàng". Không bao giờ để rơi vào tổ hợp không tồn tại khi còn lựa chọn thay thế.
 */
export function selectValue(options: Option[], variants: Variant[], selection: Selection, attributeId: string, valueId: string): Selection {
  const next = { ...selection, [attributeId]: valueId }
  const found = findVariant(options, variants, next)
  if (found?.inStock) return next

  const kept = options.filter((o) => o.attributeId !== attributeId).map((o) => selection[o.attributeId]).filter(Boolean)
  const candidates = variants.filter((x) => x.optionValueIds.includes(valueId))
  const inStock = candidates.filter((x) => x.inStock)
  const score = (x: Variant) => kept.filter((id) => x.optionValueIds.includes(id)).length
  const best = [...inStock].sort((a, b) => score(b) - score(a))[0] ?? (found ? undefined : candidates[0])
  if (!best) return next
  const out: Selection = {}
  for (const o of options) {
    const id = o.attributeId === attributeId ? valueId : o.values.find((val) => best.optionValueIds.includes(val.id))?.id
    if (id) out[o.attributeId] = id
  }
  return out
}
