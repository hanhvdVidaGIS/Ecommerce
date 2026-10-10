import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type AuditLog = Dto<'AuditLogDto'>

export interface AuditParams {
  page: number
  pageSize: number
  entityType?: string
  action?: string
}

export function useAuditLogs(params: AuditParams) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => api.getPage<AuditLog>('/api/admin/audit-logs', { ...params }),
    placeholderData: keepPreviousData,
  })
}
