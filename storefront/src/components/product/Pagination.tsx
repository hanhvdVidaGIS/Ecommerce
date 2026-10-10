import Link from 'next/link'
import { withFilters, type Filters } from '@/lib/filters'

/** Danh sách số trang rút gọn: luôn có trang đầu/cuối và lân cận trang hiện tại, chỗ bị bỏ là "…". */
export function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, 2, total - 1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total))
  const pages = [...set].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}

export function Pagination({ page, pageSize, total, filters, basePath }: { page: number; pageSize: number; total: number; filters: Filters; basePath: string }) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  const href = (p: number) => withFilters(basePath, { ...filters, page: p })
  const item = 'flex h-10 min-w-10 items-center justify-center border border-line px-3 text-sm'
  return (
    <nav aria-label="Phân trang" className="mt-10 flex flex-wrap justify-center gap-1">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className={`${item} hover:border-ink`}>‹ Trước</Link> : null}
      {pageWindow(page, pages).map((p, i) => p === '…'
        ? <span key={`gap${i}`} className={`${item} border-transparent`} aria-hidden>…</span>
        : <Link key={p} href={href(p)} aria-current={p === page ? 'page' : undefined} className={`${item} ${p === page ? 'border-ink bg-ink text-white' : 'hover:border-ink'}`}>{p}</Link>)}
      {page < pages ? <Link href={href(page + 1)} rel="next" className={`${item} hover:border-ink`}>Sau ›</Link> : null}
    </nav>
  )
}
