'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CurrentUser } from '@/api/types'
import { api, AUTH_EXPIRED_EVENT } from '@/lib/client-api'
import { ApiError } from '@/lib/errors'

interface AuthState {
  user: CurrentUser | null
  /** true cho tới khi biết chắc người dùng đã đăng nhập hay chưa */
  loading: boolean
  login: (email: string, password: string) => Promise<CurrentUser>
  register: (input: { email: string; password: string; fullName: string; phoneNumber?: string | null }) => Promise<CurrentUser>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children, onSessionChange }: { children: ReactNode; onSessionChange?: () => void }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<CurrentUser>('/api/auth/me'))
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) console.error(e)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const expired = () => setUser(null)
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
  }, [])

  const value = useMemo<AuthState>(() => ({
    user, loading, refresh,
    async login(email, password) {
      const u = await api.post<CurrentUser>('/api/auth/login', { email, password })
      setUser(u)
      onSessionChange?.() // giỏ khách đã được gộp vào giỏ tài khoản ở máy chủ: tải lại giỏ
      return u
    },
    async register(input) {
      const u = await api.post<CurrentUser>('/api/auth/register', input)
      setUser(u)
      onSessionChange?.()
      return u
    },
    async logout() {
      await api.post('/api/auth/logout')
      setUser(null)
      onSessionChange?.()
    },
  }), [user, loading, refresh, onSessionChange])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth phải nằm trong AuthProvider')
  return v
}
