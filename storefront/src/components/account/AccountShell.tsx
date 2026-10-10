'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Heart, LayoutDashboard, LogOut, MapPin, Package, Star, UserRound } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { loginUrl } from '@/lib/account/safe-next'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'

const NAV = [
  { href: '/account', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
  { href: '/account/orders', label: 'Đơn hàng', icon: Package },
  { href: '/account/addresses', label: 'Địa chỉ', icon: MapPin },
  { href: '/account/wishlist', label: 'Yêu thích', icon: Heart },
  { href: '/account/reviews', label: 'Đánh giá', icon: Star },
  { href: '/account/profile', label: 'Thông tin & mật khẩu', icon: UserRound },
] as const

function GateSkeleton() {
  return (
    <div className="container-page py-6 md:py-10" aria-busy="true" aria-label="Đang tải tài khoản">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <Skeleton className="h-11 lg:h-64" />
        <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      </div>
    </div>
  )
}

/**
 * Khung các trang tài khoản (bắt buộc đăng nhập). Đang kiểm tra phiên: khung chờ; chưa đăng nhập: chuyển tới /account/login?next=<trang hiện tại>.
 * Menu bên trên máy tính, tab cuộn ngang trên điện thoại.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const [loggingOut, setLoggingOut] = useState(false)
  const leaving = useRef(false)

  useEffect(() => {
    if (loading || user || leaving.current) return
    // Giữ cả query (ví dụ ?page=2) để quay lại đúng chỗ sau khi đăng nhập.
    router.replace(loginUrl(pathname + window.location.search))
  }, [loading, user, pathname, router])

  // Trên điện thoại, đưa tab đang chọn vào vùng nhìn thấy của thanh tab cuộn ngang.
  const navRef = useRef<HTMLElement>(null)
  const ready = !loading && !!user
  useEffect(() => {
    if (!ready) return
    const nav = navRef.current
    const cur = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && cur && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2
  }, [ready, pathname])

  if (loading || !user) return <GateSkeleton />

  async function onLogout() {
    setLoggingOut(true)
    leaving.current = true
    try {
      await logout()
      toast.show('Đã đăng xuất.', 'success')
      router.replace('/')
    } catch {
      leaving.current = false
      setLoggingOut(false)
      toast.show('Không đăng xuất được. Vui lòng thử lại.', 'error')
    }
  }

  const active = (n: (typeof NAV)[number]) => ('exact' in n && n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + '/'))
  const item = 'flex items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-sm font-medium'

  return (
    <div className="container-page py-6 md:py-10">
      <div className="grid gap-5 lg:grid-cols-[14rem_1fr] lg:gap-10">
        <nav ref={navRef} aria-label="Menu tài khoản" className="relative -mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:flex-col">
            {NAV.map((n) => {
              const on = active(n)
              return (
                <li key={n.href} className="shrink-0">
                  <Link href={n.href} aria-current={on ? 'page' : undefined} className={`${item} ${on ? 'bg-brand text-brand-contrast' : 'hover:bg-subtle'}`}>
                    <n.icon size={18} aria-hidden />{n.label}
                  </Link>
                </li>
              )
            })}
            <li className="shrink-0 lg:mt-2 lg:border-t lg:border-line lg:pt-2">
              <button type="button" onClick={onLogout} disabled={loggingOut} className={`${item} w-full text-left hover:bg-subtle disabled:opacity-50`}>
                <LogOut size={18} aria-hidden />{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
              </button>
            </li>
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
