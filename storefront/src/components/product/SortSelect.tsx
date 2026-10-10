'use client'
import { useRouter } from 'next/navigation'
import { SORT_OPTIONS, withFilters, type Filters } from '@/lib/filters'

export function SortSelect({ filters, basePath }: { filters: Filters; basePath: string }) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="sort" className="text-muted">Sắp xếp</label>
      <select id="sort" className="field !w-auto !py-2" value={filters.sort ?? 'newest'}
        onChange={(e) => router.push(withFilters(basePath, { ...filters, sort: e.target.value === 'newest' ? undefined : e.target.value, page: 1 }), { scroll: false })}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
