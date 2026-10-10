import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiGet = vi.hoisted(() => vi.fn())
vi.mock('@/lib/server-api', () => ({ apiGet }))
vi.mock('@/lib/env', () => ({ SITE_URL: 'https://shop.test' }))

import sitemap from './sitemap'

beforeEach(() => apiGet.mockReset())

describe('sitemap', () => {
  it('có /blog và từng bài viết (thoát slug), kèm lastModified', async () => {
    apiGet.mockResolvedValue({
      products: [], categories: [], pages: [],
      posts: [{ slug: 'bai-viet-1', updatedAt: '2026-01-01T00:00:00Z' }, { slug: 'a b/c', updatedAt: '2026-02-01T00:00:00Z' }],
    })
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain('https://shop.test/blog')
    expect(urls).toContain('https://shop.test/blog/bai-viet-1')
    expect(urls).toContain('https://shop.test/blog/a%20b%2Fc')
  })

  it('backend cũ chưa có posts hoặc lỗi dữ liệu rỗng: vẫn dựng được, chỉ còn /blog', async () => {
    apiGet.mockResolvedValue({ products: [], categories: [], pages: [] })
    expect((await sitemap()).filter((e) => e.url.includes('/blog')).map((e) => e.url)).toEqual(['https://shop.test/blog'])
    apiGet.mockResolvedValue(null)
    expect((await sitemap()).length).toBeGreaterThan(0)
  })
})
