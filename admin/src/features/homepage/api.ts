import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'
import type { SortItem } from '@/components/content/reorder'

export type HomepageSection = Dto<'HomepageSectionAdminDto'>
export type SaveHomepageSectionRequest = Dto<'SaveHomepageSectionRequest'>

const KEY = ['homepage-sections']

export function useHomepageSections() {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<HomepageSection[]>('/api/admin/homepage-sections') })
}

// Section công khai nằm trong site-config nên làm mới cả cấu hình công khai.
function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: KEY })
    qc.invalidateQueries({ queryKey: ['site-config'] })
  }
}

export function useSaveSection() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveHomepageSectionRequest }) =>
      id ? api.put<HomepageSection>(`/api/admin/homepage-sections/${id}`, body) : api.post<HomepageSection>('/api/admin/homepage-sections', body),
    onSuccess: invalidate,
  })
}

export function useDeleteSection() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/admin/homepage-sections/${id}`), onSuccess: invalidate })
}

/** Sắp xếp lại: cập nhật danh sách ngay (lạc quan), lỗi thì tải lại để hiện đúng thứ tự thật. */
export function useReorderSections() {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (payload: SortItem[]) => api.post('/api/admin/homepage-sections/reorder', payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: KEY })
      const orders = new Map(payload.map((p) => [p.id, p.sortOrder]))
      qc.setQueryData<HomepageSection[]>(KEY, (old) =>
        old?.map((s) => (orders.has(s.id) ? { ...s, sortOrder: orders.get(s.id)! } : s)).sort((a, b) => a.sortOrder - b.sortOrder),
      )
    },
    onSettled: invalidate,
  })
}

/** Bật/tắt nhanh: PUT lại toàn bộ dữ liệu hiện có, chỉ đổi isActive. */
export function toggleBody(s: HomepageSection, isActive: boolean): SaveHomepageSectionRequest {
  return { type: s.type, title: s.title, subtitle: s.subtitle, config: s.config, isActive, sortOrder: s.sortOrder }
}
