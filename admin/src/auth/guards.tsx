import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { PermissionCode } from '@/api/catalog.generated'
import { Spinner } from '@/components/ui/primitives'
import { useAuth } from './AuthProvider'

export function FullPageSpinner() {
  return <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>
}

/** Chặn truy cập khi chưa đăng nhập; chuyển về /login và nhớ trang đang xem. */
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

/** Chặn theo quyền (giao diện chỉ ẩn/hiện; backend luôn kiểm tra lại). */
export function RequirePermission({ permission, children }: { permission: PermissionCode; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(permission)) return <Navigate to="/forbidden" replace />
  return <>{children}</>
}

export function Can({ permission, children, fallback = null }: { permission: PermissionCode; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useAuth()
  return <>{can(permission) ? children : fallback}</>
}
