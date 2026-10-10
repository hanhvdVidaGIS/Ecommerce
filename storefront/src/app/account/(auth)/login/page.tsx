import type { Metadata } from 'next'
import { LoginForm } from '@/components/account/auth/LoginForm'

export const metadata: Metadata = { title: 'Đăng nhập' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  return <LoginForm next={Array.isArray(next) ? next[0] : next} />
}
