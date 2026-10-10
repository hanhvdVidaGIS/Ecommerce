import type { Dto } from '@/api/types'
import { P, type PermissionCode } from '@/api/catalog.generated'

export type Dashboard = Dto<'DashboardDto'>
export type DashboardPoint = Dto<'DashboardPoint'>
export type DashboardStatusCount = Dto<'DashboardStatusCount'>

/** Các kỳ xem được: khớp tham số `days` của backend. */
export const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]

/* ---------- % thay đổi so với kỳ trước ---------- */
export type Change =
  | { kind: 'none' } // không có cơ sở so sánh (kỳ trước và kỳ này đều 0, hoặc dữ liệu không hợp lệ)
  | { kind: 'new' } // kỳ trước = 0, kỳ này > 0: không chia cho 0, hiện "mới"
  | { kind: 'pct'; value: number; direction: 'up' | 'down' | 'flat' }

/** % thay đổi = (hiện tại − trước) / trước. Kỳ trước ≤ 0 không chia; làm tròn 1 chữ số thập phân. */
export function pctChange(current: number, previous: number): Change {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return { kind: 'none' }
  if (previous <= 0) return current > 0 ? { kind: 'new' } : { kind: 'none' }
  const value = Math.round(((current - previous) / previous) * 1000) / 10
  return { kind: 'pct', value, direction: value > 0 ? 'up' : value < 0 ? 'down' : 'flat' }
}

const pctFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

export function formatChange(c: Change): string {
  if (c.kind === 'none') return '—'
  if (c.kind === 'new') return 'Mới'
  const sign = c.value > 0 ? '+' : ''
  return `${sign}${pctFormat.format(c.value)}%`
}

/** Câu đầy đủ cho trình đọc màn hình. */
export function describeChange(c: Change, days: number): string {
  const ref = `so với ${days} ngày trước đó`
  if (c.kind === 'none') return `Không có dữ liệu ${ref}`
  if (c.kind === 'new') return `Mới phát sinh, ${days} ngày trước đó chưa có`
  if (c.direction === 'flat') return `Không đổi ${ref}`
  return `${c.direction === 'up' ? 'Tăng' : 'Giảm'} ${pctFormat.format(Math.abs(c.value))}% ${ref}`
}

/* ---------- Thang trục và biểu đồ cột ---------- */
export interface Scale { max: number; step: number; ticks: number[] }

/** Thang trục "đẹp": bước là 1, 2, 5 × 10^n, trục luôn bắt đầu từ 0 và phủ giá trị lớn nhất. */
export function niceScale(maxValue: number, desiredTicks = 4): Scale {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return { max: 1, step: 1, ticks: [0, 1] }
  const raw = maxValue / desiredTicks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const frac = raw / pow
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  const step = nice * pow
  const count = Math.ceil(maxValue / step - 1e-9)
  const ticks = Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6)
  return { max: ticks[ticks.length - 1], step, ticks }
}

export interface Margins { top: number; right: number; bottom: number; left: number }

export interface Bar {
  index: number
  date: string
  revenue: number
  orders: number
  /** Toạ độ cột (SVG). */
  x: number
  y: number
  width: number
  height: number
  /** Vùng bắt con trỏ: cả dải của ngày đó. */
  bandX: number
  bandWidth: number
  /** Tâm dải, dùng đặt tooltip. */
  cx: number
}

export interface ChartModel {
  bars: Bar[]
  ticks: { value: number; y: number }[]
  scale: Scale
  plot: { left: number; top: number; width: number; height: number }
  total: number
}

const MAX_BAR_WIDTH = 40

/** Dựng toạ độ cột doanh thu theo ngày trong khung `width × height` (px). Thuần tuý, không phụ thuộc DOM. */
export function buildChart(series: readonly DashboardPoint[], width: number, height: number, margins: Margins): ChartModel {
  const plotW = Math.max(0, width - margins.left - margins.right)
  const plotH = Math.max(0, height - margins.top - margins.bottom)
  const n = series.length
  const max = series.reduce((m, p) => Math.max(m, p.revenue), 0)
  const scale = niceScale(max)
  const band = n > 0 ? plotW / n : 0
  const barW = Math.min(MAX_BAR_WIDTH, Math.max(1, band * 0.7))
  const bars = series.map((p, i): Bar => {
    const h = max > 0 ? (Math.max(0, p.revenue) / scale.max) * plotH : 0
    const bandX = margins.left + band * i
    const cx = bandX + band / 2
    return { index: i, date: p.date, revenue: p.revenue, orders: p.orders, x: cx - barW / 2, y: margins.top + plotH - h, width: barW, height: h, bandX, bandWidth: band, cx }
  })
  const ticks = scale.ticks.map((value) => ({ value, y: margins.top + plotH - (value / scale.max) * plotH }))
  return { bars, ticks, scale, plot: { left: margins.left, top: margins.top, width: plotW, height: plotH }, total: series.reduce((s, p) => s + p.revenue, 0) }
}

/** Số cột bỏ qua giữa hai nhãn trục X để nhãn không đè nhau (mỗi nhãn cần ít nhất `minGap` px). */
export function labelStep(count: number, plotWidth: number, minGap = 52): number {
  if (count <= 0 || plotWidth <= 0) return 1
  return Math.max(1, Math.ceil(minGap / (plotWidth / count)))
}

/** Chỉ số ngày dưới con trỏ (hoặc null nếu ngoài vùng vẽ). */
export function indexAt(x: number, plot: ChartModel['plot'], count: number): number | null {
  if (count <= 0 || plot.width <= 0) return null
  const rel = x - plot.left
  if (rel < 0 || rel > plot.width) return null
  return Math.min(count - 1, Math.floor((rel / plot.width) * count))
}

/** Số rút gọn cho nhãn trục (33 Tr, 500 N); không kèm đơn vị tiền, đơn vị ghi ở tiêu đề biểu đồ. */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/* ---------- Ngày (chuỗi yyyy-MM-dd theo múi giờ cửa hàng: không đi qua Date địa phương) ---------- */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 2026-10-04 → 04/10 */
export function shortDate(date: string): string {
  const m = DATE_RE.exec(date)
  return m ? `${m[3]}/${m[2]}` : date
}

/** 2026-10-04 → 04/10/2026 */
export function fullDate(date: string): string {
  const m = DATE_RE.exec(date)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : date
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

/** 2026-10-04 → "Chủ nhật, 04/10/2026" (tên thứ tự khai báo để không phụ thuộc dữ liệu ngôn ngữ của trình duyệt/Node). */
export function longDate(date: string): string {
  const m = DATE_RE.exec(date)
  if (!m) return date
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return `${WEEKDAYS[d.getUTCDay()]}, ${fullDate(date)}`
}

/* ---------- Cơ cấu trạng thái đơn ---------- */
/**
 * Màu từng trạng thái (class Tailwind). Mỗi trạng thái một màu riêng để thanh xếp chồng phân biệt được các đoạn liền kề;
 * danh sách bên cạnh luôn có nhãn + số nên màu không phải kênh duy nhất.
 */
export const STATUS_BAR_CLASS: Record<string, string> = {
  Pending: 'bg-amber-500',
  Confirmed: 'bg-sky-500',
  Processing: 'bg-indigo-500',
  Shipping: 'bg-violet-500',
  Completed: 'bg-green-600',
  Cancelled: 'bg-red-500',
  Refunded: 'bg-gray-400',
}

export function statusBarClass(status: string): string {
  return STATUS_BAR_CLASS[status] ?? 'bg-gray-400'
}

export interface StatusShare { status: string; count: number; percent: number }

/** Tỷ trọng từng trạng thái (%, 1 chữ số thập phân). Tổng 0 thì trả rỗng; trạng thái 0 đơn bị bỏ. */
export function statusShares(items: readonly DashboardStatusCount[]): StatusShare[] {
  const total = items.reduce((s, i) => s + Math.max(0, i.count), 0)
  if (total === 0) return []
  return items.filter((i) => i.count > 0).map((i) => ({ status: i.status, count: i.count, percent: Math.round((i.count / total) * 1000) / 10 }))
}

/* ---------- Khối "Cần xử lý" ---------- */

export interface AlertItem {
  key: 'pendingOrders' | 'awaitingTransfer' | 'pendingReviews' | 'lowStock'
  label: string
  count: number
  /** Đường dẫn tới màn hình đã lọc; null = không có trang đích riêng (cuộn tới bảng tồn kho). */
  to: string | null
}

/** Dựng danh sách cảnh báo; chỉ giữ mục người dùng có quyền xem màn hình đích. `productLabel` lấy từ cấu hình website. */
export function buildAlerts(alerts: Dashboard['alerts'], can: (p: PermissionCode) => boolean, productLabel: string): AlertItem[] {
  const items: (AlertItem & { show: boolean })[] = [
    { key: 'pendingOrders', label: 'Đơn chờ xác nhận', count: alerts.pendingOrders, to: '/orders?status=Pending', show: can(P.OrderView) },
    { key: 'awaitingTransfer', label: 'Đơn chuyển khoản chưa thanh toán', count: alerts.awaitingTransfer, to: '/orders?paymentStatus=Unpaid&paymentMethod=BankTransfer', show: can(P.OrderView) },
    { key: 'pendingReviews', label: 'Đánh giá chờ duyệt', count: alerts.pendingReviews, to: '/reviews?status=Pending', show: can(P.ReviewModerate) },
    { key: 'lowStock', label: `${productLabel} sắp hết hàng`, count: alerts.lowStockCount, to: null, show: can(P.ProductView) },
  ]
  return items.filter((i) => i.show).map(({ show: _show, ...rest }) => rest)
}
