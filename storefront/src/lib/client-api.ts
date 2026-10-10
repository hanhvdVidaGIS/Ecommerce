'use client'
import { ApiError, type ErrorDetail } from './errors'

/**
 * Client API phía trình duyệt. Gọi đường dẫn tương đối /api (Storefront chuyển tiếp tới Backend) nên cookie HttpOnly
 * mang phiên và giỏ hàng. Yêu cầu ghi gửi kèm X-CSRF-Token lấy từ cookie ccp_csrf. Gặp 401 thì làm mới phiên một lần.
 */
export interface PageMeta { page: number; pageSize: number; total: number }
type Query = Record<string, string | number | boolean | null | undefined>

export const AUTH_EXPIRED_EVENT = 'ccp:auth-expired'

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

export function buildUrl(path: string, query?: Query): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Điểm cuối xác thực KHÔNG được tự làm mới phiên khi gặp 401 (tránh vòng lặp / sai nghĩa: 401 ở đăng nhập là sai mật khẩu).
 * /api/auth/me và /api/auth/change-password thì có: cookie truy cập chỉ sống 15 phút nhưng cookie làm mới sống 7 ngày.
 */
const NO_REFRESH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout', '/api/auth/forgot-password', '/api/auth/reset-password']
export function canRefreshOn(path: string): boolean {
  return !NO_REFRESH_PATHS.some((p) => path === p || path.startsWith(p + '?'))
}

let refreshing: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  try {
    const csrf = readCookie('ccp_csrf')
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: csrf ? { 'X-CSRF-Token': csrf } : {} })
    return res.ok
  } catch {
    return false
  }
}

function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => { refreshing = null })
  return refreshing
}

async function send<T>(method: string, path: string, options: { body?: unknown; query?: Query; signal?: AbortSignal } = {}, retried = false): Promise<{ data: T; meta: PageMeta | null }> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  if (method !== 'GET') {
    const csrf = readCookie('ccp_csrf')
    if (csrf) headers['X-CSRF-Token'] = csrf
  }

  let res: Response
  try {
    res = await fetch(buildUrl(path, options.query), { method, headers, body, credentials: 'same-origin', signal: options.signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network_error', 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.')
  }

  // Chỉ thử làm mới khi người dùng đang có phiên (cookie ccp_csrf do đăng nhập cấp); khách không có phiên thì 401 là bình thường.
  if (res.status === 401 && !retried && canRefreshOn(path) && readCookie('ccp_csrf')) {
    if (await refreshSession()) return send<T>(method, path, options, true)
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }

  let json: { success?: boolean; data?: T; meta?: PageMeta | null; error?: { code: string; message: string; details?: ErrorDetail[] | null } } | null = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(res.status, json?.error?.code ?? 'unknown_error', json?.error?.message ?? `Lỗi ${res.status}`, json?.error?.details ?? [])
  }
  return { data: json.data as T, meta: json.meta ?? null }
}

export const api = {
  get: async <T>(path: string, query?: Query, signal?: AbortSignal) => (await send<T>('GET', path, { query, signal })).data,
  getPage: <T>(path: string, query?: Query, signal?: AbortSignal) => send<T[]>('GET', path, { query, signal }),
  post: async <T = unknown>(path: string, body?: unknown, query?: Query) => (await send<T>('POST', path, { body: body ?? {}, query })).data,
  put: async <T = unknown>(path: string, body?: unknown, query?: Query) => (await send<T>('PUT', path, { body: body ?? {}, query })).data,
  delete: async <T = unknown>(path: string, query?: Query) => (await send<T>('DELETE', path, { query })).data,
}
