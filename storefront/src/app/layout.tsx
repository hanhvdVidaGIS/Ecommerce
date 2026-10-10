import type { Metadata, Viewport } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { SITE_URL } from '@/lib/env'
import { menuByCode } from '@/lib/menu'
import { getSiteConfig, setting } from '@/lib/site'
import { googleFontUrl, readableOn, safeColor, safeFontName } from '@/lib/theme'
import { Providers } from '@/providers/Providers'
import type { SiteInfo } from '@/providers/SiteProvider'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig()
  const name = setting(config, 'general.siteName')
  const title = setting(config, 'seo.defaultTitle', name)
  const description = setting(config, 'seo.defaultDescription', setting(config, 'general.description'))
  const favicon = config.media['general.favicon']
  const og = config.media['seo.ogImage'] ?? config.media['general.logo']
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${name}` },
    description,
    applicationName: name,
    icons: favicon ? { icon: favicon.url } : undefined,
    openGraph: { type: 'website', siteName: name, locale: 'vi_VN', title, description, images: og ? [{ url: og.url, width: og.width ?? undefined, height: og.height ?? undefined }] : undefined },
    twitter: { card: 'summary_large_image' },
  }
}

// Cấu hình website lấy từ API lúc chạy (có đệm theo thẻ), không dựng sẵn lúc build: build trong Docker không có API để gọi.
export const dynamic = 'force-dynamic'

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T } catch { return fallback }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const config = await getSiteConfig()
  const s = (k: string, f = '') => setting(config, k, f)

  // Màu và font chỉ ghi đè khi cấu hình hợp lệ; nếu không, giá trị mặc định nằm trong globals.css.
  const brand = safeColor(s('theme.primaryColor'))
  const accent = safeColor(s('theme.secondaryColor'))
  const font = safeFontName(s('theme.fontFamily'))
  const style = {
    ...(brand ? { '--brand': brand, '--brand-contrast': readableOn(brand) } : {}),
    ...(accent ? { '--accent': accent, '--accent-contrast': readableOn(accent) } : {}),
    '--font-body': `'${font}'`,
  } as CSSProperties

  const site: SiteInfo = {
    siteName: s('general.siteName'),
    currency: s('store.currency', 'VND'),
    timezone: s('store.timezone', 'Asia/Ho_Chi_Minh'),
    productLabel: s('store.productLabel', 'Sản phẩm'),
    categoryLabel: s('store.categoryLabel', 'Danh mục'),
    brandLabel: s('store.brandLabel', 'Thương hiệu'),
    paymentMethods: parseJson<string[]>(s('store.paymentMethods', '[]'), []),
    bank: parseJson(s('store.bankAccount', '{}'), {}),
  }

  const orgLd = {
    '@context': 'https://schema.org', '@type': 'Organization', name: site.siteName, url: SITE_URL,
    logo: config.media['general.logo']?.url ? SITE_URL + config.media['general.logo'].url : undefined,
    telephone: s('contact.phone') || undefined, email: s('contact.email') || undefined,
    sameAs: ['social.facebook', 'social.instagram', 'social.tiktok'].map((k) => s(k)).filter(Boolean),
  }

  return (
    <html lang={s('store.language', 'vi')} style={style}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={googleFontUrl(font)} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, '\\u003c') }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <Providers site={site}>
          <Header siteName={site.siteName} logo={config.media['general.logo']} menu={menuByCode(config, 'header')} />
          <main id="main" className="flex-1">{children}</main>
          <Footer config={config} />
        </Providers>
      </body>
    </html>
  )
}
