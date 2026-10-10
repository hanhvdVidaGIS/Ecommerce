import { Info, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { useAuth } from '@/auth/AuthProvider'
import { Can } from '@/auth/guards'
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, FormField, Input, Skeleton } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { cn } from '@/lib/utils'
import { useDeleteRole, usePermissionCatalog, useRole, useRoles, useUpdateRole, type RoleDetail, type RoleListItem } from './api'
import { CreateRoleModal } from './CreateRoleModal'
import { canSave, diffCodes, isDirty, payloadCodes, ROLE_NAME_MAX, type PermissionItem } from './matrix'
import { PermissionMatrix } from './PermissionMatrix'

const SUPER_ADMIN = 'SuperAdmin'

export default function RolesPage() {
  const confirm = useConfirm()
  const roles = useRoles()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const dirtyRef = useRef(false)
  const detailRef = useRef<HTMLDivElement>(null)

  // Mặc định chọn vai trò đầu tiên; nếu vai trò đang chọn bị xoá thì chuyển về vai trò đầu.
  const list = roles.data
  const effectiveId = list?.some((r) => r.id === selectedId) ? selectedId : (list?.[0]?.id ?? null)

  const select = async (id: string) => {
    if (id === effectiveId) return
    if (dirtyRef.current && !(await confirm({ title: 'Bỏ thay đổi chưa lưu?', message: 'Vai trò đang sửa có thay đổi chưa lưu và sẽ bị mất.', confirmLabel: 'Bỏ thay đổi' }))) return
    dirtyRef.current = false
    setSelectedId(id)
    // Điện thoại: chi tiết nằm dưới danh sách nên cuộn tới đó.
    if (window.matchMedia('(max-width: 1023px)').matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <>
      <PageHeader
        title="Vai trò & quyền"
        description="Quyền gán cho từng vai trò. Quản lý người dùng, vai trò và phân quyền luôn chỉ dành cho Super Admin."
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Tạo vai trò</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr] lg:items-start">
        <Card className="overflow-hidden">
          {roles.isLoading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : roles.error ? (
            <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
          ) : !list || list.length === 0 ? (
            <EmptyState title="Chưa có vai trò nào" action={<Button onClick={() => setCreating(true)}>Tạo vai trò</Button>} />
          ) : (
            <ul aria-label="Danh sách vai trò" className="divide-y divide-border">
              {list.map((r) => <RoleRow key={r.id} role={r} active={r.id === effectiveId} onSelect={() => select(r.id)} />)}
            </ul>
          )}
        </Card>
        <div ref={detailRef} className="min-w-0 scroll-mt-4">
          {effectiveId && <RoleEditor key={effectiveId} roleId={effectiveId} onDirtyChange={(d) => { dirtyRef.current = d }} />}
        </div>
      </div>
      {creating && <CreateRoleModal onClose={() => setCreating(false)} onCreated={(id) => { dirtyRef.current = false; setSelectedId(id) }} />}
    </>
  )
}

function RoleRow({ role, active, onSelect }: { role: RoleListItem; active: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn('flex w-full items-start justify-between gap-2 px-4 py-3 text-left transition hover:bg-surface-2', active && 'bg-surface-2')}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{role.name}</span>
            {role.isSystem && <Badge tone="info">Hệ thống</Badge>}
          </span>
          <span className="block truncate font-mono text-[11px] text-muted">{role.code}</span>
        </span>
        <span className="shrink-0 text-right text-xs text-muted">
          <span className="block">{role.permissionCount} quyền</span>
          <span className="block">{role.userCount} người dùng</span>
        </span>
      </button>
    </li>
  )
}

function RoleEditor({ roleId, onDirtyChange }: { roleId: string; onDirtyChange: (dirty: boolean) => void }) {
  const detail = useRole(roleId)
  const { can } = useAuth()
  const canPerm = can(P.PermissionManage)
  const catalog = usePermissionCatalog(canPerm)

  if (detail.isLoading || (canPerm && catalog.isLoading)) {
    return <Card className="space-y-3 p-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-24" /><Skeleton className="h-24" /></Card>
  }
  const error = detail.error ?? (canPerm ? catalog.error : null)
  if (error || !detail.data) {
    return <Card><ErrorState error={error} onRetry={() => { detail.refetch(); if (canPerm) catalog.refetch() }} /></Card>
  }
  return <RoleEditorBody detail={detail.data} catalog={catalog.data} canPerm={canPerm} onDirtyChange={onDirtyChange} />
}

/** Không có Permission.Manage thì không gọi được danh mục quyền: dựng tạm từ các mã của vai trò để vẫn xem được (chỉ đọc). */
function fallbackCatalog(codes: string[]): PermissionItem[] {
  return codes.map((code) => ({ group: code.split('.')[0], code, description: code, superAdminOnly: false }))
}

function RoleEditorBody({ detail, catalog, canPerm, onDirtyChange }: { detail: RoleDetail; catalog: PermissionItem[] | undefined; canPerm: boolean; onDirtyChange: (dirty: boolean) => void }) {
  const confirm = useConfirm()
  const update = useUpdateRole()
  const del = useDeleteRole()
  const { can } = useAuth()
  const isSuper = detail.code === SUPER_ADMIN
  const readOnly = isSuper || !canPerm
  const perms = useMemo(() => catalog ?? fallbackCatalog(detail.permissionCodes), [catalog, detail.permissionCodes])
  const [name, setName] = useState(detail.name)
  const [codes, setCodes] = useState<Set<string>>(() => new Set(detail.permissionCodes))
  const draft = { originalName: detail.name, originalCodes: detail.permissionCodes, name, codes }
  const dirty = isDirty(draft)
  const saveable = canSave(draft, { readOnly, saving: update.isPending })
  // Tên chỉ đổi được ở vai trò tuỳ chỉnh; vai trò hệ thống giữ tên gốc.
  const nameEditable = !detail.isSystem && !readOnly

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const diff = diffCodes(detail.permissionCodes, codes)
  const assignableTotal = isSuper ? perms.length : perms.filter((p) => !p.superAdminOnly).length

  const save = async () => {
    try {
      await update.mutateAsync({ id: detail.id, body: { name: name.trim(), permissionCodes: payloadCodes(codes, perms) } })
      toast.success('Đã lưu vai trò')
    } catch (e) {
      // Lỗi theo trường (permissionCodes/name) không có ô riêng ở đây: thông điệp backend được hiện bằng toast.
      toastError(e, 'Không lưu được vai trò.')
    }
  }

  const undo = () => { setName(detail.name); setCodes(new Set(detail.permissionCodes)) }

  const remove = async () => {
    if (detail.userCount > 0) {
      toast.error(`Vai trò đang được gán cho ${detail.userCount} người dùng. Hãy chuyển họ sang vai trò khác trước khi xoá.`)
      return
    }
    if (!(await confirm({ title: `Xoá vai trò "${detail.name}"?`, message: 'Hành động này không hoàn tác được.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(detail.id)
      toast.success('Đã xoá vai trò')
    } catch (e) {
      toastError(e, 'Không xoá được vai trò.')
    }
  }

  return (
    <Card>
      {/* Dính đầu khung để nút Lưu/Hoàn tác luôn thấy khi cuộn qua ma trận dài. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 rounded-t-lg border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0 flex-1 basis-56">
          {nameEditable ? (
            <FormField label="Tên vai trò" htmlFor="role-edit-name" error={name.trim() === '' ? 'Nhập tên vai trò' : name.trim().length > ROLE_NAME_MAX ? `Tối đa ${ROLE_NAME_MAX} ký tự` : undefined}>
              <Input id="role-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
          ) : (
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">{detail.name}{detail.isSystem && <Badge tone="info">Hệ thống</Badge>}</h2>
          )}
          <p className="mt-1 text-xs text-muted">
            <span className="font-mono">{detail.code}</span> · Đã chọn {codes.size}/{assignableTotal} quyền · {detail.userCount} người dùng
            {dirty && !readOnly && <span className="ml-2 text-amber-700">(+{diff.added.length} / −{diff.removed.length} chưa lưu)</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <>
              <Button variant="secondary" onClick={undo} disabled={!dirty || update.isPending}><RotateCcw className="h-4 w-4" aria-hidden /> Hoàn tác</Button>
              <Button onClick={save} disabled={!saveable} loading={update.isPending}>Lưu</Button>
            </>
          )}
          {!detail.isSystem && can(P.RoleManage) && (
            <Button variant="ghost" onClick={remove} loading={del.isPending} aria-label={`Xoá vai trò ${detail.name}`}><Trash2 className="h-4 w-4 text-danger" aria-hidden /></Button>
          )}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-2 rounded-md bg-surface-2 p-3 text-xs text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p>Quyền thay đổi chỉ có hiệu lực ở lần đăng nhập hoặc làm mới phiên tiếp theo của người dùng (token chứa quyền).</p>
            {isSuper && <p>Super Admin luôn có toàn bộ quyền và không chỉnh sửa được.</p>}
            {!isSuper && !canPerm && <Can permission={P.RoleManage}><p>Bạn không có quyền phân quyền (Permission.Manage) nên chỉ xem được.</p></Can>}
            {!isSuper && <p>Các quyền có biểu tượng khoá (quản lý người dùng, vai trò, phân quyền) chỉ dành cho Super Admin và không gán được.</p>}
          </div>
        </div>
        {perms.length === 0 ? (
          <EmptyState title="Chưa có quyền nào" />
        ) : (
          <PermissionMatrix permissions={perms} selected={codes} onChange={setCodes} readOnly={readOnly} isSuperAdminRole={isSuper} />
        )}
      </div>
    </Card>
  )
}
