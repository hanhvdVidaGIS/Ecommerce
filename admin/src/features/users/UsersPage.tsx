import { ChevronDown, ChevronUp, KeyRound, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { DataTable, EmptyState, PageHeader, Pagination, Tabs, type Column, type SortState } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives'
import { useLabels } from '@/api/hooks'
import { toastError } from '@/lib/forms'
import { formatDateTime } from '@/lib/format'
import { useDebounce } from '@/lib/useDebounce'
import { useRoles } from '@/features/roles/api'
import { useDeleteUser, useUsers, type AdminUser, type UserScope } from './api'
import { ResetPasswordModal } from './ResetPasswordModal'
import { UserFormModal } from './UserFormModal'

const PAGE_SIZE = 20

const SCOPES: { key: UserScope; label: string }[] = [
  { key: 'staff', label: 'Nhân viên' },
  { key: 'customer', label: 'Khách hàng' },
  { key: 'all', label: 'Tất cả' },
]

type SortKey = 'email' | 'fullName' | 'createdAt'

/** Chu kỳ sắp xếp giống DataTable: tăng → giảm → bỏ sắp xếp. */
function nextSort(current: SortState | null, key: SortKey): SortState | null {
  if (current?.key !== key) return { key, dir: 'asc' }
  return current.dir === 'asc' ? { key, dir: 'desc' } : null
}

function SortButton({ label, sortKey, sort, onToggle }: { label: string; sortKey: SortKey; sort: SortState | null; onToggle: (k: SortKey) => void }) {
  const active = sort?.key === sortKey
  return (
    <button type="button" onClick={() => onToggle(sortKey)} className="inline-flex items-center gap-1 hover:text-text" aria-label={`Sắp xếp theo ${label}`}>
      {label}
      {active && (sort!.dir === 'asc' ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />)}
    </button>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const labels = useLabels()
  const confirm = useConfirm()
  const [scope, setScope] = useState<UserScope>('staff')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState<'' | 'active' | 'locked'>('')
  const [sort, setSort] = useState<SortState | null>(null)
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null)
  const [resetting, setResetting] = useState<AdminUser | null>(null)
  const q = useDebounce(search.trim(), 300)
  const roles = useRoles()
  const del = useDeleteUser()
  const list = useUsers({
    scope, page, pageSize: PAGE_SIZE,
    q: q || undefined,
    role: role || undefined,
    isActive: status === '' ? undefined : status === 'active',
    sort: sort ? `${sort.key}:${sort.dir}` : undefined,
  })
  const roleName = (code: string) => roles.data?.find((r) => r.code === code)?.name ?? code
  const filtered = !!q || !!role || !!status

  const changeSort = (s: SortState | null) => { setSort(s); setPage(1) }

  const remove = async (u: AdminUser) => {
    if (!(await confirm({
      title: `Xoá người dùng "${u.fullName}"?`,
      message: `${u.email} sẽ bị xoá và đăng xuất khỏi mọi thiết bị. Email được giải phóng để dùng lại.`,
      confirmLabel: 'Xoá',
    }))) return
    try {
      await del.mutateAsync(u.id)
      toast.success('Đã xoá người dùng')
    } catch (e) {
      toastError(e, 'Không xoá được người dùng.')
    }
  }

  const columns: Column<AdminUser>[] = [
    {
      key: 'user',
      header: (
        <span className="inline-flex flex-wrap gap-x-2">
          <SortButton label="Họ tên" sortKey="fullName" sort={sort} onToggle={(k) => changeSort(nextSort(sort, k))} />
          <span aria-hidden>/</span>
          <SortButton label="Email" sortKey="email" sort={sort} onToggle={(k) => changeSort(nextSort(sort, k))} />
        </span>
      ),
      cell: (u) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{u.fullName}{u.id === me?.id && <span className="ml-2 text-xs font-normal text-muted">(Bạn)</span>}</p>
          <p className="truncate text-xs text-muted">{u.email}</p>
        </div>
      ),
    },
    {
      key: 'roles', header: 'Vai trò',
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => <Badge key={r} tone={r === 'SuperAdmin' ? 'info' : 'neutral'}>{roleName(r)}</Badge>)}
        </div>
      ),
    },
    { key: 'status', header: 'Trạng thái', cell: (u) => <Badge tone={u.isActive ? 'success' : 'danger'}>{u.isActive ? 'Đang hoạt động' : 'Bị khoá'}</Badge> },
    { key: 'created', header: 'Ngày tạo', sortKey: 'createdAt', hideOnMobile: true, cell: (u) => <span className="whitespace-nowrap text-muted">{formatDateTime(u.createdAt, labels.timezone)}</span> },
    {
      // `relative`: giữ chữ ẩn (sr-only, position:absolute) trong ô bảng, nếu không nó làm cả trang cuộn ngang.
      key: 'actions', header: <span className="relative"><span className="sr-only">Thao tác</span></span>, className: 'w-32 text-right',
      cell: (u) => {
        const isSelf = u.id === me?.id
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" aria-label={`Sửa ${u.email}`} onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" aria-label={`Đặt lại mật khẩu ${u.email}`} onClick={() => setResetting(u)}><KeyRound className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" aria-label={`Xoá ${u.email}`} title={isSelf ? 'Không thể tự xoá tài khoản của chính mình' : undefined} disabled={isSelf} onClick={() => remove(u)}><Trash2 className="h-4 w-4 text-danger" /></Button>
          </div>
        )
      },
    },
  ]

  const meta = list.data?.meta
  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Tài khoản nhân viên và khách hàng. Đổi vai trò hoặc khoá tài khoản sẽ đăng xuất người đó."
        actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Thêm người dùng</Button>}
      />
      <Card>
        <Tabs tabs={SCOPES} value={scope} onChange={(s) => { setScope(s); setPage(1) }} />
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Tìm theo email hoặc họ tên" placeholder="Tìm email, họ tên..." className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <Select aria-label="Lọc theo vai trò" className="w-auto min-w-36" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}>
            <option value="">Mọi vai trò</option>
            {roles.data?.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
          </Select>
          <Select aria-label="Lọc theo trạng thái" className="w-auto min-w-36" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1) }}>
            <option value="">Mọi trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Bị khoá</option>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.data}
          rowKey={(u) => u.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          sort={sort}
          onSortChange={changeSort}
          empty={
            <EmptyState
              title={filtered ? 'Không tìm thấy người dùng' : 'Chưa có người dùng nào'}
              description={filtered ? 'Thử đổi từ khoá hoặc bộ lọc.' : undefined}
              action={!filtered ? <Button onClick={() => setEditing('new')}>Thêm người dùng</Button> : undefined}
            />
          }
        />
        {meta && <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPageChange={setPage} />}
      </Card>
      {editing && <UserFormModal user={editing === 'new' ? null : editing} currentUserId={me?.id} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </>
  )
}
