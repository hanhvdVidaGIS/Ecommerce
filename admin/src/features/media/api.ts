import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Dto } from '@/api/types'

export type MediaItem = Dto<'MediaDto'>
export type UploadResult = Dto<'UploadResult'>

export interface MediaParams {
  page: number
  pageSize: number
  q?: string
  kind?: string
  folder?: string
  sort?: string
}

export function useMediaList(params: MediaParams, enabled = true) {
  return useQuery({
    queryKey: ['media', params],
    queryFn: () => api.getPage<MediaItem>('/api/admin/media', { ...params }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useMediaFolders(enabled = true) {
  return useQuery({ queryKey: ['media-folders'], queryFn: () => api.get<string[]>('/api/admin/media/folders'), enabled })
}

export function useUploadMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ files, folder }: { files: File[]; folder?: string }) => {
      const form = new FormData()
      for (const f of files) form.append('files', f)
      if (folder) form.append('folder', folder)
      return api.upload<UploadResult>('/api/admin/media', form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] })
      qc.invalidateQueries({ queryKey: ['media-folders'] })
    },
  })
}

export function useUpdateMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, altText, folder }: { id: string; altText: string | null; folder: string | null }) =>
      api.put<MediaItem>(`/api/admin/media/${id}`, { altText, folder }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media'] })
      qc.invalidateQueries({ queryKey: ['media-folders'] })
    },
  })
}

export function useDeleteMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/media/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  })
}

/** Phần mở rộng tệp được backend chấp nhận (khớp MediaService); backend vẫn kiểm tra lại nội dung thật của tệp. */
export const ACCEPTED_UPLOAD = '.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm'
