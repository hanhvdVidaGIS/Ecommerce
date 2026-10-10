import { describe, expect, it } from 'vitest'
import { parsePage, totalPages } from './paging'

describe('parsePage', () => {
  it('nhận số nguyên dương', () => {
    expect(parsePage('3')).toBe(3)
    expect(parsePage(['2', '5'])).toBe(2)
  })
  it.each([[undefined], [null], [''], ['0'], ['-1'], ['abc'], ['1.5'], ['2abc'], ['9999999']])('%j về trang 1', (v) => {
    expect(parsePage(v as string | null | undefined)).toBe(1)
  })
})

describe('totalPages', () => {
  it('làm tròn lên, tối thiểu 1', () => {
    expect(totalPages(0, 10)).toBe(1)
    expect(totalPages(10, 10)).toBe(1)
    expect(totalPages(11, 10)).toBe(2)
    expect(totalPages(5, 0)).toBe(1)
  })
})
