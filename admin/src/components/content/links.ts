/**
 * Liên kết an toàn: nội bộ (bắt đầu bằng "/", không phải "//host" hay có "\") hoặc http(s).
 * Cùng quy tắc với backend (LinkRules.IsSafe) để báo lỗi sớm; backend vẫn là nơi quyết định.
 */
export function isSafeLink(url: string | null | undefined): boolean {
  const u = (url ?? '').trim()
  if (!u) return true
  if (u.startsWith('/')) return !u.startsWith('//') && !u.includes('\\')
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const LINK_ERROR = 'Liên kết phải bắt đầu bằng / hoặc http(s)://.'
