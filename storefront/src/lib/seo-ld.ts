/** Dữ liệu có cấu trúc (schema.org) dựng thuần từ dữ liệu API; nhúng vào trang bằng ld() để thoát "<". */
export interface LdReview { authorName: string; rating: number; title?: string | null; content?: string | null; createdAt: string }
export interface LdRating { average: number; count: number }

/** aggregateRating chỉ có khi có ít nhất một đánh giá đã duyệt (số 0 bị công cụ tìm kiếm từ chối). */
export function aggregateRatingLd(r: LdRating | null | undefined) {
  if (!r || !(r.count > 0)) return undefined
  return {
    '@type': 'AggregateRating',
    ratingValue: Math.min(5, Math.max(1, Math.round(r.average * 10) / 10)),
    reviewCount: r.count, bestRating: 5, worstRating: 1,
  }
}

export function reviewsLd(reviews: LdReview[] | null | undefined, limit = 5) {
  const list = (reviews ?? []).slice(0, limit).map((v) => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: v.authorName },
    datePublished: v.createdAt,
    name: v.title || undefined,
    reviewBody: v.content || undefined,
    reviewRating: { '@type': 'Rating', ratingValue: v.rating, bestRating: 5, worstRating: 1 },
  }))
  return list.length > 0 ? list : undefined
}

export interface LdPost { title: string; slug: string; summary?: string | null; imageUrl?: string | null; publishedAt: string; updatedAt?: string | null }

export function blogPostingLd(p: LdPost, siteUrl: string, publisherName: string) {
  const abs = (u: string) => (u.startsWith('http') ? u : siteUrl + u)
  const url = `${siteUrl}/blog/${encodeURIComponent(p.slug)}`
  return {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: p.title, description: p.summary || undefined,
    image: p.imageUrl ? [abs(p.imageUrl)] : undefined,
    datePublished: p.publishedAt, dateModified: p.updatedAt || p.publishedAt,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url }, url,
    author: { '@type': 'Organization', name: publisherName },
    publisher: { '@type': 'Organization', name: publisherName },
  }
}
