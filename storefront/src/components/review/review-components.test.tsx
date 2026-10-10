import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/errors'
import { SiteProvider, type SiteInfo } from '@/providers/SiteProvider'
import { ToastProvider } from '@/providers/ToastProvider'

const api = vi.hoisted(() => ({ get: vi.fn(), getPage: vi.fn(), post: vi.fn() }))
const auth = vi.hoisted(() => ({ value: { user: null as null | { id: string }, loading: false } }))
vi.mock('@/lib/client-api', () => ({ api }))
vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => auth.value }))
vi.mock('next/navigation', () => ({ usePathname: () => '/products/ambra-fiore' }))

import { ReviewList } from './ReviewList'
import { WriteReview } from './WriteReview'

const site: SiteInfo = { siteName: 'S', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', productLabel: 'Nước hoa', categoryLabel: 'Danh mục', brandLabel: 'Thương hiệu', paymentMethods: [], bank: {} }
const wrap = (ui: ReactNode) => render(<SiteProvider value={site}><ToastProvider>{ui}</ToastProvider></SiteProvider>)
const rv = (id: string, over: object = {}) => ({ id, authorName: `Khách ${id}`, rating: 4, title: null, content: null, createdAt: '2026-01-02T00:00:00Z', ...over })

beforeEach(() => { vi.clearAllMocks(); auth.value = { user: null, loading: false } })
afterEach(cleanup)

describe('ReviewList', () => {
  it('nội dung khách nhập chỉ là văn bản: không dựng thẻ HTML, giữ xuống dòng bằng CSS', () => {
    wrap(<ReviewList slug="a" total={1} initial={[rv('1', { title: '<b>đậm</b>', content: '<img src=x onerror=alert(1)>\ndòng 2' })]} />)
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('b')).toBeNull()
    expect(screen.getByText(/<img src=x/).className).toContain('whitespace-pre-wrap')
    expect(screen.getByRole('img', { name: '4/5 sao' })).toBeTruthy()
  })

  it('"Xem thêm" nạp trang kế, bỏ trùng, rồi ẩn nút khi đủ', async () => {
    api.getPage.mockResolvedValue({ data: [rv('2'), rv('3')], meta: { page: 2, pageSize: 10, total: 3 } })
    wrap(<ReviewList slug="a" total={3} initial={[rv('1'), rv('2')]} />)
    fireEvent.click(screen.getByRole('button', { name: /Xem thêm đánh giá \(1\)/ }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    expect(api.getPage).toHaveBeenCalledWith('/api/public/products/a/reviews', { page: 2, pageSize: 10 })
    expect(screen.queryByRole('button', { name: /Xem thêm/ })).toBeNull()
  })

  it('trang trả về không có gì mới thì dừng (không lặp vô hạn); lỗi thì báo và cho thử lại', async () => {
    api.getPage.mockResolvedValueOnce({ data: [], meta: { page: 2, pageSize: 10, total: 5 } })
    wrap(<ReviewList slug="a" total={5} initial={[rv('1')]} />)
    fireEvent.click(screen.getByRole('button', { name: /Xem thêm/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Xem thêm/ })).toBeNull())
    cleanup()
    api.getPage.mockRejectedValueOnce(new ApiError(500, 'x', 'Máy chủ lỗi'))
    wrap(<ReviewList slug="a" total={5} initial={[rv('1')]} />)
    fireEvent.click(screen.getByRole('button', { name: /Xem thêm/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Máy chủ lỗi')
    expect(screen.getByRole('button', { name: /Xem thêm/ })).toBeTruthy()
  })

  it('chưa có đánh giá: trạng thái trống', () => {
    wrap(<ReviewList slug="a" total={0} initial={[]} />)
    expect(screen.getByText('Chưa có đánh giá nào')).toBeTruthy()
  })
})

describe('WriteReview', () => {
  const ok = { canReview: true, reason: null, existingStatus: null }

  it('chưa đăng nhập: mời đăng nhập với next = trang hiện tại', () => {
    wrap(<WriteReview productId="p1" />)
    expect(screen.getByRole('link', { name: 'Đăng nhập' }).getAttribute('href')).toBe('/account/login?next=%2Fproducts%2Fambra-fiore%23reviews')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('chưa mua: thông báo và không có form', async () => {
    auth.value = { user: { id: 'u1' }, loading: false }
    api.get.mockResolvedValue({ canReview: false, reason: 'not_purchased', existingStatus: null })
    wrap(<WriteReview productId="p1" />)
    expect(await screen.findByText(/Chỉ khách đã nhận nước hoa mới có thể đánh giá/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gửi đánh giá' })).toBeNull()
  })

  it('đã đánh giá: hiện trạng thái chờ duyệt / đã đăng', async () => {
    auth.value = { user: { id: 'u1' }, loading: false }
    api.get.mockResolvedValue({ canReview: false, reason: 'already_reviewed', existingStatus: 'Pending' })
    wrap(<WriteReview productId="p1" />)
    expect(await screen.findByText(/đang chờ duyệt/)).toBeTruthy()
    cleanup()
    api.get.mockResolvedValue({ canReview: false, reason: 'already_reviewed', existingStatus: 'Approved' })
    wrap(<WriteReview productId="p1" />)
    expect(await screen.findByText(/đã được đăng/)).toBeTruthy()
  })

  it('bắt buộc chọn sao; gửi một lần dù bấm nhiều lần; báo cảm ơn', async () => {
    auth.value = { user: { id: 'u1' }, loading: false }
    api.get.mockResolvedValue(ok)
    let resolve!: (v: unknown) => void
    api.post.mockReturnValue(new Promise((r) => { resolve = r }))
    wrap(<WriteReview productId="p1" />)
    const submit = await screen.findByRole('button', { name: 'Gửi đánh giá' })
    fireEvent.click(submit)
    expect((await screen.findAllByRole('alert'))[0].textContent).toContain('chọn số sao')
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('5 sao'))
    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: '  Rất thơm  ' } })
    fireEvent.click(submit); fireEvent.click(submit); fireEvent.click(submit)
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/api/account/reviews', { productId: 'p1', rating: 5, title: null, content: 'Rất thơm' })
    resolve({ id: 'r1' })
    expect((await screen.findAllByText(/Cảm ơn, đánh giá sẽ hiển thị sau khi được duyệt/)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Gửi đánh giá' })).toBeNull()
  })

  it('lỗi 400 theo trường gắn vào ô tương ứng; 409 chuyển sang trạng thái chờ duyệt', async () => {
    auth.value = { user: { id: 'u1' }, loading: false }
    api.get.mockResolvedValue(ok)
    api.post.mockRejectedValueOnce(new ApiError(400, 'validation_failed', 'Dữ liệu không hợp lệ', [{ field: 'Content', message: 'Nội dung quá dài (máy chủ)' }]))
    wrap(<WriteReview productId="p1" />)
    fireEvent.click(await screen.findByLabelText('3 sao'))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }))
    expect(await screen.findByText('Nội dung quá dài (máy chủ)')).toBeTruthy()
    api.post.mockRejectedValueOnce(new ApiError(409, 'already_reviewed', 'Bạn đã đánh giá'))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }))
    expect(await screen.findByText(/đang chờ duyệt/)).toBeTruthy()
  })
})
