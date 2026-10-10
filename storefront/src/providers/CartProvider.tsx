'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Cart } from '@/api/types'
import { api } from '@/lib/client-api'
import { errorMessage } from '@/lib/errors'
import { useToast } from './ToastProvider'

const PROVINCE_KEY = 'ccp_province'

interface CartState {
  cart: Cart | null
  loading: boolean
  /** Tỉnh/thành đang chọn để tính phí vận chuyển ước tính (nhớ trong trình duyệt). */
  provinceCode: string | null
  setProvinceCode: (code: string | null) => void
  reload: () => Promise<void>
  add: (variantId: string, quantity: number) => Promise<boolean>
  setQuantity: (itemId: string, quantity: number) => Promise<void>
  remove: (itemId: string) => Promise<void>
  applyCoupon: (code: string) => Promise<string | null>
  removeCoupon: () => Promise<void>
  /** Dùng sau khi đặt hàng thành công: giỏ đã được máy chủ làm trống. */
  clearLocal: () => void
}

const Ctx = createContext<CartState | null>(null)

function readProvince(): string | null {
  try { return localStorage.getItem(PROVINCE_KEY) } catch { return null }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [cart, setCart] = useState<Cart | null>(null)
  const [loading, setLoading] = useState(true)
  const [provinceCode, setProvince] = useState<string | null>(null)
  // Chống phản hồi đến sai thứ tự: chỉ phản hồi của yêu cầu mới nhất được ghi vào state (vd. tải giỏ lần đầu với tỉnh null
  // trả về muộn hơn lần tải lại sau khi đọc tỉnh đã lưu sẽ làm phí vận chuyển về 0).
  const seq = useRef(0)
  const apply = useCallback((c: Cart) => { seq.current++; setCart(c); setLoading(false) }, [])

  useEffect(() => { setProvince(readProvince()) }, [])

  const setProvinceCode = useCallback((code: string | null) => {
    setProvince(code)
    try { code ? localStorage.setItem(PROVINCE_KEY, code) : localStorage.removeItem(PROVINCE_KEY) } catch { /* trình duyệt chặn lưu trữ: chỉ mất ghi nhớ */ }
  }, [])

  const load = useCallback(async (province: string | null) => {
    const id = ++seq.current
    try {
      const c = await api.get<Cart>('/api/cart', { provinceCode: province })
      if (id === seq.current) setCart(c)
    } catch (e) {
      console.error(e)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void load(provinceCode) }, [load, provinceCode])

  const value = useMemo<CartState>(() => ({
    cart, loading, provinceCode, setProvinceCode,
    reload: () => load(provinceCode),
    async add(variantId, quantity) {
      try {
        apply(await api.post<Cart>('/api/cart/items', { variantId, quantity }, { provinceCode }))
        toast.show('Đã thêm vào giỏ hàng.', 'success')
        return true
      } catch (e) {
        toast.show(errorMessage(e), 'error')
        return false
      }
    },
    async setQuantity(itemId, quantity) {
      try {
        apply(await api.put<Cart>(`/api/cart/items/${itemId}`, { quantity }, { provinceCode }))
      } catch (e) {
        toast.show(errorMessage(e), 'error')
        await load(provinceCode) // đồng bộ lại số lượng thật sau khi bị từ chối
      }
    },
    async remove(itemId) {
      try {
        apply(await api.delete<Cart>(`/api/cart/items/${itemId}`, { provinceCode }))
      } catch (e) {
        toast.show(errorMessage(e), 'error')
      }
    },
    async applyCoupon(code) {
      try {
        apply(await api.post<Cart>('/api/cart/coupon', { code }, { provinceCode }))
        return null
      } catch (e) {
        return errorMessage(e)
      }
    },
    async removeCoupon() {
      try {
        apply(await api.delete<Cart>('/api/cart/coupon', { provinceCode }))
      } catch (e) {
        toast.show(errorMessage(e), 'error')
      }
    },
    clearLocal: () => setCart((c) => (c ? { ...c, items: [], itemCount: 0, subtotal: 0, discount: 0, total: 0, shippingFee: 0, couponCode: null, hasIssues: false } : c)),
  }), [cart, loading, provinceCode, setProvinceCode, load, apply, toast])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart(): CartState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCart phải nằm trong CartProvider')
  return v
}
