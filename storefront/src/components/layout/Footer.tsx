import Link from 'next/link'
import type { SiteConfig } from '@/api/types'
import { isExternal, menuByCode, menuHref } from '@/lib/menu'
import { setting } from '@/lib/site'

const SOCIAL: { key: string; label: string }[] = [
  { key: 'social.facebook', label: 'Facebook' },
  { key: 'social.instagram', label: 'Instagram' },
  { key: 'social.tiktok', label: 'TikTok' },
  { key: 'social.zalo', label: 'Zalo' },
]

export function Footer({ config }: { config: SiteConfig }) {
  const links = menuByCode(config, 'footer')
  const s = (k: string) => setting(config, k)
  const phone = s('contact.phone')
  const social = SOCIAL.map((x) => ({ ...x, url: s(x.key) })).filter((x) => x.url)
  return (
    <footer className="mt-16 border-t border-line bg-subtle">
      <div className="container-page grid gap-8 py-10 md:grid-cols-3">
        <div>
          <p className="text-lg font-bold">{s('general.siteName')}</p>
          {s('footer.text') ? <p className="mt-2 max-w-sm text-sm text-muted">{s('footer.text')}</p> : null}
          {social.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {social.map((x) => <li key={x.key}><a href={x.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{x.label}</a></li>)}
            </ul>
          ) : null}
        </div>
        <nav aria-label="Chính sách và hỗ trợ">
          <p className="font-semibold">Hỗ trợ</p>
          <ul className="mt-3 space-y-2 text-sm">
            {links.map((l) => {
              const href = menuHref(l)
              return <li key={l.id}>{isExternal(href) ? <a href={href} className="hover:text-accent" rel="noopener noreferrer" target="_blank">{l.title}</a> : <Link href={href} className="hover:text-accent">{l.title}</Link>}</li>
            })}
            <li><Link href="/track" className="hover:text-accent">Tra cứu đơn hàng</Link></li>
          </ul>
        </nav>
        <address className="text-sm not-italic">
          <p className="font-semibold">Liên hệ</p>
          <ul className="mt-3 space-y-2 text-muted">
            {s('store.name') ? <li>{s('store.name')}</li> : null}
            {s('contact.address') ? <li>{s('contact.address')}</li> : null}
            {phone ? <li><a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="hover:text-accent">{phone}</a></li> : null}
            {s('contact.email') ? <li><a href={`mailto:${s('contact.email')}`} className="hover:text-accent">{s('contact.email')}</a></li> : null}
          </ul>
        </address>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-muted">{s('footer.copyright')}</div>
    </footer>
  )
}
