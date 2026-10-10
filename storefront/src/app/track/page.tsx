import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TrackClient } from '@/components/order/TrackClient'

export const metadata: Metadata = { title: 'Tra cứu đơn hàng', robots: { index: false, follow: true } }

export default function TrackPage() {
  return <Suspense fallback={<div className="container-page py-10"><div className="skeleton h-40" aria-busy="true" /></div>}><TrackClient /></Suspense>
}
