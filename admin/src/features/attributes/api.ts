import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Attribute, AttributeListItem, AttributeValue, SaveAttributeRequest, SaveAttributeValueRequest } from './rules'

export const attributesKey = ['attributes'] as const

/** Backend trả toàn bộ danh sách (không phân trang), tìm theo `q`. */
export function useAttributes(q: string) {
  return useQuery({
    queryKey: [...attributesKey, q],
    queryFn: () => api.get<AttributeListItem[]>('/api/admin/attributes', { q: q || undefined }),
  })
}

export function useAttribute(id: string | undefined) {
  return useQuery({ queryKey: ['attribute', id], queryFn: () => api.get<Attribute>(`/api/admin/attributes/${id}`), enabled: !!id })
}

function useInvalidateAttributes() {
  const qc = useQueryClient()
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: attributesKey })
    qc.invalidateQueries({ queryKey: id ? ['attribute', id] : ['attribute'] })
    // Trang danh mục hiển thị thuộc tính đã gán; sản phẩm dùng thuộc tính theo danh mục.
    qc.invalidateQueries({ queryKey: ['category'] })
  }
}

export function useSaveAttribute() {
  const invalidate = useInvalidateAttributes()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveAttributeRequest }) =>
      id ? api.put<Attribute>(`/api/admin/attributes/${id}`, body) : api.post<Attribute>('/api/admin/attributes', body),
    onSuccess: (_d, v) => invalidate(v.id),
  })
}

export function useDeleteAttribute() {
  const invalidate = useInvalidateAttributes()
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/admin/attributes/${id}`), onSuccess: () => invalidate() })
}

export function useSetAttributeCategories(id: string) {
  const invalidate = useInvalidateAttributes()
  return useMutation({
    mutationFn: (categoryIds: string[]) => api.put<Attribute>(`/api/admin/attributes/${id}/categories`, { categoryIds }),
    onSuccess: () => invalidate(id),
  })
}

export function useSaveAttributeValue(attributeId: string) {
  const invalidate = useInvalidateAttributes()
  return useMutation({
    mutationFn: ({ valueId, body }: { valueId?: string; body: SaveAttributeValueRequest }) =>
      valueId
        ? api.put<AttributeValue>(`/api/admin/attributes/${attributeId}/values/${valueId}`, body)
        : api.post<AttributeValue>(`/api/admin/attributes/${attributeId}/values`, body),
    onSuccess: () => invalidate(attributeId),
  })
}

export function useDeleteAttributeValue(attributeId: string) {
  const invalidate = useInvalidateAttributes()
  return useMutation({
    mutationFn: (valueId: string) => api.delete(`/api/admin/attributes/${attributeId}/values/${valueId}`),
    onSuccess: () => invalidate(attributeId),
  })
}
