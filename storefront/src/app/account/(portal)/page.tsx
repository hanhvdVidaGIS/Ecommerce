import type { Metadata } from 'next'
import { OverviewClient } from '@/components/account/OverviewClient'

export const metadata: Metadata = { title: 'Tài khoản của tôi' }

export default function AccountPage() {
  return <OverviewClient />
}
