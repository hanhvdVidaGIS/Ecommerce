import type { Metadata } from 'next'
import { ProfileClient } from '@/components/account/ProfileClient'

export const metadata: Metadata = { title: 'Thông tin & mật khẩu' }

export default function ProfilePage() {
  return <ProfileClient />
}
