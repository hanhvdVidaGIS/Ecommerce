import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Post, PostListItem, SavePostRequest } from './model'

export interface PostParams {
  page: number
  pageSize: number
  q?: string
  status?: string
  sort?: string
}

export function usePosts(params: PostParams) {
  return useQuery({
    queryKey: ['posts', 'list', params],
    queryFn: () => api.getPage<PostListItem>('/api/admin/posts', { ...params }),
    placeholderData: keepPreviousData,
  })
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: ['posts', 'detail', id],
    queryFn: () => api.get<Post>(`/api/admin/posts/${id}`),
    enabled: !!id,
    staleTime: 0,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['posts'] })
}

export function useSavePost() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SavePostRequest }) =>
      id ? api.put<Post>(`/api/admin/posts/${id}`, body) : api.post<Post>('/api/admin/posts', body),
    onSuccess: invalidate,
  })
}

export function useDeletePost() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => api.delete(`/api/admin/posts/${id}`), onSuccess: invalidate })
}
