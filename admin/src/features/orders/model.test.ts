import { describe, expect, it } from 'vitest'
import { P, type PermissionCode } from '@/api/catalog.generated'
import type { OrderStatus } from './api'
import {
  ORDER_STATUS_TONE, buildOrderParams, canMarkPaid, dayStartUtc, hasActiveFilters, isNoteEntry, orderStatusTone, paymentStatusTone,
  shouldReloadAfter, showBankInstructions, statusActions, type OrderFilters,
} from './model'

const can = (...granted: PermissionCode[]) => (p: PermissionCode) => granted.includes(p)
const base: OrderFilters = { page: 1, pageSize: 20, search: '', status: '', paymentStatus: '', paymentMethod: '', from: '', to: '', sort: null }

describe('màu trạng thái', () => {
  it('mỗi trạng thái đơn có một tông màu, trạng thái xấu là danger, hoàn tất là success', () => {
    expect(orderStatusTone('Pending')).toBe('warning')
    expect(orderStatusTone('Completed')).toBe('success')
    expect(orderStatusTone('Cancelled')).toBe('danger')
    expect(orderStatusTone('Refunded')).toBe('neutral')
    expect(Object.keys(ORDER_STATUS_TONE)).toHaveLength(7)
  })
  it('trạng thái lạ rơi về neutral thay vì lỗi', () => {
    expect(orderStatusTone('Whatever')).toBe('neutral')
    expect(paymentStatusTone('Whatever')).toBe('neutral')
  })
  it('màu thanh toán', () => {
    expect(paymentStatusTone('Unpaid')).toBe('warning')
    expect(paymentStatusTone('Paid')).toBe('success')
    expect(paymentStatusTone('Failed')).toBe('danger')
  })
})

describe('dayStartUtc', () => {
  it('00:00 ngày theo giờ Việt Nam là 17:00 UTC hôm trước', () => {
    expect(dayStartUtc('2026-10-10', 'Asia/Ho_Chi_Minh')).toBe('2026-10-09T17:00:00.000Z')
  })
  it('cộng ngày để lấy mốc loại trừ, qua được cuối tháng', () => {
    expect(dayStartUtc('2026-10-31', 'Asia/Ho_Chi_Minh', 1)).toBe('2026-10-31T17:00:00.000Z')
  })
  it('múi giờ khác và UTC', () => {
    expect(dayStartUtc('2026-01-15', 'UTC')).toBe('2026-01-15T00:00:00.000Z')
    expect(dayStartUtc('2026-07-01', 'America/New_York')).toBe('2026-07-01T04:00:00.000Z')
  })
  it('chuỗi ngày sai trả undefined', () => {
    expect(dayStartUtc('', 'UTC')).toBeUndefined()
    expect(dayStartUtc('10/10/2026', 'UTC')).toBeUndefined()
  })
})

describe('buildOrderParams', () => {
  it('bỏ giá trị rỗng', () => {
    const p = buildOrderParams(base, 'Asia/Ho_Chi_Minh')
    expect(p).toEqual({ page: 1, pageSize: 20, q: undefined, status: undefined, paymentStatus: undefined, from: undefined, to: undefined, sort: undefined })
  })
  it('ghép đủ bộ lọc, ngày đến là hết ngày, sort dạng trường:hướng', () => {
    const p = buildOrderParams(
      { ...base, page: 3, search: '  0912  ', status: 'Pending', paymentStatus: 'Unpaid', from: '2026-10-01', to: '2026-10-10', sort: { key: 'total', dir: 'desc' } },
      'Asia/Ho_Chi_Minh',
    )
    expect(p).toMatchObject({
      page: 3, q: '0912', status: 'Pending', paymentStatus: 'Unpaid',
      from: '2026-09-30T17:00:00.000Z', to: '2026-10-10T17:00:00.000Z', sort: 'total:desc',
    })
  })
  it('hasActiveFilters chỉ tính bộ lọc, không tính trang/sắp xếp', () => {
    expect(hasActiveFilters(base)).toBe(false)
    expect(hasActiveFilters({ ...base, search: '   ' })).toBe(false)
    expect(hasActiveFilters({ ...base, status: 'Pending' })).toBe(true)
    expect(hasActiveFilters({ ...base, to: '2026-10-10' })).toBe(true)
  })
})

describe('statusActions (nextStatuses + quyền)', () => {
  const next: OrderStatus[] = ['Cancelled', 'Confirmed']
  it('không có Order.Update thì không có nút nào', () => {
    expect(statusActions(next, can(P.OrderView))).toEqual([])
  })
  it('chỉ hiện trạng thái backend cho phép, huỷ xếp sau cùng và đánh dấu cần xác nhận', () => {
    expect(statusActions(next, can(P.OrderUpdate))).toEqual([
      { status: 'Confirmed', destructive: false },
      { status: 'Cancelled', destructive: true },
    ])
  })
  it('Refunded cần thêm Order.Refund', () => {
    expect(statusActions(['Refunded'], can(P.OrderUpdate))).toEqual([])
    expect(statusActions(['Refunded'], can(P.OrderUpdate, P.OrderRefund))).toEqual([{ status: 'Refunded', destructive: true }])
  })
  it('đơn ở trạng thái cuối (nextStatuses rỗng) không có nút', () => {
    expect(statusActions([], can(P.OrderUpdate, P.OrderRefund))).toEqual([])
  })
})

describe('canMarkPaid', () => {
  const unpaid = [{ method: 'BankTransfer', provider: 'x', amount: 1, status: 'Unpaid', paidAt: null }] as const
  const paid = [{ method: 'BankTransfer', provider: 'x', amount: 1, status: 'Paid', paidAt: '2026-01-01T00:00:00Z' }] as const
  it('hiện khi còn khoản chưa thanh toán, đơn đang mở và có quyền', () => {
    expect(canMarkPaid({ status: 'Confirmed', payments: [...unpaid] }, can(P.OrderUpdate))).toBe(true)
  })
  it('ẩn khi đã trả đủ, đơn huỷ/hoàn hoặc thiếu quyền', () => {
    expect(canMarkPaid({ status: 'Confirmed', payments: [...paid] }, can(P.OrderUpdate))).toBe(false)
    expect(canMarkPaid({ status: 'Cancelled', payments: [...unpaid] }, can(P.OrderUpdate))).toBe(false)
    expect(canMarkPaid({ status: 'Refunded', payments: [...unpaid] }, can(P.OrderUpdate))).toBe(false)
    expect(canMarkPaid({ status: 'Confirmed', payments: [...unpaid] }, can(P.OrderView))).toBe(false)
  })
})

describe('showBankInstructions', () => {
  const bt = { bank: 'B', accountNumber: '1', accountName: 'N', transferContent: 'C' }
  const pay = (status: 'Unpaid' | 'Paid', method: 'Cod' | 'BankTransfer') => [{ method, provider: 'x', amount: 1, status, paidAt: null }]
  it('chỉ hiện với chuyển khoản chưa trả trên đơn đang mở', () => {
    expect(showBankInstructions({ bankTransfer: bt, status: 'Pending', payments: pay('Unpaid', 'BankTransfer') })).toBe(true)
    expect(showBankInstructions({ bankTransfer: bt, status: 'Pending', payments: pay('Paid', 'BankTransfer') })).toBe(false)
    expect(showBankInstructions({ bankTransfer: bt, status: 'Pending', payments: pay('Unpaid', 'Cod') })).toBe(false)
    expect(showBankInstructions({ bankTransfer: bt, status: 'Cancelled', payments: pay('Unpaid', 'BankTransfer') })).toBe(false)
    expect(showBankInstructions({ bankTransfer: null, status: 'Pending', payments: pay('Unpaid', 'BankTransfer') })).toBe(false)
  })
})

describe('lịch sử và lỗi', () => {
  it('from == to là ghi chú; from null (tạo đơn) và chuyển trạng thái thì không', () => {
    expect(isNoteEntry({ from: 'Pending', to: 'Pending' })).toBe(true)
    expect(isNoteEntry({ from: 'Pending', to: 'Confirmed' })).toBe(false)
    expect(isNoteEntry({ from: null, to: 'Pending' })).toBe(false)
  })
  it('chỉ 409 invalid_transition/concurrency_conflict mới tải lại đơn', () => {
    expect(shouldReloadAfter({ status: 409, code: 'invalid_transition' })).toBe(true)
    expect(shouldReloadAfter({ status: 409, code: 'concurrency_conflict' })).toBe(true)
    expect(shouldReloadAfter({ status: 409, code: 'same_status' })).toBe(false)
    expect(shouldReloadAfter({ status: 500, code: 'invalid_transition' })).toBe(false)
    expect(shouldReloadAfter(null)).toBe(false)
  })
})
