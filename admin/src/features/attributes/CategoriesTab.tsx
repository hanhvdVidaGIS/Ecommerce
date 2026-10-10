import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useLabels } from '@/api/hooks'
import { EmptyState, ErrorState } from '@/components/ui/data'
import { Badge, Button, Card, CardHeader, Checkbox, Input, Skeleton } from '@/components/ui/primitives'
import { useCategories } from '@/features/categories/api'
import { inheritedIds, visibleRows } from '@/features/categories/tree'
import { toastError } from '@/lib/forms'
import { useSetAttributeCategories } from './api'
import type { Attribute } from './rules'

const NO_COLLAPSED: ReadonlySet<string> = new Set()

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((x) => b.has(x))
}

/**
 * Tab "Danh mục áp dụng". Backend gán thuộc tính theo danh mục và áp dụng cho cả cây con
 * (ProductService lấy thuộc tính theo chuỗi tổ tiên), nên chỉ cần chọn danh mục cha.
 */
export function CategoriesTab({ attribute, canManage }: { attribute: Attribute; canManage: boolean }) {
  const labels = useLabels()
  const noun = labels.category.toLowerCase()
  const categories = useCategories()
  const save = useSetAttributeCategories(attribute.id)
  const saved = useMemo(() => new Set(attribute.categoryIds), [attribute.categoryIds])
  const [checked, setChecked] = useState<Set<string>>(saved)
  const [search, setSearch] = useState('')

  const flat = useMemo(() => categories.data ?? [], [categories.data])
  const rows = useMemo(() => visibleRows(flat, NO_COLLAPSED, search), [flat, search])
  const inherited = useMemo(() => inheritedIds(flat, checked), [flat, checked])
  const dirty = !sameSet(checked, saved)

  const toggle = (id: string, on: boolean) => setChecked((prev) => {
    const next = new Set(prev)
    if (on) next.add(id)
    else next.delete(id)
    return next
  })

  const onSave = async () => {
    try {
      await save.mutateAsync([...checked])
      toast.success('Đã lưu')
    } catch (e) {
      toastError(e, 'Không lưu được.')
    }
  }

  return (
    <Card>
      <CardHeader
        title={`${labels.category} áp dụng`}
        description={`Thuộc tính gán cho một ${noun} cũng áp dụng cho mọi ${noun} con của nó, nên chỉ cần chọn ${noun} cha.`}
        actions={canManage && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={!dirty || save.isPending} onClick={() => setChecked(new Set(saved))}>Đặt lại</Button>
            <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={onSave}>Lưu</Button>
          </div>
        )}
      />
      {categories.isLoading ? (
        <div className="space-y-2 p-4" aria-busy>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-6" />)}</div>
      ) : categories.error ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : flat.length === 0 ? (
        <EmptyState title={`Chưa có ${noun} nào`} description={`Tạo ${noun} trước khi gán thuộc tính.`} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <div className="relative min-w-48 max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
              <Input aria-label={`Lọc ${noun} theo tên`} placeholder={`Lọc ${noun} theo tên...`} className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span className="text-xs text-muted">Đã chọn {checked.size} / {flat.length}</span>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="Không tìm thấy kết quả" />
          ) : (
            <ul aria-label={`Chọn ${noun} áp dụng`} className="[--indent:14px] sm:[--indent:22px]">
              {rows.map((c) => (
                <li key={c.id} className="border-b border-border last:border-0" style={{ paddingLeft: `calc(0.75rem + ${search ? 0 : c.depth} * var(--indent))` }}>
                  <div className="flex items-center justify-between gap-2 py-2 pr-3">
                    <Checkbox
                      label={search && c.depth > 0 ? c.path : c.name}
                      checked={checked.has(c.id)}
                      disabled={!canManage}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                    />
                    {inherited.has(c.id) && <Badge tone="info">Kế thừa từ {noun} cha</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}
