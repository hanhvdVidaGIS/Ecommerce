import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useLabels } from '@/api/hooks'
import { ImageField } from '@/components/media/MediaPicker'
import { Modal } from '@/components/ui/overlays'
import { Button, FormField, Input, Switch, Textarea } from '@/components/ui/primitives'
import { applyApiError, emptyToNull } from '@/lib/forms'
import { useSaveBrand, type Brand } from './api'

const schema = z.object({
  name: z.string().trim().min(1, 'Nhập tên').max(200, 'Tối đa 200 ký tự'),
  slug: z.string().trim().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$|^$/, 'Chỉ gồm chữ thường, số và dấu gạch ngang'),
  description: z.string().max(2000, 'Tối đa 2000 ký tự'),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int('Phải là số nguyên'),
})
type Values = z.input<typeof schema>

/** Mẫu form CRUD trong hộp thoại: react-hook-form + zod, lỗi theo trường từ backend gắn vào đúng ô nhập. */
export function BrandFormModal({ brand, onClose }: { brand: Brand | null; onClose: () => void }) {
  const labels = useLabels()
  const save = useSaveBrand()
  const [logo, setLogo] = useState<{ id: string | null; preview: { url: string; altText: string | null } | null }>({
    id: brand?.logoMediaId ?? null,
    preview: brand?.logo ?? null,
  })
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: brand?.name ?? '', slug: brand?.slug ?? '', description: brand?.description ?? '', isActive: brand?.isActive ?? true, sortOrder: brand?.sortOrder ?? 0 },
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form

  const onSubmit = handleSubmit(async (v) => {
    const data = schema.parse(v)
    try {
      await save.mutateAsync({
        id: brand?.id,
        body: { name: data.name, slug: emptyToNull(data.slug), description: emptyToNull(data.description), logoMediaId: logo.id, isActive: data.isActive, sortOrder: data.sortOrder },
      })
      toast.success('Đã lưu')
      onClose()
    } catch (e) {
      applyApiError(form, e)
    }
  })

  const noun = labels.brand.toLowerCase()
  return (
    <Modal
      open
      onClose={onClose}
      title={brand ? `Sửa ${noun}` : `Thêm ${noun}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="brand-form" loading={isSubmitting}>Lưu</Button>
        </>
      }
    >
      <form id="brand-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Tên" htmlFor="brand-name" error={errors.name?.message} required>
          <Input id="brand-name" autoFocus invalid={!!errors.name} {...register('name')} />
        </FormField>
        <FormField label="Slug" htmlFor="brand-slug" error={errors.slug?.message} hint="Để trống để tự tạo từ tên.">
          <Input id="brand-slug" invalid={!!errors.slug} {...register('slug')} />
        </FormField>
        <FormField label="Mô tả" htmlFor="brand-desc" error={errors.description?.message}>
          <Textarea id="brand-desc" rows={3} {...register('description')} />
        </FormField>
        <ImageField label="Logo" value={logo.id} preview={logo.preview} onChange={(id, preview) => setLogo({ id, preview })} />
        <div className="flex flex-wrap items-end gap-4">
          <FormField label="Thứ tự" htmlFor="brand-sort" error={errors.sortOrder?.message} className="w-28">
            <Input id="brand-sort" type="number" {...register('sortOrder')} />
          </FormField>
          <Switch label="Hiển thị" {...register('isActive')} />
        </div>
      </form>
    </Modal>
  )
}
