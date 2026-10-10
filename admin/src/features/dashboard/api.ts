import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dashboard, Period } from './model'

export function useDashboard(days: Period, enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => api.get<Dashboard>('/api/admin/dashboard', { days }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
