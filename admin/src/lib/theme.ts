/** Chọn màu chữ dễ đọc (đen/trắng) trên nền cho trước theo độ sáng tương đối (WCAG). */
export function readableForeground(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  return luminance > 0.5 ? '#111827' : '#ffffff'
}

/** Áp màu chủ đạo và font từ cấu hình website vào Admin; giá trị không hợp lệ thì giữ mặc định. */
export function applySiteTheme(settings: Record<string, string>) {
  const root = document.documentElement
  const primary = settings['theme.primaryColor']
  if (primary && /^#[0-9a-f]{6}$/i.test(primary)) {
    root.style.setProperty('--accent', primary)
    root.style.setProperty('--accent-fg', readableForeground(primary))
  }
  const font = settings['theme.fontFamily']
  if (font && /^[\w\s]+$/.test(font)) {
    root.style.setProperty('--font-family', `"${font}"`)
    const id = 'site-font'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`
      document.head.appendChild(link)
    }
  }
}
