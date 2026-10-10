import type { CustomerParams } from './api'

/** Giá trị ô lọc "Hoạt động": rỗng = mọi khách. */
export type ActiveFilter = '' | 'active' | 'locked'

export interface CustomerFilters {
  page: number
  pageSize: number
  search: string
  active: ActiveFilter
  sort: { key: string; dir: 'asc' | 'desc' } | null
}

export function activeParam(filter: ActiveFilter): boolean | undefined {
  return filter === '' ? undefined : filter === 'active'
}

/** Ghép tham số truy vấn gửi API: bỏ giá trị rỗng, sort dạng `<trường>:asc|desc`. */
export function buildCustomerParams(f: CustomerFilters): CustomerParams {
  return {
    page: f.page,
    pageSize: f.pageSize,
    q: f.search.trim() || undefined,
    active: activeParam(f.active),
    sort: f.sort ? `${f.sort.key}:${f.sort.dir}` : undefined,
  }
}

export function hasActiveCustomerFilters(f: Pick<CustomerFilters, 'search' | 'active'>): boolean {
  return !!(f.search.trim() || f.active)
}

/** Thao tác khoá/mở khoá tiếp theo của một khách và nội dung xác nhận tương ứng. */
export function toggleActiveCopy(isActive: boolean, fullName: string): { next: boolean; title: string; message: string; confirmLabel: string; success: string } {
  return isActive
    ? { next: false, title: `Khoá tài khoản "${fullName}"?`, message: 'Khách sẽ bị đăng xuất và không đăng nhập được cho tới khi mở khoá.', confirmLabel: 'Khoá', success: 'Đã khoá tài khoản' }
    : { next: true, title: `Mở khoá tài khoản "${fullName}"?`, message: 'Khách có thể đăng nhập và đặt hàng trở lại.', confirmLabel: 'Mở khoá', success: 'Đã mở khoá tài khoản' }
}
