'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { api } from '@/lib/client-api'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'

/** Nút yêu thích. Khách chưa đăng nhập được đưa tới trang đăng nhập rồi quay lại trang hiện tại. */
export function WishlistButton({ productId, className }: { productId: string; className?: string }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const [on, setOn] = useState(false)

  useEffect(() => {
    if (!user) { setOn(false); return }
    let alive = true
    api.get<string[]>('/api/account/wishlist/ids').then((ids) => alive && setOn(ids.includes(productId))).catch(() => undefined)
    return () => { alive = false }
  }, [user, productId])

  const toggle = useCallback(async () => {
    if (!user) { router.push(`/account/login?next=${encodeURIComponent(pathname)}`); return }
    const next = !on
    setOn(next) // cập nhật ngay, hoàn lại nếu máy chủ từ chối
    try {
      if (next) await api.put(`/api/account/wishlist/${productId}`)
      else await api.delete(`/api/account/wishlist/${productId}`)
      toast.show(next ? 'Đã thêm vào danh sách yêu thích.' : 'Đã bỏ khỏi danh sách yêu thích.', 'success')
    } catch (e) {
      setOn(!next)
      toast.show(errorMessage(e), 'error')
    }
  }, [user, on, productId, router, pathname, toast])

  return (
    <button type="button" onClick={toggle} disabled={loading} aria-pressed={on} aria-label={on ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích'}
      className={`rounded-full bg-white/90 p-2 shadow hover:bg-white ${className ?? ''}`}>
      <Heart size={20} className={on ? 'fill-danger text-danger' : ''} />
    </button>
  )
}
