import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { Modal } from '@/components/ui/overlays'
import { Button, FormField, Input } from '@/components/ui/primitives'
import { applyApiError } from '@/lib/forms'
import { useCreateRole } from './api'
import { ROLE_NAME_MAX } from './matrix'

const schema = z.object({
  code: z.string().trim().min(1, 'Nhập mã vai trò').max(50, 'Tối đa 50 ký tự').regex(/^[A-Za-z][A-Za-z0-9]*$/, 'Mã chỉ gồm chữ và số, bắt đầu bằng chữ.'),
  name: z.string().trim().min(1, 'Nhập tên vai trò').max(ROLE_NAME_MAX, `Tối đa ${ROLE_NAME_MAX} ký tự`),
})
type Values = z.input<typeof schema>

export function CreateRoleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateRole()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { code: '', name: '' } })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form

  const onSubmit = handleSubmit(async (v) => {
    try {
      const created = await create.mutateAsync({ code: v.code.trim(), name: v.name.trim(), permissionCodes: [] })
      toast.success('Đã tạo vai trò. Hãy chọn quyền rồi lưu.')
      onCreated(created.id)
      onClose()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'code_taken') form.setError('code', { type: 'server', message: e.message })
      else applyApiError(form, e, 'Không tạo được vai trò.')
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Tạo vai trò tuỳ chỉnh"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="create-role-form" loading={isSubmitting}>Tạo</Button>
        </>
      }
    >
      <form id="create-role-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Mã vai trò" htmlFor="role-code" error={errors.code?.message} hint="Chỉ gồm chữ và số, bắt đầu bằng chữ; không đổi được sau khi tạo." required>
          <Input id="role-code" autoFocus autoComplete="off" invalid={!!errors.code} {...register('code')} />
        </FormField>
        <FormField label="Tên hiển thị" htmlFor="role-name" error={errors.name?.message} required>
          <Input id="role-name" autoComplete="off" invalid={!!errors.name} {...register('name')} />
        </FormField>
      </form>
    </Modal>
  )
}
