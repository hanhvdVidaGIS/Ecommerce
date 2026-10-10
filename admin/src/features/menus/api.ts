import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'
import type { MenuItemEdit } from './tree'

export type MenuListItem = Dto<'MenuListItemDto'>
export type MenuAdmin = Omit<Dto<'MenuAdminDto'>, 'items'> & { items: MenuItemEdit[] }
export type CategoryOption = Dto<'CategoryListItemDto'>
export type PageOption = Dto<'PageListItemDto'>

export function useMenus() {
  return useQuery({ queryKey: ['menus'], queryFn: () => api.get<MenuListItem[]>('/api/admin/menus') })
}

export function useMenu(id: string | null) {
  return useQuery({
    queryKey: ['menus', id],
    queryFn: () => api.get<MenuAdmin>(`/api/admin/menus/${id}`),
    enabled: !!id,
    // Luôn lấy bản mới khi mở lại để không soạn trên dữ liệu cũ.
    staleTime: 0,
    gcTime: 0,
  })
}

/** Danh mục dạng cây phẳng (backend đã sắp theo thứ tự cây kèm `depth`) để chọn đích liên kết. */
export function useCategoryOptions() {
  return useQuery({ queryKey: ['categories', 'menu-options'], queryFn: () => api.get<CategoryOption[]>('/api/admin/categories') })
}

export function usePageOptions() {
  return useQuery({
    queryKey: ['pages', 'options'],
    queryFn: async () => (await api.getPage<PageOption>('/api/admin/pages', { page: 1, pageSize: 100, sort: 'title:asc' })).data,
  })
}

// Menu công khai nằm trong site-config.
function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['menus'] })
    qc.invalidateQueries({ queryKey: ['site-config'] })
  }
}

export function useCreateMenu() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: Dto<'CreateMenuRequest'>) => api.post<MenuAdmin>('/api/admin/menus', body),
    onSuccess: invalidate,
  })
}

export function useSaveMenu() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, name, items }: { id: string; name: string; items: MenuItemEdit[] }) =>
      api.put<MenuAdmin>(`/api/admin/menus/${id}`, { name, items }),
    onSuccess: invalidate,
  })
}

export function useDeleteMenu() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/admin/menus/${id}`), onSuccess: invalidate })
}
