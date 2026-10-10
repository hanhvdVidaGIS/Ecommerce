import type { ReactNode } from 'react'

/** Các trang đăng nhập/đăng ký/quên và đặt lại mật khẩu: thẻ hẹp ở giữa, không có menu tài khoản. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container-page py-8 md:py-14">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  )
}
