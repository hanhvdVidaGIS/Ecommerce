import type { Metadata } from 'next'
import { CheckoutClient } from '@/components/checkout/CheckoutClient'

export const metadata: Metadata = { title: 'Thanh toán', robots: { index: false, follow: false } }

export default function CheckoutPage() {
  return <CheckoutClient />
}
