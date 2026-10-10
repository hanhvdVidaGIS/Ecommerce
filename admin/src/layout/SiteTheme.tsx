import { useEffect } from 'react'
import { useLabels, useSiteConfig } from '@/api/hooks'
import { applySiteTheme } from '@/lib/theme'

/** Áp màu chủ đạo, font, tiêu đề tab và favicon theo cấu hình website (white-label). Không hiển thị gì. */
export function SiteTheme() {
  const { data: site } = useSiteConfig()
  const labels = useLabels()
  useEffect(() => {
    if (!site) return
    applySiteTheme(site.settings as Record<string, string>)
    document.title = `Quản trị – ${labels.siteName}`
    const fav = site.media?.['general.favicon']?.url
    if (fav) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
      link.href = fav
    }
  }, [site, labels.siteName])
  return null
}
