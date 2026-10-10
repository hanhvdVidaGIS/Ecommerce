import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatMoney, formatNumber } from '@/lib/format'
import { buildChart, formatCompact, indexAt, labelStep, longDate, shortDate, type DashboardPoint } from './model'

const HEIGHT = 240
const MARGINS = { top: 12, right: 8, bottom: 28, left: 44 }

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.round(el.clientWidth) || 640)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/**
 * Biểu đồ cột doanh thu theo ngày, vẽ bằng SVG (không thêm thư viện).
 * Tương tác: rê chuột / chạm / phím ← → để xem tooltip; bảng số liệu tương đương có ở phần "Xem dạng bảng" bên cạnh.
 */
export function RevenueChart({ series, currency }: { series: readonly DashboardPoint[]; currency: string }) {
  const [wrapRef, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)
  const descId = useId()
  const chart = useMemo(() => buildChart(series, width, HEIGHT, MARGINS), [series, width])
  const step = labelStep(series.length, chart.plot.width)
  const bar = active !== null ? chart.bars[active] : null

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setActive(indexAt(e.clientX - rect.left, chart.plot, series.length))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = series.length
    if (n === 0) return
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive((a) => (a === null ? 0 : Math.min(n - 1, a + 1))) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((a) => (a === null ? n - 1 : Math.max(0, a - 1))) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(n - 1) }
    else if (e.key === 'Escape') setActive(null)
  }

  const first = series[0]
  const last = series[series.length - 1]
  const summary = first && last
    ? `Biểu đồ cột doanh thu theo ngày từ ${shortDate(first.date)} đến ${shortDate(last.date)}, tổng ${formatMoney(chart.total, currency)}. Dùng phím mũi tên trái phải để xem từng ngày.`
    : 'Biểu đồ doanh thu theo ngày.'

  // Tooltip bám theo cột nhưng không tràn khỏi khung.
  const tipW = 168
  const tipLeft = bar ? Math.min(Math.max(bar.cx - tipW / 2, 0), Math.max(0, width - tipW)) : 0

  return (
    <div ref={wrapRef} className="relative min-w-0 overflow-hidden" onKeyDown={onKey}>
      <p id={descId} className="sr-only">{summary}</p>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-describedby={descId}
        aria-label="Doanh thu theo ngày"
        tabIndex={0}
        style={{ width: '100%' }}
        className="block touch-pan-y select-none rounded outline-offset-[-2px]"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null) }}
        onBlur={() => setActive(null)}
      >
        {chart.ticks.map((t) => (
          <g key={t.value}>
            <line x1={chart.plot.left} x2={chart.plot.left + chart.plot.width} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={1} />
            <text x={chart.plot.left - 6} y={t.y} textAnchor="end" dominantBaseline="middle" className="fill-muted" fontSize={11}>{formatCompact(t.value)}</text>
          </g>
        ))}
        {chart.bars.map((b) => (
          <g key={b.date}>
            {active === b.index && <rect x={b.bandX} y={chart.plot.top} width={b.bandWidth} height={chart.plot.height} className="fill-surface-2" />}
            <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={Math.min(2, b.width / 2)} className="fill-accent" opacity={active === null || active === b.index ? 1 : 0.55} />
            {b.index % step === 0 && (
              <text x={b.cx} y={HEIGHT - 8} textAnchor="middle" className="fill-muted" fontSize={11}>{shortDate(b.date)}</text>
            )}
          </g>
        ))}
      </svg>
      {bar && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: tipLeft, width: tipW }}
        >
          <p className="font-medium">{longDate(bar.date)}</p>
          <p className="mt-1 text-sm font-semibold">{formatMoney(bar.revenue, currency)}</p>
          <p className="text-muted">{formatNumber(bar.orders)} đơn</p>
        </div>
      )}
    </div>
  )
}

/** Bảng số liệu tương đương biểu đồ (cho trình đọc màn hình và để đối chiếu số chính xác). */
export function RevenueTable({ series, currency }: { series: readonly DashboardPoint[]; currency: string }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Doanh thu và số đơn theo ngày</caption>
        <thead>
          <tr className="sticky top-0 border-b border-border bg-surface-2 text-left text-xs text-muted">
            <th scope="col" className="px-4 py-2 font-medium">Ngày</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Số đơn</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Doanh thu</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.date} className="border-b border-border last:border-0">
              <th scope="row" className="px-4 py-2 text-left font-normal">{longDate(p.date)}</th>
              <td className="px-4 py-2 text-right">{formatNumber(p.orders)}</td>
              <td className="px-4 py-2 text-right">{formatMoney(p.revenue, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
