import { describe, expect, it } from 'vitest'
import { canRefreshOn } from './client-api'

describe('canRefreshOn', () => {
  it('đăng nhập/đăng ký/refresh/quên mật khẩu không tự làm mới phiên khi 401', () => {
    for (const p of ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout', '/api/auth/forgot-password', '/api/auth/reset-password']) expect(canRefreshOn(p)).toBe(false)
  })
  it('/me, đổi mật khẩu và API khác thì có (cookie truy cập chỉ sống 15 phút)', () => {
    for (const p of ['/api/auth/me', '/api/auth/change-password', '/api/account/orders', '/api/cart']) expect(canRefreshOn(p)).toBe(true)
  })
})
