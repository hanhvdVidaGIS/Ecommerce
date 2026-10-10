/**
 * Chống open-redirect: tham số ?next= chỉ được là đường dẫn nội bộ của chính website.
 * Từ chối: không bắt đầu bằng "/", bắt đầu bằng "//", chứa "\" hoặc ký tự điều khiển (trình duyệt coi "/\evil.com" hay "/<tab>/evil.com" như "//evil.com"),
 * và đường dẫn sau khi phân giải mà đổi nguồn gốc. Cũng từ chối quay lại chính các trang đăng nhập/đăng ký (vòng lặp).
 */
const BASE = 'http://internal.invalid'
const AUTH_PAGES = /^\/(?:account\/(?:login|register|forgot-password|reset-password)|login|register|reset-password)(?:\/|$)/

export function safeNext(raw: string | null | undefined, fallback = '/account'): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2000) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback
  try {
    if (new URL(raw, BASE).origin !== BASE) return fallback
  } catch {
    return fallback
  }
  if (AUTH_PAGES.test(raw.split(/[?#]/)[0])) return fallback
  return raw
}

/** Địa chỉ trang đăng nhập kèm đường dẫn cần quay lại (đã mã hoá). */
export function loginUrl(returnTo?: string | null): string {
  const next = safeNext(returnTo, '')
  return next ? `/account/login?next=${encodeURIComponent(next)}` : '/account/login'
}
