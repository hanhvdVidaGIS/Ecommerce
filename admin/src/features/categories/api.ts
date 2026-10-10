import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'
import type { CategoryItem, ReorderItem } from './tree'

export type { CategoryItem, ReorderItem }
export type CategoryDetail = Dto<'CategoryDetailDto'>
export type SaveCategoryRequest = Dto<'SaveCategoryRequest'>

export const categoriesKey = ['categories'] as const

/** Danh sách phẳng đã sắp theo cây; giao diện tự dựng cây từ parentId. */
export function useCategories() {
  return useQuery({ queryKey: categoriesKey, queryFn: () => api.get<CategoryItem[]>('/api/admin/categories') })
}

export function useCategory(id: string | null) {
  return useQuery({ queryKey: ['category', id], queryFn: () => api.get<CategoryDetail>(`/api/admin/categories/${id}`), enabled: !!id, gcTime: 0 })
}

/** Danh mục đổi → các thuộc tính (số danh mục), cấu hình website và chi tiết danh mục đều có thể đổi theo. */
function useInvalidateCatalog() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: categoriesKey })
    qc.invalidateQueries({ queryKey: ['category'] })
    qc.invalidateQueries({ queryKey: ['attributes'] })
    qc.invalidateQueries({ queryKey: ['attribute'] })
    qc.invalidateQueries({ queryKey: ['site-config'] })
  }
}

export function useSaveCategory() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveCategoryRequest }) =>
      id ? api.put<CategoryDetail>(`/api/admin/categories/${id}`, body) : api.post<CategoryDetail>('/api/admin/categories', body),
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/admin/categories/${id}`), onSuccess: invalidate })
}

/**
 * Sắp xếp/đổi cha hàng loạt. Cập nhật lạc quan để kéo-thả mượt; nếu backend từ chối thì khôi phục đúng bản cũ
 * (rồi tải lại để chắc chắn khớp với máy chủ).
 */
export function useReorderCategories() {
  const qc = useQueryClient()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ items }: { items: ReorderItem[]; next: CategoryItem[] }) => api.post('/api/admin/categories/reorder', items),
    onMutate: async ({ next }) => {
      await qc.cancelQueries({ queryKey: categoriesKey })
      const previous = qc.getQueryData<CategoryItem[]>(categoriesKey)
      qc.setQueryData(categoriesKey, next)
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(categoriesKey, ctx.previous)
    },
    onSettled: invalidate,
  })
}
