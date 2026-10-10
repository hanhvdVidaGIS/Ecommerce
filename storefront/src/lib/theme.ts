/** Chọn màu chữ đen/trắng đạt tương phản trên nền cho trước (WCAG): dùng cho nút màu chủ đạo/phụ do quản trị tự chọn. */
export function readableOn(hex: string): '#ffffff' | '#111111' {
  const rgb = parseHex(hex)
  if (!rgb) return '#ffffff'
  const lum = luminance(rgb)
  const withWhite = 1.05 / (lum + 0.05)
  const withBlack = (lum + 0.05) / (luminance([17, 17, 17]) + 0.05)
  return withWhite >= withBlack ? '#ffffff' : '#111111'
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** Chỉ nhận mã màu hex hợp lệ; giá trị lạ trả về undefined để dùng màu mặc định của CSS (không chèn chuỗi tuỳ ý vào CSS). */
export function safeColor(value: string | undefined): string | undefined {
  return value && parseHex(value) ? (value.startsWith('#') ? value : '#' + value) : undefined
}

/** Tên font chỉ gồm chữ, số, khoảng trắng, gạch ngang: dùng an toàn trong URL Google Fonts và CSS. */
export function safeFontName(value: string | undefined, fallback = 'Be Vietnam Pro'): string {
  return value && /^[\p{L}\p{N} \-]{1,60}$/u.test(value) ? value : fallback
}

export function googleFontUrl(font: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap&subset=vietnamese`
}
