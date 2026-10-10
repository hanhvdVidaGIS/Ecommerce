import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type AdminUser = Dto<'AdminUserDto'>
export type CreateUserRequest = Dto<'CreateUserRequest'>
export type UpdateUserRequest = Dto<'UpdateUserRequest'>

export type UserScope = 'staff' | 'customer' | 'all'

export interface UserParams {
  scope: UserScope
  page: number
  pageSize: number
  q?: string
  role?: string
  isActive?: boolean
  sort?: string
}

export function useUsers(params: UserParams) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => api.getPage<AdminUser>('/api/admin/users', { ...params }),
    placeholderData: keepPreviousData,
  })
}

/** Đổi người dùng làm đổi số người dùng của vai trò (cột "người dùng" ở màn hình Vai trò) và sinh bản ghi nhật ký. */
function useAfterUserChange() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['users'] })
    qc.invalidateQueries({ queryKey: ['roles'] })
    qc.invalidateQueries({ queryKey: ['audit-logs'] })
  }
}

export function useCreateUser() {
  const done = useAfterUserChange()
  return useMutation({ mutationFn: (body: CreateUserRequest) => api.post<AdminUser>('/api/admin/users', body), onSuccess: done })
}

export function useUpdateUser() {
  const done = useAfterUserChange()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserRequest }) => api.put<AdminUser>(`/api/admin/users/${id}`, body),
    onSuccess: done,
  })
}

export function useResetPassword() {
  const done = useAfterUserChange()
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) => api.post(`/api/admin/users/${id}/reset-password`, { newPassword }),
    onSuccess: done,
  })
}

export function useDeleteUser() {
  const done = useAfterUserChange()
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/admin/users/${id}`), onSuccess: done })
}
