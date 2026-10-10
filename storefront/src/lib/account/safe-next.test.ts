import { describe, expect, it } from 'vitest'
import { loginUrl, safeNext } from './safe-next'

describe('safeNext (chống open-redirect)', () => {
  it('nhận đường dẫn nội bộ, giữ nguyên query và hash', () => {
    expect(safeNext('/account/orders')).toBe('/account/orders')
    expect(safeNext('/products/ambra-fiore?x=1#top')).toBe('/products/ambra-fiore?x=1#top')
    expect(safeNext('/')).toBe('/')
  })

  it.each([
    ['https://evil.com'],
    ['http://evil.com/account'],
    ['//evil.com'],
    ['//evil.com/path'],
    ['///evil.com'],
    ['/\\evil.com'],
    ['\\\\evil.com'],
    ['/\t/evil.com'],
    ['/\n/evil.com'],
    ['/\r/evil.com'],
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    ['evil.com'],
    ['account'],
    [''],
  ])('từ chối %j', (raw) => {
    expect(safeNext(raw)).toBe('/account')
  })

  it('null/undefined/không phải chuỗi dùng giá trị dự phòng', () => {
    expect(safeNext(null)).toBe('/account')
    expect(safeNext(undefined, '/x')).toBe('/x')
    expect(safeNext(123 as unknown as string)).toBe('/account')
  })

  it('từ chối đường dẫn quá dài', () => {
    expect(safeNext('/' + 'a'.repeat(2001))).toBe('/account')
  })

  it('không quay lại chính trang đăng nhập/đăng ký (tránh vòng lặp)', () => {
    expect(safeNext('/account/login')).toBe('/account')
    expect(safeNext('/account/login?next=/account')).toBe('/account')
    expect(safeNext('/account/register')).toBe('/account')
    expect(safeNext('/account/reset-password?token=abc')).toBe('/account')
    expect(safeNext('/account/loginx')).toBe('/account/loginx')
  })
})

describe('loginUrl', () => {
  it('mã hoá đường dẫn quay lại', () => {
    expect(loginUrl('/account/orders?page=2')).toBe('/account/login?next=%2Faccount%2Forders%3Fpage%3D2')
  })
  it('bỏ next nếu không an toàn', () => {
    expect(loginUrl('//evil.com')).toBe('/account/login')
    expect(loginUrl(null)).toBe('/account/login')
  })
})
