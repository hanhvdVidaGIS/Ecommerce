import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, AUTH_EXPIRED_EVENT } from './client'

type FetchArgs = [string, RequestInit | undefined]
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const ok = (data: unknown, meta: unknown = null) => json({ success: true, data, meta, error: null })

let calls: FetchArgs[]
let handler: (url: string, init?: RequestInit) => Response | Promise<Response>

beforeEach(() => {
  calls = []
  handler = () => ok(null)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push([url, init]); return handler(url, init) }))
  document.cookie = 'ccp_csrf=tok123; path=/'
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'ccp_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

describe('api client', () => {
  it('bóc data khỏi khung phản hồi và dựng query bỏ giá trị rỗng', async () => {
    handler = () => ok([{ id: 1 }])
    const data = await api.get<{ id: number }[]>('/api/x', { q: 'a b', empty: '', nothing: null, n: 0 })
    expect(data).toEqual([{ id: 1 }])
    expect(calls[0][0]).toBe('/api/x?q=a+b&n=0')
  })

  it('getPage trả cả meta phân trang', async () => {
    handler = () => ok([], { page: 2, pageSize: 20, total: 55 })
    const r = await api.getPage('/api/x')
    expect(r.meta).toEqual({ page: 2, pageSize: 20, total: 55 })
  })

  it('yêu cầu ghi gửi X-CSRF-Token từ cookie; yêu cầu đọc thì không', async () => {
    await api.post('/api/x', { a: 1 })
    await api.get('/api/x')
    expect((calls[0][1]!.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok123')
    expect((calls[1][1]!.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
    expect(calls[0][1]!.credentials).toBe('same-origin')
  })

  it('upload không tự đặt Content-Type (để trình duyệt thêm boundary)', async () => {
    const form = new FormData()
    form.append('files', new Blob(['x']), 'a.png')
    await api.upload('/api/media', form)
    expect((calls[0][1]!.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    expect(calls[0][1]!.body).toBe(form)
  })

  it('lỗi từ backend thành ApiError có mã, thông điệp và lỗi theo trường', async () => {
    handler = () => json({ success: false, data: null, error: { code: 'validation_failed', message: 'Dữ liệu không hợp lệ.', details: [{ field: 'variants[0].price', message: 'Giá không hợp lệ.' }, { field: 'name', message: 'Bắt buộc' }] } }, 400)
    const err = (await api.post('/api/x', {}).catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.code).toBe('validation_failed')
    expect(err.fieldErrors()).toEqual({ 'variants[0].price': 'Giá không hợp lệ.', name: 'Bắt buộc' })
  })

  it('phản hồi không phải JSON vẫn thành ApiError có mã trạng thái', async () => {
    handler = () => new Response('<html>oops</html>', { status: 502 })
    const err = (await api.get('/api/x').catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
  })

  it('lỗi mạng thành ApiError network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const err = (await api.get('/api/x').catch((e) => e)) as ApiError
    expect(err.code).toBe('network_error')
  })
})

describe('làm mới phiên khi 401', () => {
  it('làm mới một lần rồi gửi lại yêu cầu và trả kết quả', async () => {
    let first = true
    handler = (url) => {
      if (url === '/api/auth/refresh') return ok({})
      if (first) { first = false; return json({ success: false, error: { code: 'unauthorized', message: 'x' } }, 401) }
      return ok({ done: true })
    }
    expect(await api.get('/api/secure')).toEqual({ done: true })
    expect(calls.map((c) => c[0])).toEqual(['/api/secure', '/api/auth/refresh', '/api/secure'])
  })

  it('nhiều yêu cầu cùng 401 chỉ gọi làm mới một lần (single-flight)', async () => {
    const seen = new Set<string>()
    handler = (url) => {
      if (url === '/api/auth/refresh') return ok({})
      if (!seen.has(url)) { seen.add(url); return json({ success: false, error: { code: 'unauthorized', message: 'x' } }, 401) }
      return ok(url)
    }
    const results = await Promise.all([api.get('/api/a'), api.get('/api/b'), api.get('/api/c')])
    expect(results).toEqual(['/api/a', '/api/b', '/api/c'])
    expect(calls.filter((c) => c[0] === '/api/auth/refresh')).toHaveLength(1)
  })

  it('làm mới thất bại thì phát sự kiện hết phiên và ném lỗi 401', async () => {
    handler = (url) => (url === '/api/auth/refresh' ? json({ success: false }, 401) : json({ success: false, error: { code: 'unauthorized', message: 'Hết phiên' } }, 401))
    const listener = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, listener)
    const err = (await api.get('/api/secure').catch((e) => e)) as ApiError
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener)
    expect(err.status).toBe(401)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('không thử làm mới cho chính các điểm cuối /api/auth/* (tránh vòng lặp)', async () => {
    handler = () => json({ success: false, error: { code: 'invalid_credentials', message: 'Sai mật khẩu' } }, 401)
    await api.post('/api/auth/login', {}).catch(() => undefined)
    expect(calls.map((c) => c[0])).toEqual(['/api/auth/login'])
  })
})
