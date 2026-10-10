import { afterEach, describe, expect, it } from 'vitest'
import { applySiteTheme, readableForeground } from './theme'

describe('readableForeground (độ tương phản)', () => {
  it.each([['#000000', '#ffffff'], ['#111827', '#ffffff'], ['#ffffff', '#111827'], ['#f5e6a8', '#111827'], ['#1e3a8a', '#ffffff']])('%s → %s', (bg, fg) => {
    expect(readableForeground(bg)).toBe(fg)
  })
  it('giá trị hỏng rơi về chữ trắng thay vì ném lỗi', () => {
    expect(readableForeground('đỏ')).toBe('#ffffff')
  })
})

describe('applySiteTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style')
    document.getElementById('site-font')?.remove()
  })

  it('áp màu chủ đạo hợp lệ và chữ đọc được trên màu đó', () => {
    applySiteTheme({ 'theme.primaryColor': '#f5e6a8' })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#f5e6a8')
    expect(document.documentElement.style.getPropertyValue('--accent-fg')).toBe('#111827')
  })

  it('bỏ qua màu không hợp lệ để giữ mặc định', () => {
    applySiteTheme({ 'theme.primaryColor': 'red; background:url(x)' })
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
  })

  it('từ chối tên font có ký tự lạ (chống chèn CSS/URL) và chỉ nạp font hợp lệ', () => {
    applySiteTheme({ 'theme.fontFamily': 'Inter"; } body { display:none' })
    expect(document.getElementById('site-font')).toBeNull()
    applySiteTheme({ 'theme.fontFamily': 'Be Vietnam Pro' })
    expect(document.getElementById('site-font')?.getAttribute('href')).toContain('family=Be+Vietnam+Pro')
  })
})
