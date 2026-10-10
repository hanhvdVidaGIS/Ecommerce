import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SuccessClient } from '@/components/checkout/SuccessClient'

export const metadata: Metadata = { title: 'Đặt hàng thành công', robots: { index: false, follow: false } }

export default function CheckoutSuccessPage() {
  // useSearchParams ở client cần Suspense để trang vẫn dựng tĩnh được.
  return <Suspense fallback={<div className="container-page py-10"><div className="skeleton h-40" aria-busy="true" /></div>}><SuccessClient /></Suspense>
}
