/**
 * Client API dùng chung. Quy ước của backend: mọi phản hồi có dạng
 * { success, data, meta, error:{code,message,details[]} }.
 * - Cookie HttpOnly mang phiên; yêu cầu ghi gửi kèm tiêu đề X-CSRF-Token lấy từ cookie ccp_csrf.
 * - Gặp 401 thì thử làm mới phiên một lần (single-flight) rồi gửi lại.
 */
export interface FieldError {
  field: string
  message: string
}

export interface PageMeta {
  page: number
  pageSize: number
  total: number
}

export class ApiError extends Error {
  status: number
  code: string
  details: FieldError[]

  constructor(status: number, code: string, message: string, details: FieldError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** Lỗi theo từng trường, dạng { tenTruong: 'thông báo' } để gắn vào form. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const d of this.details) if (!(d.field in out)) out[d.field] = d.message
    return out
  }
}

export interface ApiResult<T> {
  data: T
  meta: PageMeta | null
}

type Query = Record<string, string | number | boolean | null | undefined>

export const AUTH_EXPIRED_EVENT = 'ccp:auth-expired'

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

function buildUrl(path: string, query?: Query): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
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

/** Các yêu cầu cùng gặp 401 dùng chung một lần làm mới; xong là xoá ngay để lần 401 sau làm mới lại. */
function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => { refreshing = null })
  return refreshing
}

async function send<T>(method: string, path: string, options: { body?: unknown; query?: Query; signal?: AbortSignal; form?: FormData } = {}, retried = false): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (options.form) {
    body = options.form // trình duyệt tự đặt Content-Type kèm boundary
  } else if (options.body !== undefined) {
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

  if (res.status === 401 && !retried && !path.startsWith('/api/auth/')) {
    if (await refreshSession()) return send<T>(method, path, options, true)
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }

  let json: { success?: boolean; data?: T; meta?: PageMeta | null; error?: { code: string; message: string; details?: FieldError[] | null } } | null = null
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
  /** Trả về dữ liệu; dùng getPage khi cần thông tin phân trang. */
  get: async <T>(path: string, query?: Query, signal?: AbortSignal) => (await send<T>('GET', path, { query, signal })).data,
  getPage: <T>(path: string, query?: Query, signal?: AbortSignal) => send<T[]>('GET', path, { query, signal }),
  post: async <T = unknown>(path: string, body?: unknown, query?: Query) => (await send<T>('POST', path, { body: body ?? {}, query })).data,
  put: async <T = unknown>(path: string, body?: unknown) => (await send<T>('PUT', path, { body: body ?? {} })).data,
  delete: async <T = unknown>(path: string) => (await send<T>('DELETE', path)).data,
  upload: async <T>(path: string, form: FormData) => (await send<T>('POST', path, { form })).data,
}
