import 'server-only'
import { API_URL } from './env'
import { ApiError } from './errors'

export interface PageMeta { page: number; pageSize: number; total: number }
export interface ServerFetchOptions {
  /** Số giây giữ đệm. 0 = luôn lấy mới. */
  revalidate?: number
  tags?: string[]
}

async function request(path: string, opts: ServerFetchOptions): Promise<{ data: unknown; meta: PageMeta | null }> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Accept: 'application/json' },
    // Mọi dữ liệu công khai mang thẻ site-config: backend gọi /revalidate khi quản trị đổi nội dung nên trang cập nhật ngay, không chờ hết hạn đệm.
    next: { revalidate: opts.revalidate ?? 60, tags: ['site-config', ...(opts.tags ?? [])] },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success) {
    const e = body?.error
    throw new ApiError(res.status, e?.code ?? 'http_' + res.status, e?.message ?? 'Không tải được dữ liệu.', e?.details ?? [])
  }
  return { data: body.data, meta: body.meta ?? null }
}

/** GET dữ liệu công khai. Lỗi 404 trả về null để trang gọi notFound(). */
export async function apiGet<T>(path: string, opts: ServerFetchOptions = {}): Promise<T | null> {
  try {
    return (await request(path, opts)).data as T
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export async function apiGetPage<T>(path: string, opts: ServerFetchOptions = {}): Promise<{ items: T[]; meta: PageMeta }> {
  const { data, meta } = await request(path, opts)
  return { items: data as T[], meta: meta ?? { page: 1, pageSize: (data as T[]).length, total: (data as T[]).length } }
}
