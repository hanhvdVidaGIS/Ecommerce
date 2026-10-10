import type { Metadata } from 'next'
import { WishlistClient } from '@/components/account/WishlistClient'

export const metadata: Metadata = { title: 'Yêu thích' }

export default function WishlistPage() {
  return <WishlistClient />
}
