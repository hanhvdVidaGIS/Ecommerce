import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Province, SaveShippingRateRequest, ShippingQuote, ShippingRate } from './model'

/** Toàn bộ mức phí, không phân trang (backend trả mảng đầy đủ). */
export function useShippingRates() {
  return useQuery({ queryKey: ['shipping-rates'], queryFn: () => api.get<ShippingRate[]>('/api/admin/shipping-rates') })
}

/** Danh sách tỉnh/thành công khai; hiếm khi đổi nên giữ lâu. */
export function useProvinces() {
  return useQuery({ queryKey: ['provinces'], queryFn: () => api.get<Province[]>('/api/public/address/provinces'), staleTime: Infinity })
}

export function useSaveShippingRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveShippingRateRequest }) =>
      id ? api.put<ShippingRate>(`/api/admin/shipping-rates/${id}`, body) : api.post<ShippingRate>('/api/admin/shipping-rates', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-rates'] }),
  })
}

export function useDeleteShippingRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/shipping-rates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-rates'] }),
  })
}

/** Tính thử phí đúng như khách thấy khi thanh toán (API công khai). */
export function useQuoteShipping() {
  return useMutation({
    mutationFn: ({ provinceCode, subtotal }: { provinceCode: string; subtotal: number }) =>
      api.get<ShippingQuote>('/api/public/shipping/quote', { provinceCode: provinceCode || undefined, subtotal }),
  })
}
