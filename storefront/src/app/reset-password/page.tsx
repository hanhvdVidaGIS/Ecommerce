import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Email đặt lại mật khẩu của backend trỏ tới /reset-password?token=... (AuthService.ForgotPasswordAsync).
 * Trang thật nằm ở /account/reset-password: chuyển tiếp và giữ nguyên token.
 */
export default async function ResetPasswordRedirect({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams
  const t = Array.isArray(token) ? token[0] : token
  redirect(t ? `/account/reset-password?token=${encodeURIComponent(t)}` : '/account/reset-password')
}
