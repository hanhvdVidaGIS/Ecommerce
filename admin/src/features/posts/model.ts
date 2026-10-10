import { z } from 'zod'
import type { ComponentProps } from 'react'
import type { Dto } from '@/api/types'
import { isSafeLink, LINK_ERROR } from '@/components/content/links'
import type { Badge } from '@/components/ui/primitives'
import { emptyToNull } from '@/lib/forms'
import { fromLocalInput, toLocalInput } from '@/lib/format'

export type Post = Dto<'PostDto'>
export type PostListItem = Dto<'PostListItemDto'>
export type SavePostRequest = Dto<'SavePostRequest'>
export type PublishStatus = Dto<'PublishStatus'>

/* ---------- Trạng thái hiệu lực ---------- */
export type PostState = 'draft' | 'published' | 'scheduled'

/**
 * Trạng thái hiệu lực của bài: Draft = nháp; Published nhưng ngày đăng ở tương lai = hẹn giờ (chưa hiện ra website);
 * Published còn lại = đã đăng. `now` truyền vào để kiểm thử được.
 */
export function postState(status: string, publishedAt: string | null | undefined, now: Date = new Date()): PostState {
  if (status !== 'Published') return 'draft'
  if (!publishedAt) return 'published'
  const t = new Date(publishedAt).getTime()
  return Number.isFinite(t) && t > now.getTime() ? 'scheduled' : 'published'
}

type Tone = NonNullable<ComponentProps<typeof Badge>['tone']>
export const POST_STATE_BADGE: Record<PostState, { label: string; tone: Tone }> = {
  draft: { label: 'Nháp', tone: 'neutral' },
  published: { label: 'Đã đăng', tone: 'success' },
  scheduled: { label: 'Hẹn giờ', tone: 'info' },
}

/** Chỉ bài đã đăng thật sự (không phải nháp/hẹn giờ) mới có trang công khai để mở. */
export function publicPostPath(slug: string, state: PostState): string | null {
  return state === 'published' && slug ? `/blog/${slug}` : null
}

/* ---------- Form ---------- */
export const META_TITLE_HINT = 60
export const META_DESCRIPTION_HINT = 160

export const postSchema = z.object({
  title: z.string().trim().min(1, 'Nhập tiêu đề').max(200, 'Tối đa 200 ký tự'),
  slug: z.string().trim().max(200, 'Tối đa 200 ký tự').regex(/^[a-z0-9]+(-[a-z0-9]+)*$|^$/, 'Chỉ gồm chữ thường, số và dấu gạch ngang'),
  summary: z.string().max(1000, 'Tối đa 1000 ký tự'),
  content: z.string().max(500_000, 'Nội dung quá dài'),
  coverMediaId: z.string().nullable(),
  status: z.enum(['Draft', 'Published']),
  /** Giá trị của <input type="datetime-local">; rỗng = chưa đặt. */
  publishedAt: z.string(),
  metaTitle: z.string().max(200, 'Tối đa 200 ký tự'),
  metaDescription: z.string().max(500, 'Tối đa 500 ký tự'),
  keywords: z.string().max(500, 'Tối đa 500 ký tự'),
  canonicalUrl: z.string().trim().max(500, 'Tối đa 500 ký tự').refine(isSafeLink, LINK_ERROR),
  noIndex: z.boolean(),
  ogImageMediaId: z.string().nullable(),
})
export type PostFormValues = z.infer<typeof postSchema>

/** DTO → giá trị form: null thành chuỗi rỗng để ô nhập luôn "có kiểm soát". */
export function toFormValues(p: Post | null): PostFormValues {
  return {
    title: p?.title ?? '',
    slug: p?.slug ?? '',
    summary: p?.summary ?? '',
    content: p?.content ?? '',
    coverMediaId: p?.coverMediaId ?? null,
    status: p?.status ?? 'Draft',
    publishedAt: toLocalInput(p?.publishedAt),
    metaTitle: p?.seo.metaTitle ?? '',
    metaDescription: p?.seo.metaDescription ?? '',
    keywords: p?.seo.keywords ?? '',
    canonicalUrl: p?.seo.canonicalUrl ?? '',
    noIndex: p?.seo.noIndex ?? false,
    ogImageMediaId: p?.seo.ogImageMediaId ?? null,
  }
}

/**
 * Giá trị form → yêu cầu gửi API: ô trống thành null. Slug trống = backend tự sinh; đăng (Published) mà
 * để trống ngày = đăng ngay (gửi null); ngày ở tương lai = hẹn giờ.
 */
export function toPayload(v: PostFormValues): SavePostRequest {
  return {
    title: v.title.trim(),
    slug: emptyToNull(v.slug),
    summary: emptyToNull(v.summary),
    content: v.content || null,
    coverMediaId: v.coverMediaId,
    status: v.status,
    publishedAt: fromLocalInput(v.publishedAt),
    seo: {
      metaTitle: emptyToNull(v.metaTitle),
      metaDescription: emptyToNull(v.metaDescription),
      keywords: emptyToNull(v.keywords),
      ogImageMediaId: v.ogImageMediaId,
      canonicalUrl: emptyToNull(v.canonicalUrl),
      noIndex: v.noIndex,
    },
  }
}
