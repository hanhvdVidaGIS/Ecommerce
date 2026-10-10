import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type RoleListItem = Dto<'RoleListItemDto'>
export type RoleDetail = Dto<'RoleDetailDto'>
export type CreateRoleRequest = Dto<'CreateRoleRequest'>
export type UpdateRoleRequest = Dto<'UpdateRoleRequest'>
export type Permission = Dto<'PermissionDto'>

/** Danh sách vai trò: nguồn duy nhất cho bộ lọc/hộp chọn vai trò ở màn hình Người dùng. */
export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleListItem[]>('/api/admin/roles') })
}

export function useRole(id: string | null) {
  return useQuery({ queryKey: ['roles', id], queryFn: () => api.get<RoleDetail>(`/api/admin/roles/${id}`), enabled: !!id })
}

/** Danh mục quyền (nhóm, mô tả, superAdminOnly) do backend cung cấp; chỉ gọi được khi có Permission.Manage. */
export function usePermissionCatalog(enabled: boolean) {
  return useQuery({ queryKey: ['permissions'], queryFn: () => api.get<Permission[]>('/api/admin/permissions'), enabled, staleTime: Infinity })
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateRoleRequest) => api.post<RoleDetail>('/api/admin/roles', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRoleRequest }) => api.put<RoleDetail>(`/api/admin/roles/${id}`, body),
    onSuccess: (data, v) => {
      qc.setQueryData(['roles', v.id], data)
      qc.invalidateQueries({ queryKey: ['roles'], exact: true })
      qc.invalidateQueries({ queryKey: ['audit-logs'] })
    },
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/roles/${id}`),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: ['roles', id] })
      qc.invalidateQueries({ queryKey: ['roles'], exact: true })
    },
  })
}
