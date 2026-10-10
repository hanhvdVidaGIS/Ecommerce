// Backend chỉ trả mã vị trí (meta.bannerPlacements), chưa có nhãn; map này chỉ để dễ đọc, mã lạ hiện nguyên mã.
const HINTS: Record<string, string> = {
  hero: 'Hero (đầu trang chủ)',
  slider: 'Slider',
  promo: 'Quảng cáo',
}

export function placementLabel(code: string): string {
  return HINTS[code] ?? code
}
