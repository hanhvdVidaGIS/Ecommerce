import { toFormPath } from '@/lib/forms'
import { requestAttributes, type ProductFormValues } from './model'

export interface MappedError {
  /** Đường dẫn của react-hook-form, ví dụ `variants.0.price` hoặc `variants.root`. */
  path: string
  message: string
}

export interface MappedErrors {
  placed: MappedError[]
  /** Thông báo không gắn được vào ô nào (hiện bằng toast). */
  unplaced: string[]
}

/** Phần tối thiểu của ApiError cần cho việc ánh xạ (tách ra để kiểm thử không phụ thuộc lớp ApiError). */
export interface ErrorLike {
  code: string
  message: string
  details: { field: string; message: string }[]
}

type Snapshot = Pick<ProductFormValues, 'attributes' | 'variants'>

const SECTION_ROOTS = new Set(['images', 'attributes', 'variants'])

/**
 * Ánh xạ lỗi 400/409 của backend về đường dẫn trường của form.
 * - `variants[0].price` → `variants.0.price`.
 * - `attributes[i]` là chỉ số trong danh sách THỰC GỬI (đã bỏ ô trống) nên đổi về chỉ số ô trên form.
 * - Lỗi chung của backend (`variants`, `attributes`) chỉ có chữ trong thông báo; nếu nhắc SKU hoặc tên thuộc tính trong ngoặc kép
 *   thì gắn vào đúng dòng/ô, còn lại gắn vào lỗi chung của phần (`<phần>.root`).
 * - Lỗi 409 `slug_taken` không có chi tiết nên gắn vào ô slug.
 */
export function mapApiError(error: ErrorLike, snapshot: Snapshot): MappedErrors {
  const placed: MappedError[] = []
  const unplaced: string[] = []

  if (error.code === 'slug_taken') {
    placed.push({ path: 'slug', message: error.message })
    return { placed, unplaced }
  }

  const sent = requestAttributes(snapshot)
  const attrIndexById = (id: string | undefined) => (id === undefined ? -1 : snapshot.attributes.findIndex((a) => a.attributeId === id))

  for (const d of error.details) {
    const field = d.field
    let m: RegExpMatchArray | null

    if ((m = field.match(/^attributes\[(\d+)\]$/))) {
      const idx = attrIndexById(sent[Number(m[1])]?.request.attributeId)
      placed.push({ path: idx >= 0 ? `attributes.${idx}` : 'attributes.root', message: d.message })
    } else if (field === 'attributes') {
      const name = d.message.match(/"([^"]+)"/)?.[1]
      const idx = name ? snapshot.attributes.findIndex((a) => a.name === name) : -1
      placed.push({ path: idx >= 0 ? `attributes.${idx}` : 'attributes.root', message: d.message })
    } else if (field === 'variants') {
      const sku = d.message.match(/SKU "([^"]+)"/)?.[1]?.toLowerCase()
      const idx = sku ? snapshot.variants.findIndex((v) => v.sku.trim().toLowerCase() === sku) : -1
      placed.push({ path: idx >= 0 ? `variants.${idx}.sku` : 'variants.root', message: d.message })
    } else if ((m = field.match(/^variants\[(\d+)\](?:\.options)?$/))) {
      // Trùng tổ hợp hoặc giá trị tuỳ chọn sai: gắn vào nhãn của dòng
      placed.push({ path: `variants.${m[1]}.label`, message: d.message })
    } else if (field === 'variants.imageMediaId') {
      placed.push({ path: 'variants.root', message: d.message })
    } else if (SECTION_ROOTS.has(field)) {
      placed.push({ path: `${field}.root`, message: d.message })
    } else if (KNOWN_PATH.test(toFormPath(field))) {
      placed.push({ path: toFormPath(field), message: d.message })
    } else {
      unplaced.push(d.message)
    }
  }

  if (placed.length === 0 && unplaced.length === 0) unplaced.push(error.message)
  return { placed, unplaced }
}

/** Các trường của form mà backend có thể báo lỗi trực tiếp. */
const KNOWN_PATH = /^(name|slug|primaryCategoryId|categoryIds|brandId|shortDescription|description|videoUrl|status|seo\.\w+|variants\.\d+\.(sku|barcode|price|salePrice|costPrice|stockQuantity|imageMediaId))$/

/**
 * Liệt kê đường dẫn các ô đang có lỗi từ `formState.errors` của react-hook-form (để đánh dấu tab có lỗi).
 * Nút lá là đối tượng có `type` (kiểu lỗi); không đi sâu vào `ref` vì đó là phần tử DOM.
 */
export function collectErrorPaths(errors: unknown, prefix = ''): string[] {
  if (!errors || typeof errors !== 'object') return []
  const obj = errors as Record<string, unknown>
  if (typeof obj.type === 'string' && ('message' in obj || 'ref' in obj)) return prefix ? [prefix] : []
  return Object.entries(obj).flatMap(([k, v]) => (k === 'ref' ? [] : collectErrorPaths(v, prefix ? `${prefix}.${k}` : k)))
}
