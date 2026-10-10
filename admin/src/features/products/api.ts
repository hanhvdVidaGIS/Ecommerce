import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type ProductListItem = Dto<'ProductListItemDto'>
export type ProductDetail = Dto<'ProductDetailDto'>
export type SaveProductRequest = Dto<'SaveProductRequest'>
export type ProductStatus = Dto<'ProductStatus'>
export type CategoryItem = Dto<'CategoryListItemDto'>
export type CategoryDetail = Dto<'CategoryDetailDto'>
export type BrandItem = Dto<'BrandDto'>
export type AttributeDef = Dto<'AttributeDetailDto'>
export type GeneratedVariant = Dto<'GeneratedVariantDto'>
export type GenerateVariantsRequest = Dto<'GenerateVariantsRequest'>
export type UpdateProductFlagsRequest = Dto<'UpdateProductFlagsRequest'>

export interface ProductParams {
  page: number
  pageSize: number
  q?: string
  sort?: string
  categoryId?: string
  brandId?: string
  status?: string
  isFeatured?: boolean
  isBestSeller?: boolean
  isNew?: boolean
}

export function useProducts(params: ProductParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => api.getPage<ProductListItem>('/api/admin/products', { ...params }),
    placeholderData: keepPreviousData,
  })
}

/** Chi tiết luôn lấy mới khi mở trang (staleTime 0) để không sửa trên dữ liệu cũ của người khác. */
export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductDetail>(`/api/admin/products/${id}`),
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
  })
}

/** Danh sách phẳng đã sắp theo cây (Depth, Path) nên thụt lề theo `depth` là đủ. */
export function useCategoryTree() {
  return useQuery({ queryKey: ['categories', 'flat'], queryFn: () => api.get<CategoryItem[]>('/api/admin/categories') })
}

export function useBrandOptions() {
  return useQuery({
    queryKey: ['brands', 'options'],
    queryFn: () => api.getPage<BrandItem>('/api/admin/brands', { page: 1, pageSize: 100, sort: 'name:asc' }).then((r) => r.data),
  })
}

const attributeKey = (id: string) => ['attributes', 'detail', id] as const
const attributeFetch = (id: string) => ({ queryKey: attributeKey(id), queryFn: () => api.get<AttributeDef>(`/api/admin/attributes/${id}`), staleTime: 60_000 })

type DefResult = { data: AttributeDef | undefined; isLoading: boolean; error: Error | null }
// combine ở mức module (tham chiếu ổn định) để React Query tự ghi nhớ kết quả, không tạo Map mới mỗi lần render.
const combineDefs = (results: DefResult[]) => ({
  defs: new Map(results.flatMap((r) => (r.data ? [[r.data.id, r.data] as const] : []))),
  loading: results.some((r) => r.isLoading),
  error: results.find((r) => r.error)?.error ?? undefined,
})

/** Chi tiết (kèm danh sách giá trị) của nhiều thuộc tính; trả về Map theo mã để tra nhanh. */
export function useAttributeDefs(ids: readonly string[]) {
  const unique = useMemo(() => [...new Set(ids)], [ids])
  return useQueries({ queries: unique.map(attributeFetch), combine: combineDefs })
}

const categoryDetailFetch = (id: string) => ({ queryKey: ['categories', 'detail', id], queryFn: () => api.get<CategoryDetail>(`/api/admin/categories/${id}`), staleTime: 60_000 })

/**
 * Mã thuộc tính áp dụng cho một danh mục = thuộc tính gán cho chính nó và mọi danh mục cha (cùng quy tắc của backend).
 * Backend chỉ trả sẵn danh sách này trong chi tiết sản phẩm đã lưu, nên với sản phẩm mới ta duyệt chuỗi cha qua chi tiết danh mục.
 */
export function ancestorChain(categoryId: string | null, categories: readonly Pick<CategoryItem, 'id' | 'parentId'>[]): string[] {
  const byId = new Map(categories.map((c) => [c.id, c.parentId]))
  const chain: string[] = []
  let current: string | null = categoryId
  while (current && byId.has(current) && chain.length < 20) {
    chain.push(current)
    current = byId.get(current) ?? null
  }
  return chain
}

export async function fetchApplicableAttributeIds(qc: QueryClient, categoryId: string | null, categories: readonly CategoryItem[]): Promise<string[]> {
  const chain = ancestorChain(categoryId, categories)
  const details = await Promise.all(chain.map((id) => qc.fetchQuery(categoryDetailFetch(id))))
  return [...new Set(details.flatMap((d) => d.attributes.map((a) => a.id)))]
}

export async function fetchAttributeDef(qc: QueryClient, id: string): Promise<AttributeDef> {
  return qc.fetchQuery(attributeFetch(id))
}

type CatResult = { data: CategoryDetail | undefined; isLoading: boolean; error: Error | null }
const combineApplicable = (results: CatResult[]) => ({
  ids: [...new Set(results.flatMap((r) => r.data?.attributes.map((a) => a.id) ?? []))],
  loading: results.some((r) => r.isLoading),
  error: results.find((r) => r.error)?.error ?? undefined,
})

/** Mã thuộc tính áp dụng cho danh mục; `saved` là giá trị backend đã tính cho sản phẩm đã lưu (dùng lại khi danh mục không đổi). */
export function useApplicableAttributeIds(categoryId: string | null, categories: readonly CategoryItem[], saved?: { categoryId: string | null; ids: readonly string[] }) {
  const chain = useMemo(() => ancestorChain(categoryId, categories), [categoryId, categories])
  const useSaved = !!saved && saved.categoryId === categoryId
  const fetched = useQueries({ queries: chain.map((id) => ({ ...categoryDetailFetch(id), enabled: !useSaved })), combine: combineApplicable })
  const savedIds = useMemo(() => [...(saved?.ids ?? [])], [saved?.ids])
  return useSaved ? { ids: savedIds, loading: false, error: undefined } : fetched
}

export function useSaveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveProductRequest }) =>
      id ? api.put<ProductDetail>(`/api/admin/products/${id}`, body) : api.post<ProductDetail>('/api/admin/products', body),
    onSuccess: (data) => {
      qc.setQueryData(['product', data.id], data)
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['brands'] })
    },
  })
}

export function useUpdateProductFlags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<UpdateProductFlagsRequest> }) =>
      api.put<ProductDetail>(`/api/admin/products/${id}/flags`, { isFeatured: null, isBestSeller: null, isNew: null, status: null, ...body }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', data.id] })
    },
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['brands'] })
    },
  })
}

export function useGenerateVariants() {
  return useMutation({
    mutationFn: (body: GenerateVariantsRequest) => api.post<GeneratedVariant[]>('/api/admin/products/generate-variants', body),
  })
}
