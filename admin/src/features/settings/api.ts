import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type Setting = Dto<'SettingDto'>
export type BusinessTypeItem = Dto<'BusinessTypeListItemDto'>
export type ApplyPresetResult = Dto<'ApplyPresetResult'>

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get<Setting[]>('/api/admin/settings') })
}

export function useFonts() {
  return useQuery({ queryKey: ['settings', 'fonts'], queryFn: () => api.get<string[]>('/api/admin/settings/fonts'), staleTime: Infinity })
}

/** Lưu các khoá đã đổi. Sau khi lưu, làm mới cả cấu hình công khai để nhãn, màu, logo trong Admin cập nhật ngay. */
export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (values: Record<string, string>) => api.put<Setting[]>('/api/admin/settings', { values }),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data)
      qc.invalidateQueries({ queryKey: ['site-config'] })
    },
  })
}

export function useBusinessTypes() {
  return useQuery({ queryKey: ['business-types'], queryFn: () => api.get<BusinessTypeItem[]>('/api/admin/business-types') })
}

export function useApplyPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, dryRun, applyLabels }: { code: string; dryRun: boolean; applyLabels: boolean }) =>
      api.post<ApplyPresetResult>(`/api/admin/business-types/${code}/apply`, undefined, { dryRun, applyLabels }),
    onSuccess: (_, v) => {
      if (v.dryRun) return
      for (const key of ['settings', 'business-types', 'site-config', 'categories', 'attributes']) qc.invalidateQueries({ queryKey: [key] })
    },
  })
}
