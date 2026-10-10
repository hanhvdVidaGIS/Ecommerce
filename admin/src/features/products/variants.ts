import type { GeneratedVariant, GenerateVariantsRequest } from './api'
import { emptyVariant, type OptionPair, type VariantFormValue } from './model'

/** Lựa chọn giá trị cho từng thuộc tính tuỳ chọn trước khi tạo biến thể. */
export interface OptionSelection {
  attributeId: string
  valueIds: string[]
}

/** Khoá ổn định của một tổ hợp giá trị (không phụ thuộc thứ tự); rỗng với biến thể không có tuỳ chọn. */
export function comboKey(options: readonly OptionPair[]): string {
  return [...options].map((o) => `${o.attributeId}:${o.valueId}`).sort().join('|')
}

export interface MergeResult {
  variants: VariantFormValue[]
  kept: number
  added: number
  /** Biến thể sẵn có không còn trong bộ tổ hợp mới (sẽ bị loại khi lưu). */
  removed: VariantFormValue[]
}

/** Nếu SKU gợi ý đã có thì thêm hậu tố -2, -3... để không tự tạo ra lỗi trùng SKU. */
function uniqueSku(suggested: string, used: Set<string>): string {
  let sku = suggested
  for (let n = 2; used.has(sku.toLowerCase()); n++) sku = `${suggested}-${n}`
  used.add(sku.toLowerCase())
  return sku
}

/**
 * Hợp nhất các tổ hợp mới sinh với biến thể sẵn có: tổ hợp trùng giá trị giữ nguyên mã, SKU, giá, tồn kho, ảnh...;
 * tổ hợp mới được thêm với giá trị mặc định; tổ hợp không còn bị đưa vào `removed`.
 * Khi sản phẩm đang chỉ có một biến thể mặc định (không tuỳ chọn), các biến thể mới thừa hưởng giá của nó để khỏi nhập lại.
 */
export function mergeGeneratedVariants(existing: readonly VariantFormValue[], generated: readonly GeneratedVariant[]): MergeResult {
  const byKey = new Map(existing.map((v) => [comboKey(v.options), v]))
  const matchedKeys = new Set<string>()
  const used = new Set<string>()
  const loneDefault = existing.length === 1 && existing[0].options.length === 0 ? existing[0] : null

  // SKU của các biến thể giữ lại phải được đăng ký trước, để SKU gợi ý của biến thể mới không đè lên.
  for (const g of generated) {
    const key = comboKey(g.options)
    const old = byKey.get(key)
    if (old) { matchedKeys.add(key); used.add(old.sku.trim().toLowerCase()) }
  }

  let kept = 0
  let added = 0
  const variants = generated.map((g): VariantFormValue => {
    const options = g.options.map((o) => ({ attributeId: o.attributeId, valueId: o.valueId }))
    const old = byKey.get(comboKey(g.options))
    if (old) {
      kept++
      return { ...old, options, label: g.label }
    }
    added++
    return {
      ...emptyVariant(),
      sku: uniqueSku(g.suggestedSku, used),
      price: loneDefault?.price ?? '',
      salePrice: loneDefault?.salePrice ?? '',
      costPrice: loneDefault?.costPrice ?? '',
      options,
      label: g.label,
    }
  })
  const removed = existing.filter((v) => !matchedKeys.has(comboKey(v.options)))
  return { variants, kept, added, removed }
}

export interface BulkPatch {
  price?: string
  salePrice?: string
  costPrice?: string
  stockQuantity?: string
  isActive?: boolean
}

/** Áp cùng một giá trị cho mọi biến thể; trường bỏ trống (undefined/'') trong patch được giữ nguyên. Giá vốn bị bỏ qua khi không có quyền. */
export function applyBulk(variants: readonly VariantFormValue[], patch: BulkPatch, opts: { canViewCost: boolean }): VariantFormValue[] {
  const has = (v: string | undefined): v is string => v !== undefined && v.trim() !== ''
  return variants.map((variant) => ({
    ...variant,
    price: has(patch.price) ? patch.price.trim() : variant.price,
    salePrice: has(patch.salePrice) ? patch.salePrice.trim() : variant.salePrice,
    costPrice: opts.canViewCost && has(patch.costPrice) ? patch.costPrice.trim() : variant.costPrice,
    stockQuantity: has(patch.stockQuantity) ? patch.stockQuantity.trim() : variant.stockQuantity,
    isActive: patch.isActive ?? variant.isActive,
  }))
}

/** Thu về sản phẩm không biến thể: giữ biến thể đầu tiên (kể cả mã, SKU, giá) và bỏ tuỳ chọn. */
export function collapseToSingle(variants: readonly VariantFormValue[]): VariantFormValue[] {
  const first = variants[0] ?? emptyVariant()
  return [{ ...first, options: [], label: '' }]
}

/** Lựa chọn giá trị ban đầu suy ra từ các biến thể đã lưu. */
export function selectionFromVariants(variants: readonly VariantFormValue[], order: readonly string[]): OptionSelection[] {
  const map = new Map<string, Set<string>>()
  for (const v of variants) for (const o of v.options) (map.get(o.attributeId) ?? map.set(o.attributeId, new Set()).get(o.attributeId)!).add(o.valueId)
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i }
  return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([attributeId, ids]) => ({ attributeId, valueIds: [...ids] }))
}

/** Yêu cầu sinh tổ hợp; bỏ qua thuộc tính chưa chọn giá trị nào. Trả về null nếu chưa chọn gì. */
export function buildGenerateRequest(selection: readonly OptionSelection[], baseSku: string): GenerateVariantsRequest | null {
  const options = selection.filter((s) => s.valueIds.length > 0).map((s) => ({ attributeId: s.attributeId, valueIds: s.valueIds }))
  if (options.length === 0) return null
  return { options, baseSku: baseSku.trim() || null }
}
