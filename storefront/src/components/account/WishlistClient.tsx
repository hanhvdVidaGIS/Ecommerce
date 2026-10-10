'use client'
import { useState } from 'react'
import { Heart, X } from 'lucide-react'
import type { ProductCard as Card } from '@/api/types'
import { ProductCard, ProductGrid } from '@/components/product/ProductCard'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { api } from '@/lib/client-api'
import { errorMessage } from '@/lib/errors'
import { useApiQuery } from '@/lib/use-api-query'
import { useSite } from '@/providers/SiteProvider'
import { useToast } from '@/providers/ToastProvider'
import { PageHeading } from './shared'

export function WishlistClient() {
  const { currency, productLabel } = useSite()
  const toast = useToast()
  const q = useApiQuery<Card[]>(() => api.get<Card[]>('/api/account/wishlist'), 'wishlist')
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const items = q.data ?? []

  async function remove(p: Card) {
    if (removing.has(p.id)) return
    setRemoving((s) => new Set(s).add(p.id))
    try {
      await api.delete(`/api/account/wishlist/${p.id}`)
      q.setData((prev) => (prev ?? []).filter((x) => x.id !== p.id))
      toast.show('Đã bỏ khỏi danh sách yêu thích.', 'success')
    } catch (e) {
      toast.show(errorMessage(e), 'error')
    } finally {
      setRemoving((s) => { const n = new Set(s); n.delete(p.id); return n })
    }
  }

  return (
    <div>
      <PageHeading title="Yêu thích" description={items.length > 0 ? `${items.length} ${productLabel.toLowerCase()}` : undefined} />
      {q.loading && !q.data ? (
        <div aria-busy="true" aria-label="Đang tải" className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton aspect-square" aria-hidden />)}
        </div>
      ) : q.error && !q.data ? <ErrorState message={q.error} onRetry={q.reload} /> : items.length === 0 ? (
        <EmptyState icon={<Heart size={40} />} title="Danh sách yêu thích đang trống"
          description={`Bấm biểu tượng trái tim trên ${productLabel.toLowerCase()} để lưu lại xem sau.`} actionHref="/products" actionLabel={`Khám phá ${productLabel.toLowerCase()}`} />
      ) : (
        <ProductGrid>
          {items.map((p) => (
            <ProductCard key={p.id} product={p} currency={currency}
              action={(
                <button type="button" onClick={() => void remove(p)} disabled={removing.has(p.id)} aria-label={`Bỏ ${p.name} khỏi yêu thích`}
                  className="rounded-full bg-white/90 p-2 shadow hover:bg-white disabled:opacity-50"><X size={18} /></button>
              )} />
          ))}
        </ProductGrid>
      )}
    </div>
  )
}
