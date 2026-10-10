import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// Toàn bộ khu vực tài khoản là riêng tư: không lập chỉ mục, không theo liên kết.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function AccountRootLayout({ children }: { children: ReactNode }) {
  return children
}
