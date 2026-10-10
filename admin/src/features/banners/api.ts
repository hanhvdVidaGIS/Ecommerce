import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiResult } from '@/api/client'
import type { Dto } from '@/api/types'
import { type SortItem } from '@/components/content/reorder'

export type Banner = Dto<'BannerDto'>
export type SaveBannerRequest = Dto<'SaveBannerRequest'>

export interface BannerParams {
  placement?: string
  status?: string
}

/** Banner ít nên lấy một trang tối đa (100) và sắp theo thứ tự hiển thị để kéo-thả. */
export function useBanners(params: BannerParams) {
  return useQuery({
    queryKey: ['banners', params],
    queryFn: () => api.getPage<Banner>('/api/admin/banners', { ...params, page: 1, pageSize: 100, sort: 'sortOrder:asc' }),
    placeholderData: keepPreviousData,
  })
}

// Banner công khai nằm trong site-config nên phải làm mới cả cấu hình công khai.
function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['banners'] })
    qc.invalidateQueries({ queryKey: ['site-config'] })
  }
}

export function useSaveBanner() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveBannerRequest }) =>
      id ? api.put<Banner>(`/api/admin/banners/${id}`, body) : api.post<Banner>('/api/admin/banners', body),
    onSuccess: invalidate,
  })
}

export function useDeleteBanner() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/admin/banners/${id}`), onSuccess: invalidate })
}

/** Sắp xếp lại: cập nhật danh sách ngay (lạc quan), lỗi thì tải lại để hiện đúng thứ tự thật. */
export function useReorderBanners() {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (payload: SortItem[]) => api.post('/api/admin/banners/reorder', payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ['banners'] })
      const orders = new Map(payload.map((p) => [p.id, p.sortOrder]))
      qc.setQueriesData<ApiResult<Banner[]>>({ queryKey: ['banners'] }, (old) =>
        old ? { ...old, data: old.data.map((b) => (orders.has(b.id) ? { ...b, sortOrder: orders.get(b.id)! } : b)).sort((a, b) => a.sortOrder - b.sortOrder) } : old,
      )
    },
    onSettled: invalidate,
  })
}
