import { z } from 'zod'
import type { Dto } from '@/api/types'
import { emptyToNull, numberOrNull } from '@/lib/forms'
import type { AttributeDef, ProductDetail, ProductStatus, SaveProductRequest } from './api'

/**
 * Mô hình form sản phẩm và ánh xạ hai chiều với API. Mọi hàm ở đây là hàm thuần (không React, không mạng)
 * để kiểm thử được: dữ liệu form dùng chuỗi cho ô số (ô nhập luôn trả chuỗi), chuyển sang số khi gửi lên.
 */

export type AttributeDataType = Dto<'AttributeDataType'>

export interface ImageFormValue {
  mediaId: string
  url: string
  altText: string | null
  isPrimary: boolean
}

export interface OptionPair {
  attributeId: string
  valueId: string
}

export interface VariantFormValue {
  /** Mã biến thể đã lưu; null với biến thể mới. Dùng tên riêng (không phải `id`) để không đụng khoá nội bộ của useFieldArray. */
  variantId: string | null
  sku: string
  barcode: string
  price: string
  salePrice: string
  costPrice: string
  stockQuantity: string
  isActive: boolean
  imageMediaId: string | null
  imageUrl: string | null
  options: OptionPair[]
  /** Nhãn dễ đọc của tổ hợp, ví dụ "100 ml / Đỏ"; rỗng với biến thể mặc định. */
  label: string
}

export interface AttributeFormValue {
  attributeId: string
  name: string
  dataType: AttributeDataType
  isRequired: boolean
  unit: string | null
  valueIds: string[]
  text: string
  number: string
  bool: boolean | null
}

export interface SeoFormValue {
  metaTitle: string
  metaDescription: string
  keywords: string
  ogImageMediaId: string | null
  canonicalUrl: string
  noIndex: boolean
}

export interface ProductFormValues {
  name: string
  slug: string
  primaryCategoryId: string
  categoryIds: string[]
  brandId: string
  status: ProductStatus
  isFeatured: boolean
  isBestSeller: boolean
  isNew: boolean
  shortDescription: string
  description: string
  videoUrl: string
  images: ImageFormValue[]
  attributes: AttributeFormValue[]
  baseSku: string
  variants: VariantFormValue[]
  seo: SeoFormValue
}

/** Nhãn thụt lề theo cấp để thấy cây danh mục trong ô chọn (danh sách backend đã sắp theo cây). */
export function categoryOptionLabel(c: { name: string; depth: number; isActive: boolean }): string {
  return `${'   '.repeat(Math.max(0, c.depth))}${c.depth > 0 ? '└ ' : ''}${c.name}${c.isActive ? '' : ' (ẩn)'}`
}

/* ---------- Thuộc tính mô tả ---------- */

/** Thuộc tính mô tả = đang bật và không phải thuộc tính tạo biến thể (backend từ chối nhập trực tiếp loại sau). */
export function descriptiveDefs(defs: readonly AttributeDef[]): AttributeDef[] {
  return defs.filter((d) => d.isActive && !d.isVariantOption)
}

export function optionDefs(defs: readonly AttributeDef[]): AttributeDef[] {
  return defs.filter((d) => d.isActive && d.isVariantOption)
}

export function hasAttributeValue(a: Pick<AttributeFormValue, 'dataType' | 'valueIds' | 'text' | 'number' | 'bool'>): boolean {
  switch (a.dataType) {
    case 'Text': return a.text.trim() !== ''
    case 'Number': return numberOrNull(a.number) !== null
    case 'Boolean': return a.bool !== null
    case 'MultiSelect': return a.valueIds.length > 0
    default: return a.valueIds.length === 1
  }
}

export function emptyAttributeEntry(def: AttributeDef): AttributeFormValue {
  return {
    attributeId: def.id, name: def.name, dataType: def.dataType, isRequired: def.isRequired, unit: def.unit,
    valueIds: [], text: '', number: '',
    // Thuộc tính đúng/sai bắt buộc: mặc định "không" để ô tick luôn là một câu trả lời hợp lệ.
    bool: def.dataType === 'Boolean' && def.isRequired ? false : null,
  }
}

function entryFromSaved(def: AttributeDef, saved: Dto<'ProductAttributeValueInput'> | undefined): AttributeFormValue {
  const base = emptyAttributeEntry(def)
  if (!saved) return base
  return {
    ...base,
    valueIds: saved.valueIds ?? [],
    text: saved.text ?? '',
    number: saved.number === null || saved.number === undefined ? '' : String(saved.number),
    bool: saved.bool ?? base.bool,
  }
}

/**
 * Dựng danh sách ô nhập thuộc tính theo bộ thuộc tính áp dụng. Giá trị người dùng đã nhập (previous)
 * hoặc đã lưu (saved) được giữ lại cho những thuộc tính còn áp dụng.
 */
export function buildAttributeEntries(
  defs: readonly AttributeDef[],
  sources: { previous?: readonly AttributeFormValue[]; saved?: readonly Dto<'ProductAttributeValueInput'>[] },
): AttributeFormValue[] {
  return descriptiveDefs(defs).map((def) => {
    const prev = sources.previous?.find((p) => p.attributeId === def.id)
    if (prev) return { ...prev, name: def.name, dataType: def.dataType, isRequired: def.isRequired, unit: def.unit }
    return entryFromSaved(def, sources.saved?.find((s) => s.attributeId === def.id))
  })
}

export interface CategoryChangePlan {
  /** Mã thuộc tính mô tả đang có giá trị nhưng sẽ không còn áp dụng. */
  lostAttributeIds: string[]
  /** Thuộc tính tuỳ chọn biến thể đang dùng nhưng sẽ không còn áp dụng. */
  lostOptionAttributeIds: string[]
}

/** Đổi danh mục chính làm bộ thuộc tính thay đổi: tính phần dữ liệu sẽ mất để hỏi xác nhận trước. */
export function planCategoryChange(input: {
  attributes: readonly AttributeFormValue[]
  usedOptionAttributeIds: readonly string[]
  newDescriptiveIds: readonly string[]
  newOptionIds: readonly string[]
}): CategoryChangePlan {
  const keepDesc = new Set(input.newDescriptiveIds)
  const keepOpt = new Set(input.newOptionIds)
  return {
    lostAttributeIds: input.attributes.filter((a) => hasAttributeValue(a) && !keepDesc.has(a.attributeId)).map((a) => a.attributeId),
    lostOptionAttributeIds: input.usedOptionAttributeIds.filter((id) => !keepOpt.has(id)),
  }
}

/* ---------- Hình ảnh ---------- */

/** Bảo đảm đúng một ảnh chính: giữ ảnh chính đầu tiên đang có, nếu chưa có thì chọn ảnh đầu. */
export function normalizePrimary<T extends { isPrimary: boolean }>(images: readonly T[]): T[] {
  if (images.length === 0) return []
  const idx = Math.max(0, images.findIndex((i) => i.isPrimary))
  return images.map((i, n) => ({ ...i, isPrimary: n === idx }))
}

export function addImages(images: readonly ImageFormValue[], picked: readonly Pick<ImageFormValue, 'mediaId' | 'url' | 'altText'>[]): ImageFormValue[] {
  const have = new Set(images.map((i) => i.mediaId))
  const added = picked.filter((p, n) => !have.has(p.mediaId) && picked.findIndex((q) => q.mediaId === p.mediaId) === n)
  return normalizePrimary([...images, ...added.map((p) => ({ mediaId: p.mediaId, url: p.url, altText: p.altText, isPrimary: false }))])
}

export function moveImage<T>(images: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return [...images]
  const next = [...images]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function removeImage(images: readonly ImageFormValue[], mediaId: string): ImageFormValue[] {
  return normalizePrimary(images.filter((i) => i.mediaId !== mediaId))
}

export function setPrimaryImage(images: readonly ImageFormValue[], mediaId: string): ImageFormValue[] {
  return images.map((i) => ({ ...i, isPrimary: i.mediaId === mediaId }))
}

/* ---------- Form <-> API ---------- */

export const EMPTY_SEO: SeoFormValue = { metaTitle: '', metaDescription: '', keywords: '', ogImageMediaId: null, canonicalUrl: '', noIndex: false }

export function emptyVariant(): VariantFormValue {
  return {
    variantId: null, sku: '', barcode: '', price: '', salePrice: '', costPrice: '', stockQuantity: '0', isActive: true,
    imageMediaId: null, imageUrl: null, options: [], label: '',
  }
}

export function emptyProductValues(): ProductFormValues {
  return {
    name: '', slug: '', primaryCategoryId: '', categoryIds: [], brandId: '', status: 'Draft', isFeatured: false, isBestSeller: false, isNew: false,
    shortDescription: '', description: '', videoUrl: '', images: [], attributes: [], baseSku: '', variants: [emptyVariant()], seo: { ...EMPTY_SEO },
  }
}

const str = (v: string | null | undefined) => v ?? ''
const numStr = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

/** Nhãn "giá trị / giá trị" của một biến thể, theo thứ tự thuộc tính áp dụng để ổn định giữa các lần tải. */
export function variantLabel(options: readonly OptionPair[], defs: ReadonlyMap<string, AttributeDef>, order: readonly string[]): string {
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i }
  return [...options]
    .sort((a, b) => rank(a.attributeId) - rank(b.attributeId))
    .map((o) => defs.get(o.attributeId)?.values.find((v) => v.id === o.valueId)?.label ?? '?')
    .join(' / ')
}

export function toFormValues(detail: ProductDetail, defs: ReadonlyMap<string, AttributeDef>, applicableOrder: readonly string[]): ProductFormValues {
  const applicableDefs = applicableOrder.flatMap((id) => (defs.has(id) ? [defs.get(id)!] : []))
  return {
    name: detail.name,
    slug: detail.slug,
    primaryCategoryId: str(detail.primaryCategoryId),
    categoryIds: detail.categoryIds.filter((c) => c !== detail.primaryCategoryId),
    brandId: str(detail.brandId),
    status: detail.status,
    isFeatured: detail.isFeatured,
    isBestSeller: detail.isBestSeller,
    isNew: detail.isNew,
    shortDescription: str(detail.shortDescription),
    description: str(detail.description),
    videoUrl: str(detail.videoUrl),
    images: detail.images.map((i) => ({ mediaId: i.mediaId, url: i.media?.url ?? '', altText: i.media?.altText ?? null, isPrimary: i.isPrimary })),
    attributes: buildAttributeEntries(applicableDefs, { saved: detail.attributes }),
    baseSku: '',
    variants: detail.variants.map((v) => ({
      variantId: v.id, sku: v.sku, barcode: str(v.barcode), price: numStr(v.price), salePrice: numStr(v.salePrice), costPrice: numStr(v.costPrice),
      stockQuantity: String(v.stockQuantity), isActive: v.isActive, imageMediaId: v.imageMediaId, imageUrl: v.image?.url ?? null,
      options: v.options.map((o) => ({ attributeId: o.attributeId, valueId: o.valueId })),
      label: variantLabel(v.options, defs, applicableOrder),
    })),
    seo: {
      metaTitle: str(detail.seo.metaTitle), metaDescription: str(detail.seo.metaDescription), keywords: str(detail.seo.keywords),
      ogImageMediaId: detail.seo.ogImageMediaId, canonicalUrl: str(detail.seo.canonicalUrl), noIndex: detail.seo.noIndex,
    },
  }
}

/** Ô nhập thuộc tính → phần tử gửi lên API; null nếu ô còn trống (không gửi để backend không báo thiếu giá trị). */
function attributeToRequest(a: AttributeFormValue): Dto<'ProductAttributeValueInput'> | null {
  if (!hasAttributeValue(a)) return null
  const base = { attributeId: a.attributeId, valueIds: null, text: null, number: null, bool: null }
  switch (a.dataType) {
    case 'Text': return { ...base, text: a.text.trim() }
    case 'Number': return { ...base, number: numberOrNull(a.number) }
    case 'Boolean': return { ...base, bool: a.bool }
    default: return { ...base, valueIds: a.valueIds }
  }
}

/** Danh sách thuộc tính thực sự gửi lên (theo thứ tự gửi) — dùng cả để ánh xạ lỗi `attributes[i]` của backend về đúng ô. */
export function requestAttributes(values: Pick<ProductFormValues, 'attributes'>): { entry: AttributeFormValue; request: Dto<'ProductAttributeValueInput'> }[] {
  return values.attributes.flatMap((entry) => {
    const request = attributeToRequest(entry)
    return request ? [{ entry, request }] : []
  })
}

export function toRequest(values: ProductFormValues, opts: { canViewCost: boolean }): SaveProductRequest {
  const primary = emptyToNull(values.primaryCategoryId)
  const seo = values.seo
  return {
    name: values.name.trim(),
    slug: emptyToNull(values.slug),
    primaryCategoryId: primary,
    categoryIds: values.categoryIds.filter((c) => c !== primary),
    brandId: emptyToNull(values.brandId),
    shortDescription: emptyToNull(values.shortDescription),
    description: emptyToNull(values.description),
    videoUrl: emptyToNull(values.videoUrl),
    status: values.status,
    isFeatured: values.isFeatured,
    isBestSeller: values.isBestSeller,
    isNew: values.isNew,
    seo: {
      metaTitle: emptyToNull(seo.metaTitle), metaDescription: emptyToNull(seo.metaDescription), keywords: emptyToNull(seo.keywords),
      ogImageMediaId: seo.ogImageMediaId, canonicalUrl: emptyToNull(seo.canonicalUrl), noIndex: seo.noIndex,
    },
    images: normalizePrimary(values.images).map((i) => ({ mediaId: i.mediaId, isPrimary: i.isPrimary })),
    attributes: requestAttributes(values).map((a) => a.request),
    variants: values.variants.map((v) => ({
      id: v.variantId,
      sku: v.sku.trim(),
      barcode: emptyToNull(v.barcode),
      price: numberOrNull(v.price) ?? 0,
      salePrice: numberOrNull(v.salePrice),
      // Không có quyền xem giá vốn thì không gửi: backend cũng bỏ qua, nhưng không để giá trị ẩn lọt vào yêu cầu.
      costPrice: opts.canViewCost ? numberOrNull(v.costPrice) : null,
      stockQuantity: Math.trunc(numberOrNull(v.stockQuantity) ?? 0),
      isActive: v.isActive,
      imageMediaId: v.imageMediaId,
      options: v.options.map((o) => ({ attributeId: o.attributeId, valueId: o.valueId })),
    })),
  }
}

/* ---------- Kiểm tra phía client (cùng quy tắc với backend để báo lỗi sớm) ---------- */

const MAX_MONEY = 999_999_999_999
const MAX_STOCK = 10_000_000

const variantSchema = z
  .object({
    variantId: z.string().nullable(),
    sku: z.string().trim().min(1, 'Nhập SKU').max(100, 'Tối đa 100 ký tự').regex(/^[A-Za-z0-9._-]+$/, 'SKU chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới'),
    barcode: z.string().trim().max(100, 'Tối đa 100 ký tự'),
    price: z.string(),
    salePrice: z.string(),
    costPrice: z.string(),
    stockQuantity: z.string(),
    isActive: z.boolean(),
    imageMediaId: z.string().nullable(),
    imageUrl: z.string().nullable(),
    options: z.array(z.object({ attributeId: z.string(), valueId: z.string() })),
    label: z.string(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    const price = numberOrNull(v.price)
    if (v.price.trim() === '' || price === null) issue('price', 'Nhập giá bán')
    else if (price < 0 || price > MAX_MONEY) issue('price', 'Giá không hợp lệ')

    if (v.salePrice.trim() !== '') {
      const sale = numberOrNull(v.salePrice)
      if (sale === null || sale <= 0) issue('salePrice', 'Giá khuyến mãi phải lớn hơn 0')
      else if (price !== null && sale >= price) issue('salePrice', 'Giá khuyến mãi phải nhỏ hơn giá bán')
    }
    if (v.costPrice.trim() !== '') {
      const cost = numberOrNull(v.costPrice)
      if (cost === null || cost < 0 || cost > MAX_MONEY) issue('costPrice', 'Giá vốn không hợp lệ')
    }
    const stock = numberOrNull(v.stockQuantity)
    if (v.stockQuantity.trim() === '' || stock === null || !Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) issue('stockQuantity', 'Tồn kho phải là số nguyên từ 0')
  })

const attributeSchema = z.object({
  attributeId: z.string(),
  name: z.string(),
  dataType: z.custom<AttributeDataType>(),
  isRequired: z.boolean(),
  unit: z.string().nullable(),
  valueIds: z.array(z.string()),
  text: z.string().max(1000, 'Tối đa 1000 ký tự'),
  number: z.string(),
  bool: z.boolean().nullable(),
})

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Nhập tên').max(250, 'Tối đa 250 ký tự'),
    slug: z.string().trim().max(250, 'Tối đa 250 ký tự').regex(/^[a-z0-9]+(-[a-z0-9]+)*$|^$/, 'Chỉ gồm chữ thường, số và dấu gạch ngang'),
    primaryCategoryId: z.string(),
    categoryIds: z.array(z.string()),
    brandId: z.string(),
    status: z.custom<ProductStatus>((v) => typeof v === 'string' && v !== ''),
    isFeatured: z.boolean(),
    isBestSeller: z.boolean(),
    isNew: z.boolean(),
    shortDescription: z.string().max(1000, 'Tối đa 1000 ký tự'),
    description: z.string().max(100_000, 'Quá dài'),
    videoUrl: z.string().trim().max(500, 'Tối đa 500 ký tự').refine((u) => u === '' || /^https?:\/\/\S+$/i.test(u), 'Liên kết video phải bắt đầu bằng http hoặc https'),
    images: z.array(z.object({ mediaId: z.string(), url: z.string(), altText: z.string().nullable(), isPrimary: z.boolean() })),
    attributes: z.array(attributeSchema),
    baseSku: z.string().max(60, 'Tối đa 60 ký tự'),
    variants: z.array(variantSchema).min(1, 'Cần ít nhất một biến thể').max(200, 'Tối đa 200 biến thể'),
    seo: z.object({
      metaTitle: z.string().max(200, 'Tối đa 200 ký tự'),
      metaDescription: z.string().max(500, 'Tối đa 500 ký tự'),
      keywords: z.string().max(500, 'Tối đa 500 ký tự'),
      ogImageMediaId: z.string().nullable(),
      canonicalUrl: z.string().trim().max(500, 'Tối đa 500 ký tự'),
      noIndex: z.boolean(),
    }),
  })
  .superRefine((v, ctx) => {
    // SKU không phân biệt hoa/thường và phải duy nhất trong sản phẩm.
    const seen = new Map<string, number>()
    v.variants.forEach((variant, i) => {
      const key = variant.sku.trim().toLowerCase()
      if (!key) return
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'sku'], message: 'SKU bị lặp trong sản phẩm' })
      else seen.set(key, i)
    })
    v.attributes.forEach((a, i) => {
      if (a.isRequired && !hasAttributeValue(a)) ctx.addIssue({ code: 'custom', path: ['attributes', i], message: `Nhập giá trị cho "${a.name}"` })
    })
    if (v.status === 'Active' && v.variants.length > 0 && !v.variants.some((x) => x.isActive))
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'Sản phẩm đang bán cần ít nhất một biến thể đang bật' })
  })

/* ---------- Điều hướng tab theo lỗi ---------- */

export type EditorTab = 'general' | 'images' | 'attributes' | 'variants' | 'seo'

export function tabForPath(path: string): EditorTab {
  const root = path.split('.')[0].replace(/\[\d+\]$/, '')
  if (root === 'images') return 'images'
  if (root === 'attributes') return 'attributes'
  if (root === 'variants' || root === 'baseSku') return 'variants'
  if (root === 'seo') return 'seo'
  return 'general'
}
