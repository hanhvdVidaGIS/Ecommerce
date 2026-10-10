'use client'
import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/Skeleton'
import { safeNext } from '@/lib/account/safe-next'
import { useAuth } from '@/providers/AuthProvider'

/** Khung chung của các trang xác thực: đã đăng nhập thì chuyển hướng (về `next` an toàn), đang kiểm tra phiên thì hiện khung chờ. */
export function AuthShell({ title, subtitle, next, children }: { title: string; subtitle?: ReactNode; next?: string; children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const target = safeNext(next)

  useEffect(() => {
    if (!loading && user) router.replace(target)
  }, [loading, user, router, target])

  if (loading || user) {
    return (
      <div aria-busy="true" aria-label="Đang kiểm tra phiên đăng nhập" className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    )
  }
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  )
}
