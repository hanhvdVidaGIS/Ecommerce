import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { ImageField } from '@/components/media/MediaPicker'
import { Modal } from '@/components/ui/overlays'
import { Button, FormField, Input } from '@/components/ui/primitives'
import { applyApiError, emptyToNull } from '@/lib/forms'
import { useSaveAttributeValue } from './api'
import { isHexColor, normalizeHex, nextValueSortOrder, type AttributeValue, type ValueKind } from './rules'

type Preview = { url: string; altText: string | null } | null

const baseShape = {
  label: z.string().trim().min(1, 'Nhập nhãn').max(200, 'Tối đa 200 ký tự'),
  code: z.string().trim().max(100, 'Tối đa 100 ký tự').regex(/^[a-z0-9][a-z0-9-]*$|^$/, 'Chữ thường, số, dấu gạch ngang'),
  sortOrder: z.coerce.number().int('Phải là số nguyên'),
}

// Trường theo kiểu: Color bắt buộc mã màu #RRGGBB; các kiểu khác không dùng ô màu.
const makeSchema = (kind: ValueKind) => z.object({
  ...baseShape,
  colorHex: kind === 'color' ? z.string().trim().refine(isHexColor, 'Nhập màu dạng #RRGGBB') : z.string(),
})
type Values = z.input<ReturnType<typeof makeSchema>>

/** Hộp thoại thêm/sửa một giá trị; trường hiển thị theo kiểu dữ liệu của thuộc tính. */
export function ValueFormModal({ attributeId, kind, value, values, onClose }: {
  attributeId: string
  kind: ValueKind
  value: AttributeValue | null
  values: readonly AttributeValue[]
  onClose: () => void
}) {
  const save = useSaveAttributeValue(attributeId)
  const schema = useMemo(() => makeSchema(kind), [kind])
  const [image, setImage] = useState<{ id: string | null; preview: Preview }>({ id: value?.imageMediaId ?? null, preview: value?.image ?? null })
  const [imageError, setImageError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { label: value?.label ?? '', code: value?.code ?? '', sortOrder: value?.sortOrder ?? nextValueSortOrder(values), colorHex: value?.colorHex ?? '#000000' },
  })
  const { register, handleSubmit, watch, setValue, formState: { errors } } = form
  const colorHex = watch('colorHex')

  const onSubmit = handleSubmit(async (v) => {
    if (kind === 'image' && !image.id) return setImageError('Chọn ảnh cho giá trị này')
    const data = schema.parse(v)
    try {
      await save.mutateAsync({
        valueId: value?.id,
        body: {
          code: emptyToNull(data.code),
          label: data.label,
          colorHex: kind === 'color' ? normalizeHex(data.colorHex) : null,
          imageMediaId: kind === 'image' ? image.id : null,
          sortOrder: data.sortOrder,
        },
      })
      toast.success('Đã lưu')
      onClose()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'code_taken') form.setError('code', { type: 'server', message: e.message })
      else applyApiError(form, e)
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={value ? 'Sửa giá trị' : 'Thêm giá trị'}
      footer={<><Button variant="secondary" onClick={onClose}>Huỷ</Button><Button type="submit" form="attribute-value-form">Lưu</Button></>}
    >
      <form id="attribute-value-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Nhãn" htmlFor="av-label" error={errors.label?.message} required>
          <Input id="av-label" autoFocus invalid={!!errors.label} {...register('label')} />
        </FormField>
        <FormField label="Mã" htmlFor="av-code" error={errors.code?.message} hint="Tuỳ chọn; để trống để tự tạo từ nhãn.">
          <Input id="av-code" invalid={!!errors.code} {...register('code')} />
        </FormField>
        {kind === 'color' && (
          <FormField label="Màu" htmlFor="av-hex" error={errors.colorHex?.message} required>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Chọn màu"
                value={normalizeHex(colorHex) ?? '#000000'}
                onChange={(e) => setValue('colorHex', e.target.value.toUpperCase(), { shouldValidate: true, shouldDirty: true })}
                className="h-9 w-12 cursor-pointer rounded-md border border-border bg-surface p-1"
              />
              <Input id="av-hex" invalid={!!errors.colorHex} className="max-w-36 font-mono" placeholder="#RRGGBB" {...register('colorHex')} />
            </div>
          </FormField>
        )}
        {kind === 'image' && (
          <div className="space-y-1">
            <ImageField label="Ảnh" value={image.id} preview={image.preview} onChange={(id, preview) => { setImage({ id, preview }); setImageError(null) }} />
            {imageError && <p role="alert" className="text-xs text-danger">{imageError}</p>}
          </div>
        )}
        <FormField label="Thứ tự" htmlFor="av-sort" error={errors.sortOrder?.message} className="w-28">
          <Input id="av-sort" type="number" {...register('sortOrder')} />
        </FormField>
      </form>
    </Modal>
  )
}
