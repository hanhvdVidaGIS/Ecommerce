import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { Modal } from '@/components/ui/overlays'
import { Button, Checkbox, FormField, Input, Skeleton, Switch } from '@/components/ui/primitives'
import { applyApiError, emptyToNull, toastError } from '@/lib/forms'
import { useRoles } from '@/features/roles/api'
import { useCreateUser, useUpdateUser, type AdminUser } from './api'
import { validatePassword } from './password'

const emailSchema = z.email('Email không hợp lệ.').max(255, 'Tối đa 255 ký tự')

/** Một schema cho cả thêm và sửa: email/mật khẩu chỉ bắt buộc khi thêm mới. */
function makeSchema(isNew: boolean) {
  return z
    .object({
      email: z.string().trim(),
      password: z.string(),
      fullName: z.string().trim().min(1, 'Nhập họ tên').max(200, 'Tối đa 200 ký tự'),
      phoneNumber: z.string().trim().max(30, 'Tối đa 30 ký tự'),
      isActive: z.boolean(),
      roleCodes: z.array(z.string()).min(1, 'Chọn ít nhất một vai trò'),
    })
    .superRefine((v, ctx) => {
      if (!isNew) return
      const email = emailSchema.safeParse(v.email)
      if (!email.success) ctx.addIssue({ code: 'custom', path: ['email'], message: v.email ? email.error.issues[0].message : 'Nhập email' })
      const pw = validatePassword(v.password)
      if (pw) ctx.addIssue({ code: 'custom', path: ['password'], message: pw })
    })
}
type Values = z.input<ReturnType<typeof makeSchema>>

/** Các trường backend có ô nhập riêng để hiện lỗi (roleCodes hiện ở nhóm vai trò). */
const VISIBLE_FIELDS = new Set(['email', 'password', 'fullName', 'phoneNumber', 'roleCodes'])

export function UserFormModal({ user, currentUserId, onClose }: { user: AdminUser | null; currentUserId: string | undefined; onClose: () => void }) {
  const isNew = !user
  const isSelf = !!user && user.id === currentUserId
  const roles = useRoles()
  const create = useCreateUser()
  const update = useUpdateUser()
  const [showPassword, setShowPassword] = useState(false)
  const form = useForm<Values>({
    resolver: zodResolver(makeSchema(isNew)),
    defaultValues: {
      email: user?.email ?? '',
      password: '',
      fullName: user?.fullName ?? '',
      phoneNumber: user?.phoneNumber ?? '',
      isActive: user?.isActive ?? true,
      roleCodes: user?.roles ?? [],
    },
  })
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = form
  const selected = watch('roleCodes')

  const toggleRole = (code: string, checked: boolean) =>
    setValue('roleCodes', checked ? [...selected, code] : selected.filter((c) => c !== code), { shouldValidate: true, shouldDirty: true })

  const onSubmit = handleSubmit(async (v) => {
    try {
      if (user) {
        await update.mutateAsync({ id: user.id, body: { fullName: v.fullName.trim(), phoneNumber: emptyToNull(v.phoneNumber), isActive: v.isActive, roleCodes: v.roleCodes } })
        const rolesChanged = [...user.roles].sort().join() !== [...v.roleCodes].sort().join()
        toast.success(rolesChanged || (user.isActive && !v.isActive) ? 'Đã lưu. Người dùng này sẽ phải đăng nhập lại.' : 'Đã lưu')
      } else {
        await create.mutateAsync({ email: v.email.trim(), password: v.password, fullName: v.fullName.trim(), phoneNumber: emptyToNull(v.phoneNumber), roleCodes: v.roleCodes })
        toast.success('Đã thêm người dùng')
      }
      onClose()
    } catch (e) {
      // email_taken không kèm trường cụ thể: gắn vào ô email để người dùng biết sửa ở đâu.
      if (e instanceof ApiError && e.code === 'email_taken') form.setError('email', { type: 'server', message: e.message })
      // Lỗi gắn vào trường không có ô nhập (vd. isActive: "không thể tự khoá") phải hiện bằng toast, nếu không sẽ bị nuốt.
      else if (e instanceof ApiError && e.details.some((d) => !VISIBLE_FIELDS.has(d.field))) toastError(e)
      else applyApiError(form, e)
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? 'Sửa người dùng' : 'Thêm người dùng'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="user-form" loading={isSubmitting}>Lưu</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Email" htmlFor="user-email" error={errors.email?.message} required={isNew}>
          <Input id="user-email" type="email" autoComplete="off" autoFocus={isNew} disabled={!isNew} invalid={!!errors.email} {...register('email')} />
        </FormField>
        {isNew && (
          <FormField label="Mật khẩu" htmlFor="user-password" error={errors.password?.message} hint="Tối thiểu 8 ký tự, gồm chữ cái và chữ số." required>
            <div className="relative">
              <Input id="user-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="pr-9" invalid={!!errors.password} {...register('password')} />
              <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-2 top-2.5 text-muted hover:text-text">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>
        )}
        <FormField label="Họ tên" htmlFor="user-name" error={errors.fullName?.message} required>
          <Input id="user-name" autoFocus={!isNew} invalid={!!errors.fullName} {...register('fullName')} />
        </FormField>
        <FormField label="Điện thoại" htmlFor="user-phone" error={errors.phoneNumber?.message}>
          <Input id="user-phone" type="tel" invalid={!!errors.phoneNumber} {...register('phoneNumber')} />
        </FormField>
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">Vai trò<span className="ml-0.5 text-danger" aria-hidden>*</span></legend>
          {roles.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div>
          ) : roles.error ? (
            <p role="alert" className="text-xs text-danger">Không tải được danh sách vai trò. <button type="button" className="underline" onClick={() => roles.refetch()}>Thử lại</button></p>
          ) : (
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {roles.data?.map((r) => (
                <Checkbox key={r.id} checked={selected.includes(r.code)} onChange={(e) => toggleRole(r.code, e.target.checked)} label={<span>{r.name} <span className="text-xs text-muted">({r.code})</span></span>} />
              ))}
            </div>
          )}
          {errors.roleCodes && <p role="alert" className="text-xs text-danger">{errors.roleCodes.message ?? 'Chọn ít nhất một vai trò'}</p>}
        </fieldset>
        {!isNew && (
          <div className="space-y-1">
            <Switch label="Tài khoản đang hoạt động" disabled={isSelf} {...register('isActive')} />
            {isSelf && <p className="text-xs text-muted">Không thể tự khoá tài khoản của chính mình.</p>}
          </div>
        )}
        {!isNew && (
          <p className="rounded-md bg-surface-2 p-3 text-xs text-muted">
            Đổi vai trò hoặc khoá tài khoản sẽ kết thúc mọi phiên đăng nhập của người này; họ phải đăng nhập lại để nhận quyền mới.
            {isSelf && ' Bạn đang sửa chính mình nên có thể bị đăng xuất.'}
          </p>
        )}
      </form>
    </Modal>
  )
}
