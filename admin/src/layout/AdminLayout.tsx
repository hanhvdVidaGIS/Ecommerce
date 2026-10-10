import {
  FileText, FolderTree, Images as GalleryIcon, Globe, History, Image as ImageIcon, LayoutDashboard, LayoutTemplate, LogOut, Menu as MenuIcon,
  Newspaper, Package, Shield, ShoppingCart, SlidersHorizontal, Star, Store, Tag, Ticket, Truck, UserRound, Users, X, type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLabels, useSiteConfig } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'
import { NAV, type NavItem } from './nav'

const ICONS: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard, package: Package, 'folder-tree': FolderTree, tag: Tag, sliders: SlidersHorizontal, image: ImageIcon,
  gallery: GalleryIcon, layout: LayoutTemplate, menu: MenuIcon, file: FileText, globe: Globe, store: Store, users: Users, shield: Shield, history: History,
  ticket: Ticket, truck: Truck, 'shopping-cart': ShoppingCart, 'user-round': UserRound, star: Star, newspaper: Newspaper,
}

export default function AdminLayout() {
  const { user, can, logout } = useAuth()
  const labels = useLabels()
  const { data: site } = useSiteConfig()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => setOpen(false), [location.pathname])

  const labelOf = (item: NavItem) =>
    item.label === 'label:product' ? labels.product : item.label === 'label:category' ? labels.category : item.label === 'label:brand' ? labels.brand : item.label

  const logo = site?.media?.['general.logo']?.url

  const nav = (
    <nav aria-label="Điều hướng chính" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.permission || can(i.permission))
        if (items.length === 0) return null
        return (
          <div key={group.title || 'root'}>
            {group.title && <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{group.title}</p>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = ICONS[item.icon] ?? FileText
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) => cn('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm', isActive ? 'bg-accent font-medium text-accent-fg' : 'text-text hover:bg-surface-2')}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {labelOf(item)}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )

  const brand = (
    <Link to="/" className="flex h-14 items-center gap-2 border-b border-border px-4">
      {logo ? <img src={logo} alt={labels.siteName} className="h-7 max-w-[140px] object-contain" /> : <span className="text-sm font-bold">{labels.siteName}</span>}
      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">Admin</span>
    </Link>
  )

  return (
    <div className="flex h-full">
      {/* Cố định trên màn hình lớn */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        {brand}
        {nav}
      </aside>

      {/* Trượt ra trên điện thoại/máy tính bảng */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between">
              {brand}
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng menu" className="mr-2 rounded p-2 text-muted hover:bg-surface-2"><X className="h-4 w-4" /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4">
          <button type="button" onClick={() => setOpen(true)} aria-label="Mở menu" className="rounded p-2 text-text hover:bg-surface-2 lg:hidden"><MenuIcon className="h-5 w-5" /></button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{user?.fullName}</p>
              <p className="text-xs text-muted">{user?.roles?.join(', ')}</p>
            </div>
            <button
              type="button"
              onClick={async () => { await logout(); navigate('/login', { replace: true }) }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Đăng xuất
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-6xl"><Outlet /></div>
        </main>
      </div>
    </div>
  )
}
