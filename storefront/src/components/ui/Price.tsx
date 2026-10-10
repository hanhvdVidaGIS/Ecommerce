import { discountPercent, formatMoney } from '@/lib/format'

interface Props {
  min: number
  max?: number
  compareAt?: number | null
  currency: string
  className?: string
}

/** Khoảng giá hoặc giá đơn; hiện giá gốc gạch ngang và % giảm khi đang khuyến mãi. */
export function Price({ min, max, compareAt, currency, className }: Props) {
  const range = max !== undefined && max > min
  const pct = !range ? discountPercent(min, compareAt) : null
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 ${className ?? ''}`}>
      <span className="font-semibold">
        {range ? <><span className="sr-only">Từ </span>{formatMoney(min, currency)} – {formatMoney(max, currency)}</> : formatMoney(min, currency)}
      </span>
      {pct !== null && compareAt ? (
        <>
          <del className="text-sm text-muted"><span className="sr-only">Giá gốc </span>{formatMoney(compareAt, currency)}</del>
          <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-contrast">-{pct}%</span>
        </>
      ) : null}
    </span>
  )
}
