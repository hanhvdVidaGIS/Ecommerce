'use client'
import { createContext, useContext, type ReactNode } from 'react'
import { formatMoney } from '@/lib/format'

/** Phần cấu hình website cần ở phía trình duyệt: nhãn nghiệp vụ và tiền tệ (không đưa toàn bộ cấu hình xuống client). */
export interface SiteInfo {
  siteName: string
  currency: string
  timezone: string
  productLabel: string
  categoryLabel: string
  brandLabel: string
  paymentMethods: string[]
  bank: { bank?: string; accountNumber?: string; accountName?: string }
}

const Ctx = createContext<SiteInfo | null>(null)

export function SiteProvider({ value, children }: { value: SiteInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSite(): SiteInfo {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSite phải nằm trong SiteProvider')
  return v
}

/** Hàm định dạng tiền theo tiền tệ của cửa hàng. */
export function useMoney(): (value: number | null | undefined) => string {
  const { currency } = useSite()
  return (v) => formatMoney(v, currency)
}
