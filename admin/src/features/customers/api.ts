import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type CustomerListItem = Dto<'CustomerListItemDto'>
export type CustomerDetail = Dto<'CustomerDetailDto'>
export type CustomerAddress = Dto<'CustomerAddressDto'>

export interface CustomerParams {
  page: number
  pageSize: number
  q?: string
  active?: boolean
  sort?: string
}

export function useCustomers(params: CustomerParams) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => api.getPage<CustomerListItem>('/api/admin/customers', { ...params }),
    placeholderData: keepPreviousData,
  })
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get<CustomerDetail>(`/api/admin/customers/${id}`),
    enabled: !!id,
  })
}

export function useSetCustomerActive(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (isActive: boolean) => api.put(`/api/admin/customers/${id}/active`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', id] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['audit-logs'] })
    },
  })
}
