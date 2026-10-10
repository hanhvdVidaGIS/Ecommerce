'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import type { Dto } from '@/api/types'
import { clearFilters, hasActiveFilters, toggle, withFilters, type Filters } from '@/lib/filters'
import { formatNumber } from '@/lib/format'
import { useSite } from '@/providers/SiteProvider'

type Facets = Dto<'FacetsDto'>

function Group({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="border-b border-line py-4" open={defaultOpen}>
      <summary className="cursor-pointer select-none text-sm font-semibold">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

/** Bộ lọc dựng từ facet của máy chủ (số đếm đã loại chính chiều đang lọc). Mỗi thao tác đổi URL; máy chủ dựng lại kết quả. */
export function ProductFilters({ facets, filters, basePath }: { facets: Facets; filters: Filters; basePath: string }) {
  const router = useRouter()
  const { brandLabel } = useSite()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [min, setMin] = useState(filters.priceMin?.toString() ?? '')
  const [max, setMax] = useState(filters.priceMax?.toString() ?? '')

  useEffect(() => { setMin(filters.priceMin?.toString() ?? ''); setMax(filters.priceMax?.toString() ?? '') }, [filters.priceMin, filters.priceMax])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open])

  const push = (next: Filters) => startTransition(() => router.push(withFilters(basePath, { ...next, page: 1 }), { scroll: false }))
  const setAttr = (code: string, value: string) => {
    const values = toggle(filters.attrs[code] ?? [], value)
    const attrs = { ...filters.attrs }
    if (values.length) attrs[code] = values
    else delete attrs[code]
    push({ ...filters, attrs })
  }
  const applyPrice = (e: React.FormEvent) => {
    e.preventDefault()
    const lo = min === '' ? undefined : Math.max(0, Number(min))
    const hi = max === '' ? undefined : Math.max(0, Number(max))
    if ((lo !== undefined && Number.isNaN(lo)) || (hi !== undefined && Number.isNaN(hi))) return
    push({ ...filters, priceMin: lo, priceMax: hi !== undefined && lo !== undefined && hi < lo ? lo : hi })
  }

  const body = (
    <div aria-busy={pending}>
      {hasActiveFilters(filters) ? <button type="button" className="mb-2 text-sm font-medium text-accent underline" onClick={() => push(clearFilters(filters))}>Xoá bộ lọc</button> : null}

      {facets.brands.length > 0 ? (
        <Group title={brandLabel}>
          <ul className="space-y-2">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={filters.brands.includes(b.slug)} onChange={() => push({ ...filters, brands: toggle(filters.brands, b.slug) })} />
                  <span className="flex-1">{b.name}</span><span className="text-xs text-muted">{b.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {facets.price ? (
        <Group title="Khoảng giá">
          <form onSubmit={applyPrice} className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="price-min">Giá từ</label>
              <input id="price-min" inputMode="numeric" className="field !py-2" placeholder={formatNumber(facets.price.min)} value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
              <span aria-hidden>–</span>
              <label className="sr-only" htmlFor="price-max">Giá đến</label>
              <input id="price-max" inputMode="numeric" className="field !py-2" placeholder={formatNumber(facets.price.max)} value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
            </div>
            <button type="submit" className="btn btn-outline w-full !py-2">Áp dụng</button>
          </form>
        </Group>
      ) : null}

      {facets.attributes.map((a) => (
        <Group key={a.code} title={a.name}>
          {a.dataType === 'Color' ? (
            <ul className="flex flex-wrap gap-2">
              {a.values.map((v) => {
                const on = (filters.attrs[a.code] ?? []).includes(v.code)
                return (
                  <li key={v.code}>
                    <button type="button" onClick={() => setAttr(a.code, v.code)} aria-pressed={on} title={`${v.label} (${v.count})`}
                      className={`h-8 w-8 rounded-full border-2 bg-line ${on ? 'border-ink ring-2 ring-accent' : 'border-line'}`} style={v.colorHex ? { background: v.colorHex } : undefined}>
                      <span className="sr-only">{v.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul className="space-y-2">
              {a.values.map((v) => (
                <li key={v.code}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={(filters.attrs[a.code] ?? []).includes(v.code)} onChange={() => setAttr(a.code, v.code)} />
                    <span className="flex-1">{v.label}</span><span className="text-xs text-muted">{v.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Group>
      ))}
    </div>
  )

  return (
    <>
      <button type="button" className="btn btn-outline lg:hidden" onClick={() => setOpen(true)} aria-expanded={open}>
        <SlidersHorizontal size={16} /> Bộ lọc{hasActiveFilters(filters) ? ' •' : ''}
      </button>
      <aside className="hidden lg:block" aria-label="Bộ lọc sản phẩm">{body}</aside>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Bộ lọc sản phẩm">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col bg-surface shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="font-semibold">Bộ lọc</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng bộ lọc" className="p-2"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4">{body}</div>
            <div className="border-t border-line p-3"><button type="button" className="btn btn-primary w-full" onClick={() => setOpen(false)}>Xem kết quả</button></div>
          </div>
        </div>
      ) : null}
    </>
  )
}
