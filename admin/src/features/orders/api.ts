import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type OrderListItem = Dto<'AdminOrderListItemDto'>
export type Order = Dto<'OrderDto'>
export type OrderStatus = Dto<'OrderStatus'>
export type PaymentStatus = Dto<'PaymentStatus'>
export type PaymentMethod = Dto<'PaymentMethod'>
export type OrderHistoryEntry = Dto<'OrderHistoryDto'>

export interface OrderParams {
  page: number
  pageSize: number
  q?: string
  status?: string
  paymentStatus?: string
  paymentMethod?: string
  from?: string
  to?: string
  sort?: string
}

export function useOrders(params: OrderParams) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => api.getPage<OrderListItem>('/api/admin/orders', { ...params }),
    placeholderData: keepPreviousData,
  })
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<Order>(`/api/admin/orders/${id}`),
    enabled: !!id,
  })
}

/** Đổi đơn kéo theo số liệu khách (đơn, chi tiêu), nhật ký và danh sách đơn; đơn đang xem lấy luôn từ phản hồi. */
function useAfterOrderChange(id: string) {
  const qc = useQueryClient()
  return {
    apply: (order: Order) => {
      qc.setQueryData(['order', id], order)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer'] })
      qc.invalidateQueries({ queryKey: ['audit-logs'] })
    },
    /** Sau lỗi xung đột: đơn đã đổi ở nơi khác nên tải lại để các nút khớp trạng thái thật. */
    reload: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  }
}

export function useChangeOrderStatus(id: string) {
  const { apply } = useAfterOrderChange(id)
  return useMutation({
    mutationFn: (body: { status: OrderStatus; note: string | null }) => api.post<Order>(`/api/admin/orders/${id}/status`, body),
    onSuccess: apply,
  })
}

export function useMarkOrderPaid(id: string) {
  const { apply } = useAfterOrderChange(id)
  return useMutation({ mutationFn: () => api.post<Order>(`/api/admin/orders/${id}/mark-paid`), onSuccess: apply })
}

export function useAddOrderNote(id: string) {
  const { apply } = useAfterOrderChange(id)
  return useMutation({ mutationFn: (note: string) => api.post<Order>(`/api/admin/orders/${id}/notes`, { note }), onSuccess: apply })
}

export function useOrderReload(id: string) {
  return useAfterOrderChange(id).reload
}
