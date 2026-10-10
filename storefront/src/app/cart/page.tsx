import type { Metadata } from 'next'
import { CartPageClient } from '@/components/cart/CartPageClient'

export const metadata: Metadata = { title: 'Giỏ hàng', robots: { index: false, follow: false } }

export default function CartPage() {
  return <CartPageClient />
}
