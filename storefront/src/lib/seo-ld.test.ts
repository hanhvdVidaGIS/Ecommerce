import { describe, expect, it } from 'vitest'
import { breadcrumbLd, ld } from './json-ld'
import { aggregateRatingLd, blogPostingLd, reviewsLd } from './seo-ld'

describe('ld (thoát JSON-LD)', () => {
  it('không để lại "<" nên không thể đóng thẻ script', () => {
    const out = ld({ name: '</script><script>alert(1)</script>' }).__html
    expect(out).not.toContain('<')
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>')
  })
  it('thoát U+2028/2029', () => {
    const ls = String.fromCharCode(0x2028), ps = String.fromCharCode(0x2029)
    const out = ld({ a: `x${ls}y${ps}z` }).__html
    expect(out.includes(ls) || out.includes(ps)).toBe(false)
    expect(JSON.parse(out).a).toBe(`x${ls}y${ps}z`)
  })
})

describe('aggregateRatingLd', () => {
  it('không có khi 0 đánh giá hoặc thiếu dữ liệu', () => {
    expect(aggregateRatingLd({ average: 0, count: 0 })).toBeUndefined()
    expect(aggregateRatingLd(null)).toBeUndefined()
  })
  it('có ratingValue làm tròn và reviewCount', () => {
    expect(aggregateRatingLd({ average: 4.666, count: 3 })).toMatchObject({ '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 3, bestRating: 5, worstRating: 1 })
  })
})

describe('reviewsLd', () => {
  const mk = (i: number) => ({ authorName: `Khách ${i}`, rating: 5, title: null, content: `Nội dung ${i}`, createdAt: '2026-01-01T00:00:00Z' })
  it('tối đa 5 bài, rỗng -> undefined', () => {
    expect(reviewsLd(Array.from({ length: 9 }, (_, i) => mk(i)))).toHaveLength(5)
    expect(reviewsLd([])).toBeUndefined()
    expect(reviewsLd(null)).toBeUndefined()
  })
  it('cấu trúc Review và thoát "<" khi nhúng', () => {
    const [r] = reviewsLd([{ ...mk(1), content: '<b>x</b>' }])!
    expect(r).toMatchObject({ '@type': 'Review', reviewBody: '<b>x</b>', reviewRating: { ratingValue: 5 } })
    expect(ld(r).__html).not.toContain('<')
  })
})

describe('blogPostingLd / breadcrumbLd', () => {
  it('BlogPosting có ảnh tuyệt đối và dateModified mặc định', () => {
    const p = blogPostingLd({ title: 'T', slug: 'bai-viet', imageUrl: '/uploads/a.jpg', publishedAt: '2026-01-01T00:00:00Z' }, 'https://x.test', 'Shop')
    expect(p).toMatchObject({ '@type': 'BlogPosting', headline: 'T', image: ['https://x.test/uploads/a.jpg'], dateModified: '2026-01-01T00:00:00Z', url: 'https://x.test/blog/bai-viet' })
  })
  it('BreadcrumbList đánh số từ 1', () => {
    const b = breadcrumbLd([{ name: 'A', url: 'u1' }, { name: 'B', url: 'u2' }])
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2])
  })
})
