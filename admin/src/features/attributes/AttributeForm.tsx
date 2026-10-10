import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { useEnumLabel, useMeta } from '@/api/hooks'
import { Checkbox, FormField, Input, Select, Switch } from '@/components/ui/primitives'
import { applyApiError, emptyToNull } from '@/lib/forms'
import { useSaveAttribute } from './api'
import { VARIANT_TYPES, flagRestrictions, normalizeFlags, validateFlags, type Attribute, type AttributeDataType } from './rules'

const DATA_TYPES = ['Text', 'Number', 'Select', 'MultiSelect', 'Color', 'Boolean', 'Image'] as const satisfies readonly AttributeDataType[]

const schema = z.object({
  code: z.string().trim().min(1, 'Nhập mã').max(50, 'Tối đa 50 ký tự').regex(/^[a-z][a-z0-9-]*$/, 'Chữ thường, số, dấu gạch ngang; bắt đầu bằng chữ cái'),
  name: z.string().trim().min(1, 'Nhập tên').max(100, 'Tối đa 100 ký tự'),
  dataType: z.enum(DATA_TYPES),
  unit: z.string().trim().max(20, 'Tối đa 20 ký tự'),
  isFilterable: z.boolean(),
  isVariantOption: z.boolean(),
  isRequired: z.boolean(),
  isVisibleOnProduct: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int('Phải là số nguyên'),
}).superRefine((v, ctx) => {
  // Cùng quy tắc với backend: chặn ngay thay vì đợi bị từ chối.
  for (const [field, message] of Object.entries(validateFlags(v.dataType, v))) ctx.addIssue({ code: 'custom', path: [field], message })
})
type Values = z.input<typeof schema>

function toValues(a: Attribute | null): Values {
  return {
    code: a?.code ?? '',
    name: a?.name ?? '',
    dataType: a?.dataType ?? 'Select',
    unit: a?.unit ?? '',
    isFilterable: a?.isFilterable ?? false,
    isVariantOption: a?.isVariantOption ?? false,
    isRequired: a?.isRequired ?? false,
    isVisibleOnProduct: a?.isVisibleOnProduct ?? true,
    isActive: a?.isActive ?? true,
    sortOrder: a?.sortOrder ?? 0,
  }
}

/**
 * Form thuộc tính dùng chung cho hộp thoại "Thêm" và tab "Thông tin". `actions` là nút lưu đặt trong form (tab);
 * hộp thoại thì đặt nút lưu ở chân và trỏ tới `formId`.
 */
export function AttributeForm({ formId, attribute, readOnly, actions, onSaved }: {
  formId: string
  attribute: Attribute | null
  readOnly?: boolean
  actions?: ReactNode
  onSaved: (saved: Attribute) => void
}) {
  const save = useSaveAttribute()
  const { data: meta } = useMeta()
  const typeLabel = useEnumLabel('AttributeDataType')
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(attribute) })
  const { register, handleSubmit, watch, getValues, setValue, formState: { errors } } = form
  const isEdit = !!attribute

  const dataType = watch('dataType')
  const lock = flagRestrictions(dataType, { isVariantOption: watch('isVariantOption') })
  const variantTypeNames = VARIANT_TYPES.map(typeLabel).join(', ')
  const typeOptions = meta?.enums?.AttributeDataType ?? DATA_TYPES.map((t) => ({ value: t, label: t }))

  const onSubmit = handleSubmit(async (v) => {
    const data = schema.parse(v)
    try {
      const saved = await save.mutateAsync({
        id: attribute?.id,
        body: {
          code: data.code, name: data.name, dataType: data.dataType, unit: emptyToNull(data.unit),
          isFilterable: data.isFilterable, isVariantOption: data.isVariantOption, isRequired: data.isRequired,
          isVisibleOnProduct: data.isVisibleOnProduct, isActive: data.isActive, sortOrder: data.sortOrder,
        },
      })
      toast.success('Đã lưu')
      form.reset(toValues(saved))
      onSaved(saved)
    } catch (e) {
      // code_taken là lỗi xung đột không kèm tên trường nên gắn tay vào ô mã.
      if (e instanceof ApiError && e.code === 'code_taken') form.setError('code', { type: 'server', message: e.message })
      else applyApiError(form, e)
    }
  })

  return (
    <form id={formId} onSubmit={onSubmit} noValidate>
      <fieldset disabled={readOnly} className="min-w-0 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mã" htmlFor={`${formId}-code`} error={errors.code?.message} required
            hint={isEdit ? 'Mã không đổi được sau khi tạo (nằm trong đường dẫn bộ lọc).' : 'Chữ thường, số, dấu gạch ngang. Không đổi được sau khi tạo.'}>
            <Input id={`${formId}-code`} autoFocus={!isEdit} readOnly={isEdit} invalid={!!errors.code} className={isEdit ? 'bg-surface-2 text-muted' : undefined} {...register('code')} />
          </FormField>
          <FormField label="Tên" htmlFor={`${formId}-name`} error={errors.name?.message} required>
            <Input id={`${formId}-name`} invalid={!!errors.name} {...register('name')} />
          </FormField>
          <FormField label="Kiểu dữ liệu" htmlFor={`${formId}-type`} error={errors.dataType?.message} hint={isEdit ? 'Không đổi được khi thuộc tính đã được gán cho sản phẩm hoặc còn danh sách giá trị.' : undefined}>
            <Select
              id={`${formId}-type`}
              invalid={!!errors.dataType}
              {...register('dataType', {
                // Đổi kiểu thì tắt các cờ không còn hợp lệ để người dùng không phải đoán.
                onChange: (e) => {
                  const next = normalizeFlags(e.target.value as AttributeDataType, getValues())
                  setValue('isFilterable', next.isFilterable)
                  setValue('isVariantOption', next.isVariantOption)
                  setValue('isRequired', next.isRequired)
                },
              })}
            >
              {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Đơn vị" htmlFor={`${formId}-unit`} error={errors.unit?.message} hint="Tuỳ chọn, ví dụ cm, kg.">
            <Input id={`${formId}-unit`} invalid={!!errors.unit} {...register('unit')} />
          </FormField>
          <FormField label="Thứ tự" htmlFor={`${formId}-sort`} error={errors.sortOrder?.message} className="sm:w-32">
            <Input id={`${formId}-sort`} type="number" {...register('sortOrder')} />
          </FormField>
        </div>

        <div className="space-y-2.5 rounded-md border border-border p-3">
          <p className="text-xs font-medium">Tuỳ chọn</p>
          <FlagRow error={errors.isFilterable?.message} hint={lock.isFilterable ? `Kiểu ${typeLabel(dataType)} không dùng làm bộ lọc.` : 'Hiển thị trong bộ lọc ở trang danh mục.'}>
            <Checkbox label="Lọc được" disabled={!!lock.isFilterable} {...register('isFilterable')} />
          </FlagRow>
          <FlagRow error={errors.isVariantOption?.message} hint={lock.isVariantOption ? `Chỉ dùng cho kiểu ${variantTypeNames}.` : 'Dùng để tạo biến thể sản phẩm (ví dụ kích cỡ, màu sắc).'}>
            <Checkbox
              label="Tạo biến thể"
              disabled={!!lock.isVariantOption}
              {...register('isVariantOption', { onChange: (e) => { if (e.target.checked) setValue('isRequired', false) } })}
            />
          </FlagRow>
          <FlagRow hint={lock.isRequired ? 'Thuộc tính tạo biến thể không áp dụng “bắt buộc”.' : 'Sản phẩm phải có giá trị cho thuộc tính này.'}>
            <Checkbox label="Bắt buộc" disabled={!!lock.isRequired} {...register('isRequired')} />
          </FlagRow>
          <FlagRow hint="Hiển thị trong thông số trên trang sản phẩm.">
            <Checkbox label="Hiện trên sản phẩm" {...register('isVisibleOnProduct')} />
          </FlagRow>
          <Switch label="Bật" {...register('isActive')} />
        </div>
        {actions}
      </fieldset>
    </form>
  )
}

function FlagRow({ children, hint, error }: { children: ReactNode; hint?: string; error?: string }) {
  return (
    <div>
      {children}
      {error ? <p role="alert" className="ml-6 text-xs text-danger">{error}</p> : hint ? <p className="ml-6 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
