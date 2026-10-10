import { describe, expect, it } from 'vitest'
import { fromLocalInput } from '@/lib/format'
import { POST_STATE_BADGE, postSchema, postState, publicPostPath, toFormValues, toPayload, type Post, type PostFormValues } from './model'

const NOW = new Date('2026-10-10T12:00:00Z')

describe('postState', () => {
  it('Draft luôn là nháp, kể cả khi có ngày', () => {
    expect(postState('Draft', null, NOW)).toBe('draft')
    expect(postState('Draft', '2027-01-01T00:00:00Z', NOW)).toBe('draft')
  })
  it('Published không ngày hoặc ngày đã qua là đã đăng', () => {
    expect(postState('Published', null, NOW)).toBe('published')
    expect(postState('Published', '2026-10-09T00:00:00Z', NOW)).toBe('published')
  })
  it('Published ngày ở tương lai là hẹn giờ; đúng bằng hiện tại thì đã đăng', () => {
    expect(postState('Published', '2026-10-10T12:00:01Z', NOW)).toBe('scheduled')
    expect(postState('Published', '2026-10-10T12:00:00Z', NOW)).toBe('published')
  })
  it('ngày không hợp lệ coi như đã đăng (không ẩn bài nhầm)', () => {
    expect(postState('Published', 'không-phải-ngày', NOW)).toBe('published')
  })
  it('nhãn hiển thị', () => {
    expect(POST_STATE_BADGE.draft.label).toBe('Nháp')
    expect(POST_STATE_BADGE.published.label).toBe('Đã đăng')
    expect(POST_STATE_BADGE.scheduled.label).toBe('Hẹn giờ')
  })
})

describe('publicPostPath', () => {
  it('chỉ bài đã đăng mới có đường dẫn công khai', () => {
    expect(publicPostPath('gioi-thieu', 'published')).toBe('/blog/gioi-thieu')
    expect(publicPostPath('gioi-thieu', 'draft')).toBeNull()
    expect(publicPostPath('gioi-thieu', 'scheduled')).toBeNull()
    expect(publicPostPath('', 'published')).toBeNull()
  })
})

const post: Post = {
  id: '1', title: 'Chọn nước hoa mùa hè', slug: 'chon-nuoc-hoa', summary: null, content: '<p>Nội dung</p>', coverMediaId: null, cover: null,
  status: 'Published', publishedAt: '2026-10-09T03:00:00Z',
  seo: { metaTitle: null, metaDescription: null, keywords: null, ogImageMediaId: null, canonicalUrl: null, noIndex: false },
}

describe('toFormValues', () => {
  it('bài mới: mặc định nháp, mọi ô rỗng', () => {
    const v = toFormValues(null)
    expect(v).toMatchObject({ title: '', slug: '', summary: '', content: '', coverMediaId: null, status: 'Draft', publishedAt: '', noIndex: false })
  })
  it('null của API thành chuỗi rỗng để ô nhập có kiểm soát', () => {
    const v = toFormValues(post)
    expect(v.summary).toBe('')
    expect(v.metaTitle).toBe('')
    expect(v.canonicalUrl).toBe('')
    expect(v.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})

describe('toPayload', () => {
  const v: PostFormValues = { ...toFormValues(null), title: '  Bài mới  ' }
  it('ô trống thành null; tiêu đề được cắt khoảng trắng', () => {
    const p = toPayload(v)
    expect(p.title).toBe('Bài mới')
    expect(p.slug).toBeNull()
    expect(p.summary).toBeNull()
    expect(p.content).toBeNull()
    expect(p.publishedAt).toBeNull()
    expect(p.seo).toEqual({ metaTitle: null, metaDescription: null, keywords: null, ogImageMediaId: null, canonicalUrl: null, noIndex: false })
  })
  it('đăng ngay: Published + ngày trống gửi publishedAt null', () => {
    expect(toPayload({ ...v, status: 'Published', publishedAt: '' })).toMatchObject({ status: 'Published', publishedAt: null })
  })
  it('hẹn giờ: giữ ngày, đổi giờ địa phương sang ISO UTC', () => {
    const p = toPayload({ ...v, status: 'Published', publishedAt: '2030-01-05T09:30' })
    expect(p.publishedAt).toBe(fromLocalInput('2030-01-05T09:30'))
    expect(p.publishedAt).toMatch(/Z$/)
  })
  it('khứ hồi: dữ liệu → form → payload giữ nguyên giá trị, ô có nội dung được cắt khoảng trắng', () => {
    const full: Post = { ...post, summary: 'Tóm tắt', coverMediaId: 'cover-1', seo: { metaTitle: 'T', metaDescription: 'D', keywords: 'a, b', ogImageMediaId: 'og-1', canonicalUrl: 'https://x.test/a', noIndex: true } }
    const p = toPayload(toFormValues(full))
    expect(p).toMatchObject({ title: full.title, slug: full.slug, summary: 'Tóm tắt', content: full.content, coverMediaId: 'cover-1', status: 'Published' })
    expect(new Date(p.publishedAt!).getTime()).toBe(new Date(full.publishedAt!).getTime() - (new Date(full.publishedAt!).getTime() % 60_000))
    expect(p.seo).toEqual(full.seo)
    expect(toPayload({ ...toFormValues(full), summary: '   ' }).summary).toBeNull()
  })
})

describe('postSchema', () => {
  const ok = toFormValues(null)
  it('tiêu đề bắt buộc, slug đúng dạng', () => {
    expect(postSchema.safeParse({ ...ok, title: '  ' }).success).toBe(false)
    expect(postSchema.safeParse({ ...ok, title: 'A' }).success).toBe(true)
    expect(postSchema.safeParse({ ...ok, title: 'A', slug: 'Có Dấu' }).success).toBe(false)
    expect(postSchema.safeParse({ ...ok, title: 'A', slug: 'bai-viet-1' }).success).toBe(true)
    expect(postSchema.safeParse({ ...ok, title: 'A', slug: '' }).success).toBe(true)
  })
  it('canonical không an toàn bị từ chối', () => {
    expect(postSchema.safeParse({ ...ok, title: 'A', canonicalUrl: 'javascript:alert(1)' }).success).toBe(false)
    expect(postSchema.safeParse({ ...ok, title: 'A', canonicalUrl: 'https://x.test/a' }).success).toBe(true)
  })
})
