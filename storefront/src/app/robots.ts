import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/env'

/** Khu vực giao dịch và tài khoản không được lập chỉ mục; tìm kiếm/bộ lọc tự gắn noindex ở từng trang. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/cart', '/checkout', '/account', '/track', '/revalidate'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
