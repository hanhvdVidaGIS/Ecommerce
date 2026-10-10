'use client'
import { useEffect, useState } from 'react'
import type { Dto } from '@/api/types'
import { api } from './client-api'

export type ShippingQuote = Dto<'ShippingQuoteDto'>

/** Báo giá vận chuyển (có ngưỡng miễn phí) theo tỉnh và tạm tính. Lỗi thì trả null: gợi ý miễn phí ship chỉ là phần phụ, không chặn giỏ hàng. */
export function useShippingQuote(provinceCode: string | null, subtotal: number | null): ShippingQuote | null {
  const [quote, setQuote] = useState<ShippingQuote | null>(null)
  useEffect(() => {
    if (subtotal === null) return
    const ctrl = new AbortController()
    api.get<ShippingQuote>('/api/public/shipping/quote', { provinceCode, subtotal }, ctrl.signal).then(setQuote, (e) => { if ((e as Error).name !== 'AbortError') setQuote(null) })
    return () => ctrl.abort()
  }, [provinceCode, subtotal])
  return quote
}
