/**
 * Bộ lọc danh sách sản phẩm nằm hoàn toàn trên URL (chia sẻ được, nút Back hoạt động, máy chủ dựng sẵn để SEO):
 * ?category=&q=&brand=a,b&priceMin=&priceMax=&attr.<mã>=v1,v2&flag=&sort=&page=
 */
export type SearchParams = Record<string, string | string[] | undefined>

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'bestseller', label: 'Bán chạy' },
  { value: 'price_asc', label: 'Giá tăng dần' },
  { value: 'price_desc', label: 'Giá giảm dần' },
  { value: 'name', label: 'Tên A–Z' },
] as const

export const FLAG_LABELS: Record<string, string> = { sale: 'Đang giảm giá', new: 'Hàng mới', bestseller: 'Bán chạy', featured: 'Nổi bật' }
export const PAGE_SIZE = 24

export interface Filters {
  category?: string
  q?: string
  brands: string[]
  priceMin?: number
  priceMax?: number
  attrs: Record<string, string[]>
  flag?: string
  sort?: string
  page: number
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const list = (v: string | string[] | undefined) => (first(v) ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20)
const num = (v: string | string[] | undefined) => {
  const n = Number(first(v))
  return first(v) !== undefined && first(v) !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
}

export function parseFilters(sp: SearchParams): Filters {
  const attrs: Record<string, string[]> = {}
  for (const key of Object.keys(sp)) {
    if (!key.startsWith('attr.')) continue
    const values = list(sp[key])
    if (values.length > 0) attrs[key.slice(5)] = values
  }
  const page = Math.floor(Number(first(sp.page)))
  return {
    category: first(sp.category) || undefined,
    q: first(sp.q)?.trim().slice(0, 100) || undefined,
    brands: list(sp.brand),
    priceMin: num(sp.priceMin),
    priceMax: num(sp.priceMax),
    attrs,
    flag: first(sp.flag) && first(sp.flag)! in FLAG_LABELS ? first(sp.flag) : undefined,
    sort: SORT_OPTIONS.some((o) => o.value === first(sp.sort)) ? first(sp.sort) : undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

/** Chuỗi query gửi tới API (không gồm page/pageSize nếu không truyền, dùng chung cho danh sách và bộ lọc khả dụng). */
export function toApiQuery(f: Filters, extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams()
  if (f.category) p.set('category', f.category)
  if (f.q) p.set('q', f.q)
  if (f.brands.length) p.set('brand', f.brands.join(','))
  if (f.priceMin !== undefined) p.set('priceMin', String(f.priceMin))
  if (f.priceMax !== undefined) p.set('priceMax', String(f.priceMax))
  for (const [code, values] of Object.entries(f.attrs)) if (values.length) p.set(`attr.${code}`, values.join(','))
  if (f.flag) p.set('flag', f.flag)
  if (f.sort) p.set('sort', f.sort)
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v))
  return p.toString()
}

/** Chuỗi query của URL trang (page chỉ có khi > 1; mọi thay đổi bộ lọc đưa về trang 1). */
export function toPageQuery(f: Filters): string {
  const p = new URLSearchParams(toApiQuery(f))
  if (f.page > 1) p.set('page', String(f.page))
  return p.toString()
}

export function withFilters(base: string, f: Filters): string {
  const qs = toPageQuery(f)
  return qs ? `${base}?${qs}` : base
}

/** Bật/tắt một giá trị trong danh sách; trả về danh sách mới (không đổi bản gốc). */
export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

export function hasActiveFilters(f: Filters): boolean {
  return f.brands.length > 0 || f.priceMin !== undefined || f.priceMax !== undefined || Object.keys(f.attrs).length > 0 || !!f.flag
}

/** Bỏ mọi bộ lọc phụ nhưng giữ danh mục, từ khoá và sắp xếp. */
export function clearFilters(f: Filters): Filters {
  return { ...f, brands: [], priceMin: undefined, priceMax: undefined, attrs: {}, flag: undefined, page: 1 }
}
