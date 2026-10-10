import { isSafeLink, LINK_ERROR } from '@/components/content/links'

/** Hai khoá có ô nhập riêng; mọi khoá còn lại (kể cả khoá lạ) nằm trong ô JSON nâng cao. */
export const FRIENDLY_KEYS = ['limit', 'viewAllUrl'] as const

export const LIMIT_MIN = 1
export const LIMIT_MAX = 100

export interface FriendlyConfig {
  limit: string
  viewAllUrl: string
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Tách cấu hình của backend thành các ô thân thiện + JSON nâng cao.
 * Chỉ coi `limit` là ô thân thiện khi nó là số hữu hạn và `viewAllUrl` khi là chuỗi; giá trị khác kiểu ở lại trong JSON để không mất.
 */
export function splitConfig(config: unknown): { friendly: FriendlyConfig; advanced: string } {
  const source = isPlainObject(config) ? config : {}
  const rest: Record<string, unknown> = {}
  const friendly: FriendlyConfig = { limit: '', viewAllUrl: '' }
  for (const [key, value] of Object.entries(source)) {
    if (key === 'limit' && typeof value === 'number' && Number.isFinite(value)) friendly.limit = String(value)
    else if (key === 'viewAllUrl' && typeof value === 'string') friendly.viewAllUrl = value
    else rest[key] = value
  }
  return { friendly, advanced: Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '' }
}

export interface ConfigErrors {
  limit?: string
  viewAllUrl?: string
  advanced?: string
}

export type BuildConfigResult = { ok: true; config: Record<string, unknown> } | { ok: false; errors: ConfigErrors }

/**
 * Ghép ô thân thiện + JSON nâng cao thành cấu hình gửi lên backend.
 * Ô thân thiện bỏ trống thì khoá bị bỏ; nếu người dùng tự gõ `limit` trong JSON khi ô thân thiện trống thì giữ nguyên giá trị đó.
 */
export function buildConfig(friendly: FriendlyConfig, advancedText: string): BuildConfigResult {
  const errors: ConfigErrors = {}

  const limitText = friendly.limit.trim()
  let limit: number | null = null
  if (limitText) {
    const n = Number(limitText)
    if (!/^\d+$/.test(limitText) || n < LIMIT_MIN || n > LIMIT_MAX) errors.limit = `Nhập số nguyên từ ${LIMIT_MIN} đến ${LIMIT_MAX}.`
    else limit = n
  }

  const viewAll = friendly.viewAllUrl.trim()
  if (viewAll && !isSafeLink(viewAll)) errors.viewAllUrl = LINK_ERROR

  let extra: Record<string, unknown> = {}
  const advancedTrim = advancedText.trim()
  if (advancedTrim) {
    try {
      const parsed: unknown = JSON.parse(advancedTrim)
      if (isPlainObject(parsed)) extra = parsed
      else errors.advanced = 'Cấu hình phải là một đối tượng JSON, ví dụ {"khoa": "giá trị"}.'
    } catch (e) {
      errors.advanced = `JSON sai cú pháp${e instanceof Error ? `: ${e.message}` : '.'}`
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    config: { ...extra, ...(limit !== null ? { limit } : {}), ...(viewAll ? { viewAllUrl: viewAll } : {}) },
  }
}
