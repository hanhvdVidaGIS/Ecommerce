'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Heart, Menu, Search, ShoppingBag, User, X } from 'lucide-react'
import type { MediaRef, ProductCard } from '@/api/types'
import { Media } from '@/components/ui/Media'
import { api } from '@/lib/client-api'
import { menuHref, type MenuNode } from '@/lib/menu'
import { useAuth } from '@/providers/AuthProvider'
import { useCart } from '@/providers/CartProvider'
import { useMoney, useSite } from '@/providers/SiteProvider'

interface Suggestions {
  products: ProductCard[]
  brands: { slug: string; name: string; count: number }[]
  categories: { slug: string; name: string }[]
}

export function Header({ siteName, logo, menu }: { siteName: string; logo: MediaRef | null; menu: MenuNode[] }) {
  const pathname = usePathname()
  const [drawer, setDrawer] = useState(false)
  const [searching, setSearching] = useState(false)
  const { cart } = useCart()
  const { user } = useAuth()
  const count = cart?.itemCount ?? 0

  useEffect(() => { setDrawer(false); setSearching(false) }, [pathname])
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [drawer])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Bỏ qua tới nội dung chính</a>
      <div className="container-page flex h-16 items-center gap-3">
        <button type="button" className="-ml-2 p-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Mở menu" aria-expanded={drawer}><Menu size={22} /></button>

        <Link href="/" className="flex shrink-0 items-center" aria-label={`${siteName} - Trang chủ`}>
          {logo ? <Media media={logo} alt={siteName} priority className="h-8 w-auto max-w-[9rem] object-contain md:h-9" /> : <span className="text-lg font-bold tracking-wide">{siteName}</span>}
        </Link>

        <nav className="ml-6 hidden flex-1 lg:block" aria-label="Menu chính">
          <ul className="flex items-center gap-1">
            {menu.map((item) => (
              <li key={item.id} className="group relative">
                <Link href={menuHref(item)} className="block px-3 py-2 text-sm font-medium hover:text-accent">{item.title}</Link>
                {item.children.length > 0 ? (
                  <ul className="invisible absolute left-0 top-full min-w-52 border border-line bg-surface py-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {item.children.map((c) => (
                      <li key={c.id}><Link href={menuHref(c)} className="block px-4 py-2 text-sm hover:bg-subtle">{c.title}</Link></li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="p-2 hover:text-accent" onClick={() => setSearching((s) => !s)} aria-label="Tìm kiếm" aria-expanded={searching}><Search size={21} /></button>
          {user ? <Link href="/account/wishlist" className="hidden p-2 hover:text-accent sm:block" aria-label="Yêu thích"><Heart size={21} /></Link> : null}
          <Link href={user ? '/account' : '/account/login'} className="p-2 hover:text-accent" aria-label={user ? `Tài khoản của ${user.fullName}` : 'Đăng nhập'}><User size={21} /></Link>
          <Link href="/cart" className="relative p-2 hover:text-accent" aria-label={`Giỏ hàng, ${count} sản phẩm`}>
            <ShoppingBag size={21} />
            {count > 0 ? <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-contrast">{count > 99 ? '99+' : count}</span> : null}
          </Link>
        </div>
      </div>

      {searching ? <SearchPanel onClose={() => setSearching(false)} /> : null}
      {drawer ? <Drawer menu={menu} siteName={siteName} onClose={() => setDrawer(false)} /> : null}
    </header>
  )
}

function Drawer({ menu, siteName, onClose }: { menu: MenuNode[]; siteName: string; onClose: () => void }) {
  const { user } = useAuth()
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-surface shadow-xl">
        <div className="flex h-16 items-center justify-between border-b border-line px-4">
          <span className="font-bold">{siteName}</span>
          <button type="button" onClick={onClose} aria-label="Đóng menu" className="p-2"><X size={22} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2" aria-label="Menu di động">
          <ul>
            {menu.map((item) => (
              <li key={item.id}>
                <Link href={menuHref(item)} className="block px-3 py-3 font-medium">{item.title}</Link>
                {item.children.length > 0 ? (
                  <ul className="mb-1 ml-3 border-l border-line">
                    {item.children.map((c) => <li key={c.id}><Link href={menuHref(c)} className="block px-3 py-2 text-sm text-muted">{c.title}</Link></li>)}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid gap-1 border-t border-line p-3 text-sm">
          <Link href={user ? '/account' : '/account/login'} className="px-3 py-2">{user ? 'Tài khoản của tôi' : 'Đăng nhập / Đăng ký'}</Link>
          <Link href="/track" className="px-3 py-2">Tra cứu đơn hàng</Link>
        </div>
      </div>
    </div>
  )
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const money = useMoney()
  const { productLabel } = useSite()
  const [q, setQ] = useState('')
  const [data, setData] = useState<Suggestions | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setData(null); return }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      api.get<Suggestions>('/api/public/search/suggest', { q: term }, ctrl.signal).then(setData).catch((e) => { if ((e as Error).name !== 'AbortError') setData(null) })
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    if (term) { router.push(`/products?q=${encodeURIComponent(term)}`); onClose() }
  }
  const empty = data && data.products.length + data.brands.length + data.categories.length === 0

  return (
    <div className="border-t border-line bg-surface">
      <div className="container-page py-3">
        <form onSubmit={go} role="search" className="flex gap-2">
          <label htmlFor="site-search" className="sr-only">Tìm kiếm</label>
          <input id="site-search" ref={input} value={q} onChange={(e) => setQ(e.target.value)} className="field" placeholder={`Tìm ${productLabel.toLowerCase()}, thương hiệu...`} autoComplete="off" maxLength={100} />
          <button type="submit" className="btn btn-primary">Tìm</button>
        </form>
        {data ? (
          <div className="mt-3 grid gap-4 pb-2 md:grid-cols-[1fr_16rem]" aria-live="polite">
            <ul>
              {data.products.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.slug}`} onClick={onClose} className="flex items-center gap-3 py-2 hover:bg-subtle">
                    <Media media={p.image} alt="" className="h-12 w-12 shrink-0 object-cover" />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    <span className="text-sm font-medium">{money(p.minPrice)}</span>
                  </Link>
                </li>
              ))}
              {empty ? <li className="py-2 text-sm text-muted">Không tìm thấy kết quả cho “{q.trim()}”.</li> : null}
            </ul>
            {data.brands.length + data.categories.length > 0 ? (
              <div className="text-sm">
                {data.categories.map((c) => <Link key={c.slug} href={`/products?category=${c.slug}`} onClick={onClose} className="block py-1.5 hover:text-accent">{c.name}</Link>)}
                {data.brands.map((b) => <Link key={b.slug} href={`/products?brand=${b.slug}`} onClick={onClose} className="block py-1.5 hover:text-accent">{b.name} <span className="text-muted">({b.count})</span></Link>)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
