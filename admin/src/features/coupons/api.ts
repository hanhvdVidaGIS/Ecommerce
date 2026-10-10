import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Coupon, SaveCouponRequest } from './model'

export interface CouponParams {
  page: number
  pageSize: number
  q?: string
  active?: boolean
  sort?: string
}

export function useCoupons(params: CouponParams) {
  return useQuery({
    queryKey: ['coupons', params],
    queryFn: () => api.getPage<Coupon>('/api/admin/coupons', { ...params }),
    placeholderData: keepPreviousData,
  })
}

export function useSaveCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveCouponRequest }) =>
      id ? api.put<Coupon>(`/api/admin/coupons/${id}`, body) : api.post<Coupon>('/api/admin/coupons', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupons'] }),
  })
}

/** Xoá mềm: các đơn đã dùng mã vẫn giữ nguyên thông tin mã. */
export function useDeleteCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/coupons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupons'] }),
  })
}
