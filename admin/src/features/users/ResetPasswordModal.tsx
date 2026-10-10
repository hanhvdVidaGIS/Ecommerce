import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Modal } from '@/components/ui/overlays'
import { Button, FormField, Input } from '@/components/ui/primitives'
import { applyApiError } from '@/lib/forms'
import { useResetPassword, type AdminUser } from './api'
import { validatePassword } from './password'

const schema = z.object({
  newPassword: z.string().superRefine((v, ctx) => {
    const issue = validatePassword(v)
    if (issue) ctx.addIssue({ code: 'custom', message: issue })
  }),
})
type Values = z.input<typeof schema>

export function ResetPasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const reset = useResetPassword()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { newPassword: '' } })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form

  const onSubmit = handleSubmit(async (v) => {
    try {
      await reset.mutateAsync({ id: user.id, newPassword: v.newPassword })
      toast.success('Đã đặt lại mật khẩu')
      onClose()
    } catch (e) {
      applyApiError(form, e, 'Không đặt lại được mật khẩu.')
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Đặt lại mật khẩu"
      description={`${user.fullName} · ${user.email}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="reset-password-form" loading={isSubmitting}>Đặt lại</Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={onSubmit} noValidate className="space-y-3">
        <FormField label="Mật khẩu mới" htmlFor="reset-password" error={errors.newPassword?.message} hint="Tối thiểu 8 ký tự, gồm chữ cái và chữ số." required>
          <Input id="reset-password" type="password" autoComplete="new-password" autoFocus invalid={!!errors.newPassword} {...register('newPassword')} />
        </FormField>
        <p className="rounded-md bg-surface-2 p-3 text-xs text-muted">Mọi phiên đăng nhập hiện có của người này sẽ bị kết thúc.</p>
      </form>
    </Modal>
  )
}
