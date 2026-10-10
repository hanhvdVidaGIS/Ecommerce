import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type Brand = Dto<'BrandDto'>
export type SaveBrandRequest = Dto<'SaveBrandRequest'>

export interface BrandParams {
  page: number
  pageSize: number
  q?: string
  sort?: string
}

export function useBrands(params: BrandParams) {
  return useQuery({
    queryKey: ['brands', params],
    queryFn: () => api.getPage<Brand>('/api/admin/brands', { ...params }),
    placeholderData: keepPreviousData,
  })
}

export function useSaveBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveBrandRequest }) =>
      id ? api.put<Brand>(`/api/admin/brands/${id}`, body) : api.post<Brand>('/api/admin/brands', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brands'] })
      qc.invalidateQueries({ queryKey: ['site-config'] })
    },
  })
}

export function useDeleteBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/brands/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brands'] }),
  })
}
