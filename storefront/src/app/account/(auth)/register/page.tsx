import type { Metadata } from 'next'
import { RegisterForm } from '@/components/account/auth/RegisterForm'

export const metadata: Metadata = { title: 'Đăng ký tài khoản' }

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  return <RegisterForm next={Array.isArray(next) ? next[0] : next} />
}
