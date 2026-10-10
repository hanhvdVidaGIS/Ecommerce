import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type PageListItem = Dto<'PageListItemDto'>
export type PageDetail = Dto<'PageDto'>
export type SavePageRequest = Dto<'SavePageRequest'>

/** PageDto chỉ có mã ảnh OG; lấy thêm ảnh để hiện bản xem trước khi mở lại trang. */
export function useMediaRef(id: string | null | undefined) {
  return useQuery({
    queryKey: ['media', 'item', id],
    queryFn: () => api.get<Dto<'MediaDto'>>(`/api/admin/media/${id}`),
    enabled: !!id,
    select: (m) => ({ url: m.url, altText: m.altText ?? null }),
  })
}

export interface PageParams {
  page: number
  pageSize: number
  q?: string
  status?: string
  sort?: string
}

export function usePages(params: PageParams) {
  return useQuery({
    queryKey: ['pages', 'list', params],
    queryFn: () => api.getPage<PageListItem>('/api/admin/pages', { ...params }),
    placeholderData: keepPreviousData,
  })
}

export function usePage(id: string | undefined) {
  return useQuery({
    queryKey: ['pages', 'detail', id],
    queryFn: () => api.get<PageDetail>(`/api/admin/pages/${id}`),
    enabled: !!id,
    staleTime: 0,
  })
}

// Trang công khai và menu (trang bị ẩn khỏi menu khi chưa xuất bản) phụ thuộc site-config.
function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['pages'] })
    qc.invalidateQueries({ queryKey: ['site-config'] })
  }
}

export function useSavePage() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SavePageRequest }) =>
      id ? api.put<PageDetail>(`/api/admin/pages/${id}`, body) : api.post<PageDetail>('/api/admin/pages', body),
    onSuccess: invalidate,
  })
}

export function useDeletePage() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/admin/pages/${id}`), onSuccess: invalidate })
}
