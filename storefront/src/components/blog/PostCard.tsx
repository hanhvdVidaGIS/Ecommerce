import Link from 'next/link'
import type { ReactNode } from 'react'
import type { PublicPostCard } from '@/api/types'
import { Media } from '@/components/ui/Media'
import { formatDate } from '@/lib/format'

export function PostGrid({ children }: { children: ReactNode }) {
  return <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
}

/** Thẻ bài viết: cả thẻ là một liên kết; ảnh bìa chỉ trang trí (alt rỗng) vì tiêu đề đã nằm trong liên kết. */
export function PostCard({ post, timezone, priority }: { post: PublicPostCard; timezone?: string; priority?: boolean }) {
  return (
    <li className="min-w-0">
      <Link href={`/blog/${encodeURIComponent(post.slug)}`} className="group block">
        <div className="aspect-[16/9] overflow-hidden bg-subtle">
          <Media media={post.cover} alt="" priority={priority} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        </div>
        <p className="mt-3 text-xs text-muted"><time dateTime={post.publishedAt}>{formatDate(post.publishedAt, timezone)}</time></p>
        <h3 className="mt-1 break-words text-lg font-semibold leading-snug group-hover:text-accent">{post.title}</h3>
        {post.summary ? <p className="mt-2 line-clamp-3 break-words text-sm text-muted">{post.summary}</p> : null}
      </Link>
    </li>
  )
}
