import type { MediaRef } from '@/api/types'

interface Props {
  media: MediaRef | null | undefined
  alt?: string
  className?: string
  /** Ảnh đầu trang (LCP) tải ngay; còn lại tải lười. */
  priority?: boolean
  sizes?: string
  fallbackText?: string
}

/** Ảnh từ thư viện media: luôn có kích thước (tránh nhảy bố cục), alt lấy từ thư viện nếu không truyền. Không có ảnh thì hiện khung trống. */
export function Media({ media, alt, className, priority, sizes, fallbackText }: Props) {
  if (!media) {
    return <div className={`flex items-center justify-center bg-subtle text-xs text-muted ${className ?? ''}`} aria-hidden={!fallbackText}>{fallbackText}</div>
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media.url}
      alt={alt ?? media.altText ?? ''}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      sizes={sizes}
      className={className}
    />
  )
}
