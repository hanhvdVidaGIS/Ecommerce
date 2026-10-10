import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { api, ApiError, AUTH_EXPIRED_EVENT } from '@/api/client'
import type { CurrentUser } from '@/api/types'

interface AuthContextValue {
  user: CurrentUser | null
  loading: boolean
  can: (permission: string) => boolean
  login: (email: string, password: string) => Promise<CurrentUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const ME_KEY = ['me'] as const

/** Lấy người dùng hiện tại; nếu token truy cập hết hạn nhưng còn refresh token thì làm mới phiên rồi hỏi lại. */
async function fetchMe(): Promise<CurrentUser | null> {
  try {
    return await api.get<CurrentUser>('/api/auth/me')
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e
  }
  try {
    await api.post('/api/auth/refresh')
    return await api.get<CurrentUser>('/api/auth/me')
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null
    throw e
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 5 * 60_000, retry: false })

  useEffect(() => {
    const onExpired = () => {
      qc.setQueryData(ME_KEY, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'site-config' })
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [qc])

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.post<CurrentUser>('/api/auth/login', { email, password }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  })

  const login = useCallback((email: string, password: string) => loginMutation.mutateAsync({ email, password }), [loginMutation])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } finally {
      qc.setQueryData(ME_KEY, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'site-config' })
    }
  }, [qc])

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set(data?.permissions ?? [])
    return { user: data ?? null, loading: isLoading, can: (p) => permissions.has(p), login, logout }
  }, [data, isLoading, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải dùng bên trong AuthProvider')
  return ctx
}
