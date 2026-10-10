import { Star } from 'lucide-react'
import { starFillPercent, starsLabel } from '@/lib/reviews'

function Row({ size }: { size: number }) {
  return (
    <span className="flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} fill="currentColor" strokeWidth={0} className="shrink-0" />)}
    </span>
  )
}

/** Hàng 5 sao hiển thị điểm (có phần lẻ). Đọc màn hình nghe "4/5 sao"; các hình sao đều ẩn khỏi cây truy cập. */
export function Stars({ value, size = 16, className = '' }: { value: number; size?: number; className?: string }) {
  return (
    <span role="img" aria-label={starsLabel(value)} className={`relative inline-flex shrink-0 align-middle ${className}`}>
      <span className="text-line"><Row size={size} /></span>
      <span className="absolute inset-y-0 left-0 overflow-hidden text-accent" style={{ width: `${starFillPercent(value)}%` }}><Row size={size} /></span>
    </span>
  )
}
