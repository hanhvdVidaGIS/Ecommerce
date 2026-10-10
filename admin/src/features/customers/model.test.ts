import { describe, expect, it } from 'vitest'
import { activeParam, buildCustomerParams, hasActiveCustomerFilters, toggleActiveCopy, type CustomerFilters } from './model'

const base: CustomerFilters = { page: 1, pageSize: 20, search: '', active: '', sort: null }

describe('buildCustomerParams', () => {
  it('bỏ giá trị rỗng', () => {
    expect(buildCustomerParams(base)).toEqual({ page: 1, pageSize: 20, q: undefined, active: undefined, sort: undefined })
  })
  it('ghép tìm kiếm, lọc hoạt động và sắp xếp', () => {
    expect(buildCustomerParams({ ...base, page: 2, search: ' an ', active: 'locked', sort: { key: 'totalSpent', dir: 'desc' } }))
      .toEqual({ page: 2, pageSize: 20, q: 'an', active: false, sort: 'totalSpent:desc' })
  })
  it('activeParam: active=true, locked=false, rỗng=bỏ', () => {
    expect(activeParam('active')).toBe(true)
    expect(activeParam('locked')).toBe(false)
    expect(activeParam('')).toBeUndefined()
  })
  it('hasActiveCustomerFilters', () => {
    expect(hasActiveCustomerFilters(base)).toBe(false)
    expect(hasActiveCustomerFilters({ ...base, active: 'locked' })).toBe(true)
  })
})

describe('toggleActiveCopy', () => {
  it('đang hoạt động thì thao tác là khoá', () => {
    const c = toggleActiveCopy(true, 'An')
    expect(c.next).toBe(false)
    expect(c.title).toContain('Khoá')
    expect(c.title).toContain('An')
  })
  it('đang bị khoá thì thao tác là mở khoá', () => {
    const c = toggleActiveCopy(false, 'An')
    expect(c.next).toBe(true)
    expect(c.confirmLabel).toBe('Mở khoá')
  })
})
