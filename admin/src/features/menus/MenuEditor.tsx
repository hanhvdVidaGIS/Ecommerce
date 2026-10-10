import { ArrowDown, ArrowUp, ChevronsLeft, ChevronsRight, CornerDownRight, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { ApiError } from '@/api/client'
import { useLabels, useMeta } from '@/api/hooks'
import { Can } from '@/auth/guards'
import { isSafeLink } from '@/components/content/links'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, CardHeader, FormField, Input, Select, Switch } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { cn } from '@/lib/utils'
import { useCategoryOptions, useDeleteMenu, usePageOptions, useSaveMenu, type CategoryOption, type MenuAdmin, type PageOption } from './api'
import {
  addNode, canAddChild, canIndent, canMove, canOutdent, countNodes, createNode, flatten, fromDto, indentNode, mapItemErrors, MAX_DEPTH, MAX_ITEMS,
  moveNode, outdentNode, removeNode, TARGET_CATEGORY, TARGET_PAGE, TARGET_URL, toRequestItems, updateNode, validateTree, type MenuNode,
} from './tree'

const SYSTEM_MENUS = ['header', 'footer']

function snapshot(name: string, tree: MenuNode[]): string {
  return JSON.stringify({ name: name.trim(), items: toRequestItems(tree) })
}

function ItemRow({ item, depth, index, siblings, tree, error, categories, pages, typeOptions, onChange, onTree }: {
  item: MenuNode
  depth: number
  index: number
  siblings: number
  tree: MenuNode[]
  error?: string
  categories: CategoryOption[]
  pages: PageOption[]
  typeOptions: { value: string; label: string }[]
  onChange: (key: string, patch: Partial<Omit<MenuNode, 'key' | 'children'>>) => void
  onTree: (next: MenuNode[]) => void
}) {
  const label = item.title.trim() || `mục ${index + 1}`
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? ''
  const pageTitle = (id: string | null) => pages.find((p) => p.id === id)?.title ?? ''
  const idp = `mi-${item.key}`
  const missingTarget = item.targetId && ((item.targetType === TARGET_CATEGORY && !categories.some((c) => c.id === item.targetId)) || (item.targetType === TARGET_PAGE && !pages.some((p) => p.id === item.targetId)))

  return (
    <li style={{ marginLeft: `${(depth - 1) * 16}px` }} className={cn('@container rounded-md border bg-surface p-2.5', error ? 'border-danger' : 'border-border', !item.isActive && 'opacity-70')}>
      <div className="grid gap-2 @xl:grid-cols-[minmax(0,1.2fr)_11rem_minmax(0,1.3fr)]">
        <FormField label="Tiêu đề" htmlFor={`${idp}-title`}>
          <Input id={`${idp}-title`} value={item.title} invalid={!!error} onChange={(e) => onChange(item.key, { title: e.target.value })} />
        </FormField>
        <FormField label="Loại liên kết" htmlFor={`${idp}-type`}>
          <Select id={`${idp}-type`} value={item.targetType} onChange={(e) => onChange(item.key, { targetType: e.target.value, targetId: null })}>
            {typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FormField>
        {item.targetType === TARGET_URL ? (
          <FormField label="Địa chỉ" htmlFor={`${idp}-url`}>
            <Input id={`${idp}-url`} placeholder="/products hoặc https://..." value={item.url} invalid={!!error} onChange={(e) => onChange(item.key, { url: e.target.value })} />
          </FormField>
        ) : (
          <FormField label="Đối tượng" htmlFor={`${idp}-target`}>
            <Select
              id={`${idp}-target`}
              value={item.targetId ?? ''}
              invalid={!!error}
              onChange={(e) => {
                const id = e.target.value || null
                // Mục mới chưa có tiêu đề thì lấy tên đối tượng để đỡ gõ lại.
                const name = item.targetType === TARGET_CATEGORY ? categoryName(id) : pageTitle(id)
                onChange(item.key, { targetId: id, ...(!item.title.trim() && name ? { title: name } : {}) })
              }}
            >
              <option value="">— Chọn —</option>
              {missingTarget && <option value={item.targetId ?? ''}>(Không còn tồn tại)</option>}
              {item.targetType === TARGET_CATEGORY
                ? categories.map((c) => <option key={c.id} value={c.id}>{'  '.repeat(c.depth)}{c.name}{c.isActive ? '' : ' (ẩn)'}</option>)
                : pages.map((p) => <option key={p.id} value={p.id}>{p.title}{p.status === 'Published' ? '' : ' (nháp)'}</option>)}
            </Select>
          </FormField>
        )}
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Switch label="Hiển thị" checked={item.isActive} onChange={(e) => onChange(item.key, { isActive: e.target.checked })} className="mr-2" />
        <Button variant="ghost" size="sm" aria-label={`Chuyển lên: ${label}`} disabled={!canMove(tree, item.key, -1)} onClick={() => onTree(moveNode(tree, item.key, -1))}><ArrowUp className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" aria-label={`Chuyển xuống: ${label}`} disabled={!canMove(tree, item.key, 1)} onClick={() => onTree(moveNode(tree, item.key, 1))}><ArrowDown className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" aria-label={`Thụt vào: ${label}`} title={canIndent(tree, item.key) ? 'Thụt vào (thành con của mục phía trên)' : 'Không thụt vào được'} disabled={!canIndent(tree, item.key)} onClick={() => onTree(indentNode(tree, item.key))}><ChevronsRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" aria-label={`Đưa ra: ${label}`} title="Đưa ra (lên cấp cha)" disabled={!canOutdent(tree, item.key)} onClick={() => onTree(outdentNode(tree, item.key))}><ChevronsLeft className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" aria-label={`Thêm mục con cho: ${label}`} title={canAddChild(tree, item.key) ? 'Thêm mục con' : `Tối đa ${MAX_DEPTH} cấp / ${MAX_ITEMS} mục`} disabled={!canAddChild(tree, item.key)} onClick={() => onTree(addNode(tree, item.key, createNode()))}><CornerDownRight className="h-4 w-4" /> <span className="hidden sm:inline">Mục con</span></Button>
        <Button variant="ghost" size="sm" className="ml-auto" aria-label={`Xoá mục: ${label}`} onClick={() => onTree(removeNode(tree, item.key))}><Trash2 className="h-4 w-4 text-danger" /></Button>
      </div>
      <span className="sr-only">Mục {index + 1} trên {siblings}, cấp {depth}</span>
    </li>
  )
}

/** Trình soạn cây mục của một menu; lưu cả cây bằng một lần PUT. */
export function MenuEditor({ menu, onDirtyChange, onDeleted }: { menu: MenuAdmin; onDirtyChange: (dirty: boolean) => void; onDeleted: () => void }) {
  const labels = useLabels()
  const meta = useMeta()
  const confirm = useConfirm()
  const save = useSaveMenu()
  const del = useDeleteMenu()
  const categories = useCategoryOptions()
  const pages = usePageOptions()

  const [name, setName] = useState(menu.name)
  const [tree, setTree] = useState<MenuNode[]>(() => fromDto(menu.items))
  const [saved, setSaved] = useState(() => snapshot(menu.name, fromDto(menu.items)))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string[]>([])
  const [nameError, setNameError] = useState<string | null>(null)

  const dirty = useMemo(() => snapshot(name, tree) !== saved, [name, tree, saved])
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const typeLabels: Record<string, string> = { [TARGET_CATEGORY]: labels.category, [TARGET_PAGE]: 'Trang nội dung', [TARGET_URL]: 'Liên kết tuỳ chọn' }
  const typeOptions = (meta.data?.menuTargetTypes ?? [TARGET_CATEGORY, TARGET_PAGE, TARGET_URL]).map((value) => ({ value, label: typeLabels[value] ?? value }))
  const flat = flatten(tree)
  const total = flat.length
  const isSystem = SYSTEM_MENUS.includes(menu.code)

  const edit = (next: MenuNode[]) => {
    // Chỉ số lỗi theo cây đã gửi, đổi cây thì không còn đúng nên xoá.
    setTree(next)
    setErrors({})
    setGeneral([])
  }

  const onSave = async () => {
    if (!name.trim()) { setNameError('Nhập tên menu.'); return }
    setNameError(null)
    const local = validateTree(tree, isSafeLink)
    if (Object.keys(local).length > 0) {
      setErrors(local)
      setGeneral([])
      toast.error(`Có ${Object.keys(local).length} mục chưa hợp lệ.`)
      return
    }
    const sent = tree
    try {
      const result = await save.mutateAsync({ id: menu.id, name: name.trim(), items: toRequestItems(sent) })
      const fresh = fromDto(result.items)
      setName(result.name)
      setTree(fresh) // mục mới nhận id từ backend
      setSaved(snapshot(result.name, fresh))
      setErrors({})
      setGeneral([])
      toast.success('Đã lưu menu')
    } catch (e) {
      if (e instanceof ApiError && e.details.length > 0) {
        const mapped = mapItemErrors(sent, e.details)
        setErrors(mapped.byKey)
        setGeneral(mapped.general)
        toast.error(e.message)
      } else {
        toastError(e, 'Không lưu được menu.')
      }
    }
  }

  const onDelete = async () => {
    if (!(await confirm({ title: `Xoá menu "${menu.name}"?`, message: 'Toàn bộ mục trong menu sẽ bị xoá. Không thể hoàn tác.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(menu.id)
      toast.success('Đã xoá menu')
      onDeleted()
    } catch (e) {
      toastError(e, 'Không xoá được menu.')
    }
  }

  const loadingOptions = categories.isLoading || pages.isLoading
  return (
    <Card>
      <CardHeader
        title={<>Menu <code className="rounded bg-surface-2 px-1 text-xs">{menu.code}</code> {isSystem && <Badge>Hệ thống</Badge>}</>}
        description={`Tối đa ${MAX_DEPTH} cấp và ${MAX_ITEMS} mục. Đang có ${total}/${MAX_ITEMS} mục.`}
        actions={
          <Can permission={P.MenuManage}>
            <div className="flex gap-2">
              {!isSystem && <Button variant="secondary" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4 text-danger" aria-hidden /> Xoá menu</Button>}
              <Button size="sm" onClick={onSave} loading={save.isPending} disabled={!dirty}>Lưu menu</Button>
            </div>
          </Can>
        }
      />
      <div className="space-y-4 p-4">
        <FormField label="Tên menu" htmlFor="menu-name" error={nameError ?? undefined} required className="max-w-sm">
          <Input id="menu-name" value={name} invalid={!!nameError} onChange={(e) => setName(e.target.value)} />
        </FormField>
        {isSystem && <p className="text-xs text-muted">Menu hệ thống dùng cho giao diện website nên không thể xoá.</p>}

        {general.length > 0 && <div role="alert" className="rounded-md border border-danger p-2 text-xs text-danger">{general.join(' ')}</div>}
        {(categories.error || pages.error) && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-danger p-2 text-xs text-danger">
            Không tải được danh sách {labels.category.toLowerCase()} hoặc trang.
            <Button size="sm" variant="secondary" onClick={() => { void categories.refetch(); void pages.refetch() }}>Thử lại</Button>
          </div>
        )}

        {tree.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted">Menu chưa có mục nào.</div>
        ) : (
          <ul className="space-y-2" aria-label="Các mục của menu" aria-busy={loadingOptions}>
            {flat.map((f) => (
              <ItemRow
                key={f.node.key}
                item={f.node}
                depth={f.depth}
                index={f.index}
                siblings={f.siblings}
                tree={tree}
                error={errors[f.node.key]}
                categories={categories.data ?? []}
                pages={pages.data ?? []}
                typeOptions={typeOptions}
                onChange={(key, patch) => edit(updateNode(tree, key, patch))}
                onTree={edit}
              />
            ))}
          </ul>
        )}

        <Button variant="secondary" disabled={!canAddChild(tree, null)} onClick={() => edit(addNode(tree, null, createNode()))}>
          <Plus className="h-4 w-4" aria-hidden /> Thêm mục
        </Button>
        {countNodes(tree) >= MAX_ITEMS && <p className="text-xs text-muted">Đã đạt tối đa {MAX_ITEMS} mục.</p>}
      </div>
    </Card>
  )
}
