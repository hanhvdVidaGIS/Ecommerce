import { describe, expect, it } from 'vitest'
import { P, type PermissionCode } from '@/api/catalog.generated'
import {
  buildAlerts, buildChart, describeChange, formatChange, fullDate, indexAt, labelStep, longDate, niceScale, pctChange, shortDate, statusBarClass, statusShares,
  type Dashboard,
} from './model'

describe('pctChange', () => {
  it('tăng và giảm, làm tròn 1 chữ số', () => {
    expect(pctChange(150, 100)).toEqual({ kind: 'pct', value: 50, direction: 'up' })
    expect(pctChange(75, 100)).toEqual({ kind: 'pct', value: -25, direction: 'down' })
    expect(pctChange(1, 3)).toEqual({ kind: 'pct', value: -66.7, direction: 'down' })
  })
  it('không đổi là flat', () => {
    expect(pctChange(100, 100)).toEqual({ kind: 'pct', value: 0, direction: 'flat' })
  })
  it('kỳ trước = 0: không chia 0, kỳ này > 0 là "mới", cả hai 0 là "—"', () => {
    expect(pctChange(500, 0)).toEqual({ kind: 'new' })
    expect(pctChange(0, 0)).toEqual({ kind: 'none' })
  })
  it('kỳ này = 0 trong khi kỳ trước > 0 là giảm 100%', () => {
    expect(pctChange(0, 200)).toEqual({ kind: 'pct', value: -100, direction: 'down' })
  })
  it('giá trị không hữu hạn hoặc kỳ trước âm thì không tính', () => {
    expect(pctChange(Number.NaN, 5)).toEqual({ kind: 'none' })
    expect(pctChange(5, Number.POSITIVE_INFINITY)).toEqual({ kind: 'none' })
    expect(pctChange(5, -1)).toEqual({ kind: 'new' })
  })
  it('định dạng chữ', () => {
    expect(formatChange({ kind: 'none' })).toBe('—')
    expect(formatChange({ kind: 'new' })).toBe('Mới')
    expect(formatChange(pctChange(150, 100))).toBe('+50%')
    expect(formatChange(pctChange(75, 100))).toBe('-25%')
    expect(formatChange(pctChange(112.5, 100))).toBe('+12,5%')
    expect(formatChange(pctChange(100, 100))).toBe('0%')
  })
  it('câu đọc cho trình đọc màn hình nêu rõ hướng', () => {
    expect(describeChange(pctChange(150, 100), 7)).toBe('Tăng 50% so với 7 ngày trước đó')
    expect(describeChange(pctChange(75, 100), 30)).toBe('Giảm 25% so với 30 ngày trước đó')
    expect(describeChange({ kind: 'new' }, 7)).toContain('Mới')
    expect(describeChange({ kind: 'none' }, 7)).toContain('Không có dữ liệu')
  })
})

describe('niceScale', () => {
  it('bước 1-2-5 × 10^n, phủ giá trị lớn nhất, bắt đầu từ 0', () => {
    expect(niceScale(33_069_000)).toEqual({ max: 40_000_000, step: 10_000_000, ticks: [0, 10_000_000, 20_000_000, 30_000_000, 40_000_000] })
    expect(niceScale(8)).toEqual({ max: 8, step: 2, ticks: [0, 2, 4, 6, 8] })
    expect(niceScale(9)).toEqual({ max: 10, step: 5, ticks: [0, 5, 10] })
    expect(niceScale(100)).toEqual({ max: 100, step: 50, ticks: [0, 50, 100] })
  })
  it('đỉnh luôn nằm trong thang', () => {
    for (const v of [1, 7, 99, 101, 1234, 987_654_321]) {
      const s = niceScale(v)
      expect(s.max).toBeGreaterThanOrEqual(v)
      expect(s.ticks[0]).toBe(0)
    }
  })
  it('0, âm, NaN cho thang mặc định 0..1', () => {
    for (const v of [0, -5, Number.NaN]) expect(niceScale(v)).toEqual({ max: 1, step: 1, ticks: [0, 1] })
  })
})

describe('buildChart', () => {
  const m = { top: 10, right: 10, bottom: 20, left: 40 }
  const series = [
    { date: '2026-10-01', revenue: 0, orders: 0 },
    { date: '2026-10-02', revenue: 50, orders: 1 },
    { date: '2026-10-03', revenue: 100, orders: 2 },
  ]
  const c = buildChart(series, 350, 130, m)
  it('vùng vẽ trừ lề', () => {
    expect(c.plot).toEqual({ left: 40, top: 10, width: 300, height: 100 })
  })
  it('chiều cao cột tỷ lệ với thang (thang 0..100 → cột 100 cao đúng bằng vùng vẽ)', () => {
    expect(c.scale.max).toBe(100)
    expect(c.bars.map((b) => b.height)).toEqual([0, 50, 100])
    expect(c.bars[2].y).toBe(10) // chạm đỉnh vùng vẽ
    expect(c.bars[0].y).toBe(110) // doanh thu 0: nằm ở đáy
  })
  it('mỗi ngày một dải bằng nhau, cột nằm giữa dải', () => {
    expect(c.bars.map((b) => b.bandX)).toEqual([40, 140, 240])
    expect(c.bars[1].cx).toBe(190)
    expect(c.bars[1].x + c.bars[1].width / 2).toBeCloseTo(190)
  })
  it('vạch trục khớp cột: giá trị lớn nhất của thang ở đỉnh', () => {
    expect(c.ticks[c.ticks.length - 1]).toEqual({ value: 100, y: 10 })
    expect(c.ticks[0]).toEqual({ value: 0, y: 110 })
  })
  it('tổng doanh thu', () => {
    expect(c.total).toBe(150)
  })
  it('chuỗi rỗng hoặc toàn 0 không lỗi, mọi cột cao 0', () => {
    expect(buildChart([], 300, 100, m).bars).toEqual([])
    const z = buildChart([{ date: '2026-10-01', revenue: 0, orders: 0 }], 300, 100, m)
    expect(z.bars[0].height).toBe(0)
    expect(Number.isFinite(z.bars[0].y)).toBe(true)
  })
  it('chiều rộng cột bị chặn trên khi ít ngày', () => {
    const wide = buildChart([{ date: '2026-10-01', revenue: 1, orders: 1 }], 1000, 100, m)
    expect(wide.bars[0].width).toBeLessThanOrEqual(40)
  })
})

describe('labelStep / indexAt', () => {
  it('nhãn thưa ra khi dải hẹp', () => {
    expect(labelStep(7, 700)).toBe(1)
    expect(labelStep(90, 700)).toBe(7)
    expect(labelStep(0, 700)).toBe(1)
  })
  const plot = { left: 40, top: 10, width: 300, height: 100 }
  it('chỉ số ngày dưới con trỏ, ngoài vùng là null, mép phải kẹp vào ngày cuối', () => {
    expect(indexAt(40, plot, 3)).toBe(0)
    expect(indexAt(139, plot, 3)).toBe(0)
    expect(indexAt(140, plot, 3)).toBe(1)
    expect(indexAt(340, plot, 3)).toBe(2)
    expect(indexAt(10, plot, 3)).toBeNull()
    expect(indexAt(341, plot, 3)).toBeNull()
    expect(indexAt(100, plot, 0)).toBeNull()
  })
})

describe('ngày yyyy-MM-dd', () => {
  it('rút gọn và đầy đủ, không đi qua múi giờ trình duyệt', () => {
    expect(shortDate('2026-10-04')).toBe('04/10')
    expect(fullDate('2026-10-04')).toBe('04/10/2026')
    expect(shortDate('xyz')).toBe('xyz')
  })
  it('thứ trong tuần đúng (04/10/2026 là Chủ nhật)', () => {
    expect(longDate('2026-10-04')).toBe('Chủ nhật, 04/10/2026')
    expect(longDate('2026-10-10')).toBe('Thứ bảy, 10/10/2026')
  })
})

describe('statusShares', () => {
  it('tỷ trọng %, bỏ trạng thái 0 đơn', () => {
    const s = statusShares([{ status: 'Pending', count: 3 }, { status: 'Completed', count: 1 }, { status: 'Cancelled', count: 0 }])
    expect(s).toEqual([{ status: 'Pending', count: 3, percent: 75 }, { status: 'Completed', count: 1, percent: 25 }])
  })
  it('tổng 0 hoặc rỗng thì không có phần nào (không chia 0)', () => {
    expect(statusShares([])).toEqual([])
    expect(statusShares([{ status: 'Pending', count: 0 }])).toEqual([])
  })
  it('màu: mỗi trạng thái đơn một màu khác nhau, trạng thái lạ rơi về xám', () => {
    const names = ['Pending', 'Confirmed', 'Processing', 'Shipping', 'Completed', 'Cancelled', 'Refunded']
    expect(new Set(names.map(statusBarClass)).size).toBe(7)
    expect(statusBarClass('Whatever')).toBe('bg-gray-400')
  })
})

describe('buildAlerts', () => {
  const alerts: Dashboard['alerts'] = { pendingOrders: 6, awaitingTransfer: 2, lowStockCount: 4, pendingReviews: 1 }
  const can = (...granted: PermissionCode[]) => (p: PermissionCode) => granted.includes(p)
  it('đủ quyền: 4 mục, đường dẫn tới màn hình đã lọc', () => {
    const items = buildAlerts(alerts, can(P.OrderView, P.ReviewModerate, P.ProductView), 'Sản phẩm')
    expect(items.map((i) => [i.key, i.count, i.to])).toEqual([
      ['pendingOrders', 6, '/orders?status=Pending'],
      ['awaitingTransfer', 2, '/orders?paymentStatus=Unpaid&paymentMethod=BankTransfer'],
      ['pendingReviews', 1, '/reviews?status=Pending'],
      ['lowStock', 4, null],
    ])
  })
  it('thiếu quyền thì ẩn mục tương ứng', () => {
    expect(buildAlerts(alerts, can(P.ReviewModerate), 'Sản phẩm').map((i) => i.key)).toEqual(['pendingReviews'])
    expect(buildAlerts(alerts, can(), 'Sản phẩm')).toEqual([])
  })
  it('nhãn sản phẩm theo cấu hình, không gắn cứng', () => {
    expect(buildAlerts(alerts, can(P.ProductView), 'Quần áo')[0].label).toBe('Quần áo sắp hết hàng')
  })
})
