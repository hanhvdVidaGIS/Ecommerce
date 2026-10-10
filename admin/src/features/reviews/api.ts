import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { AdminReview, ReviewParams, ReviewStatus } from './model'

export function useReviews(params: ReviewParams) {
  return useQuery({
    queryKey: ['reviews', params],
    queryFn: () => api.getPage<AdminReview>('/api/admin/reviews', { ...params }),
    placeholderData: keepPreviousData,
  })
}

// Đổi/xoá đánh giá ảnh hưởng số "đánh giá chờ duyệt" ở Tổng quan và điểm đánh giá trên website.
function useAfterChange() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['reviews'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useSetReviewStatus() {
  const done = useAfterChange()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewStatus }) => api.put(`/api/admin/reviews/${id}/status`, { status }),
    onSuccess: done,
  })
}

export function useDeleteReview() {
  const done = useAfterChange()
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/admin/reviews/${id}`), onSuccess: done })
}
