import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { P } from '@/api/catalog.generated'
import { ApiError } from '@/api/client'
import { Can } from '@/auth/guards'
import { UnsavedChangesGuard } from '@/components/content/UnsavedChangesGuard'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/data'
import { Modal, useConfirm } from '@/components/ui/overlays'
import { Button, Card, FormField, Input, Skeleton } from '@/components/ui/primitives'
import { applyApiError } from '@/lib/forms'
import { cn } from '@/lib/utils'
import { useCreateMenu, useMenu, useMenus } from './api'
import { MenuEditor } from './MenuEditor'

const createSchema = z.object({
  code: z.string().trim().min(1, 'Nhập mã menu').max(50, 'Tối đa 50 ký tự').regex(/^[a-z][a-z0-9-]*$/, 'Bắt đầu bằng chữ thường; chỉ gồm chữ thường, số và dấu gạch ngang'),
  name: z.string().trim().min(1, 'Nhập tên menu').max(100, 'Tối đa 100 ký tự'),
})
type CreateValues = z.infer<typeof createSchema>

function CreateMenuModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateMenu()
  const form = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: { code: '', name: '' } })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form
  const onSubmit = handleSubmit(async (v) => {
    try {
      const menu = await create.mutateAsync(v)
      toast.success('Đã tạo menu')
      onCreated(menu.id)
    } catch (e) {
      // Backend báo trùng mã bằng mã lỗi (không có chi tiết theo trường) nên tự gắn vào ô "Mã menu".
      if (e instanceof ApiError && e.code === 'code_taken') form.setError('code', { type: 'server', message: e.message })
      else applyApiError(form, e)
    }
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Thêm menu"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="menu-create-form" loading={isSubmitting}>Tạo menu</Button>
        </>
      }
    >
      <form id="menu-create-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Mã menu" htmlFor="menu-code" error={errors.code?.message} hint="Chữ thường, số, gạch ngang; không đổi được sau khi tạo." required>
          <Input id="menu-code" autoFocus invalid={!!errors.code} {...register('code')} />
        </FormField>
        <FormField label="Tên menu" htmlFor="menu-new-name" error={errors.name?.message} required>
          <Input id="menu-new-name" invalid={!!errors.name} {...register('name')} />
        </FormField>
      </form>
    </Modal>
  )
}

function SelectedMenu({ id, onDirtyChange, onDeleted }: { id: string; onDirtyChange: (d: boolean) => void; onDeleted: () => void }) {
  const q = useMenu(id)
  if (q.error) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
  if (!q.data) {
    return (
      <Card className="space-y-3 p-4" aria-busy>
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}
      </Card>
    )
  }
  // key theo id: đổi menu thì dựng lại trạng thái soạn từ dữ liệu của menu đó.
  return <MenuEditor key={q.data.id} menu={q.data} onDirtyChange={onDirtyChange} onDeleted={onDeleted} />
}

export default function MenusPage() {
  const confirm = useConfirm()
  const list = useMenus()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const menus = list.data
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), [])

  // Tự chọn menu đầu tiên khi chưa chọn (lần đầu hoặc sau khi xoá). Không kiểm tra "có trong danh sách" vì menu vừa tạo
  // được chọn trước khi danh sách kịp tải lại.
  useEffect(() => {
    if (!selectedId && menus && menus.length > 0) setSelectedId(menus[0].id)
  }, [menus, selectedId])

  const select = async (id: string) => {
    if (id === selectedId) return
    if (dirty && !(await confirm({ title: 'Chuyển menu khi chưa lưu?', message: 'Các thay đổi chưa lưu của menu hiện tại sẽ bị mất.', confirmLabel: 'Chuyển menu' }))) return
    setDirty(false)
    setSelectedId(id)
  }

  // Tạo menu mới sẽ chuyển sang menu đó nên cũng phải hỏi khi đang có thay đổi chưa lưu.
  const openCreate = async () => {
    if (dirty && !(await confirm({ title: 'Tạo menu khi chưa lưu?', message: 'Các thay đổi chưa lưu của menu hiện tại sẽ bị mất.', confirmLabel: 'Tiếp tục' }))) return
    setCreating(true)
  }

  return (
    <>
      <UnsavedChangesGuard when={dirty} />
      <PageHeader
        title="Menu"
        description="Menu điều hướng trên website. Chọn menu rồi chỉnh các mục."
        actions={<Can permission={P.MenuManage}><Button onClick={openCreate}><Plus className="h-4 w-4" aria-hidden /> Thêm menu</Button></Can>}
      />
      {list.error ? (
        <Card><ErrorState error={list.error} onRetry={() => list.refetch()} /></Card>
      ) : list.isLoading || !menus ? (
        <Card className="space-y-3 p-4" aria-busy>{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10" />)}</Card>
      ) : menus.length === 0 ? (
        <Card><EmptyState title="Chưa có menu nào" action={<Button onClick={openCreate}>Thêm menu</Button>} /></Card>
      ) : (
        <div className="space-y-4">
          <ul aria-label="Danh sách menu" className="flex flex-wrap gap-2">
            {menus.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  aria-current={m.id === selectedId}
                  onClick={() => select(m.id)}
                  className={cn('rounded-md border px-3 py-2 text-left text-sm hover:bg-surface-2', m.id === selectedId ? 'border-accent bg-surface-2 font-medium' : 'border-border bg-surface')}
                >
                  <span className="block">{m.name}</span>
                  <span className="block text-xs text-muted">{m.code} · {m.itemCount} mục</span>
                </button>
              </li>
            ))}
          </ul>
          {selectedId && <SelectedMenu id={selectedId} onDirtyChange={onDirtyChange} onDeleted={() => { setDirty(false); setSelectedId(null) }} />}
        </div>
      )}
      {creating && (
        <CreateMenuModal
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); setDirty(false); setSelectedId(id) }}
        />
      )}
    </>
  )
}
