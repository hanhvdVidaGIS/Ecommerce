import 'server-only'
import { cache } from 'react'
import type { SiteConfig } from '@/api/types'
import { apiGet } from './server-api'

export const SITE_CONFIG_TAG = 'site-config'

/** Cấu hình website (tên, logo, màu, menu, banner, section trang chủ). Một lần lấy cho mỗi yêu cầu; đệm 5 phút, backend gọi làm mới khi quản trị đổi cấu hình. */
export const getSiteConfig = cache(async (): Promise<SiteConfig> => {
  const config = await apiGet<SiteConfig>('/api/public/site-config', { revalidate: 300, tags: [SITE_CONFIG_TAG] })
  if (!config) throw new Error('Backend không trả về cấu hình website.')
  return config
})

export function setting(config: SiteConfig, key: string, fallback = ''): string {
  const v = (config.settings as Record<string, string>)[key]
  return v === undefined || v === null ? fallback : v
}
