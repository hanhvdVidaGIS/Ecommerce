import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useLabels } from '@/api/hooks'
import { Modal } from '@/components/ui/overlays'
import { Button, FormField, Input, Select, Switch } from '@/components/ui/primitives'
import { applyApiError } from '@/lib/forms'
import { useProvinces, useSaveShippingRate } from './api'
import { shippingSchema, toFormValues, toPayload, type ShippingFormValues, type ShippingRate } from './model'

/** Thêm/sửa mức phí vận chuyển. Tỉnh để trống = áp dụng mọi tỉnh/thành. */
export function ShippingRateFormModal({ rate, defaultSortOrder, onClose }: { rate: ShippingRate | null; defaultSortOrder: number; onClose: () => void }) {
  const { currency } = useLabels()
  const provinces = useProvinces()
  const save = useSaveShippingRate()

  const form = useForm<ShippingFormValues>({
    resolver: zodResolver(shippingSchema),
    defaultValues: toFormValues(rate, defaultSortOrder),
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form

  // Tỉnh đang lưu có thể chưa nằm trong danh sách (đang tải/lỗi): vẫn hiện để không làm mất giá trị khi lưu.
  const list = provinces.data ?? []
  const missing = rate?.provinceCode && !list.some((p) => p.code === rate.provinceCode)

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ id: rate?.id, body: toPayload(v) })
      toast.success('Đã lưu mức phí')
      onClose()
    } catch (e) {
      applyApiError(form, e)
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={rate ? 'Sửa mức phí' : 'Thêm mức phí'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="shipping-form" loading={isSubmitting}>Lưu</Button>
        </>
      }
    >
      <form id="shipping-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Tên mức phí" htmlFor="ship-name" error={errors.name?.message} required>
          <Input id="ship-name" autoFocus invalid={!!errors.name} {...register('name')} />
        </FormField>
        <FormField label="Áp dụng cho" htmlFor="ship-province" error={errors.provinceCode?.message} hint={provinces.isError ? 'Không tải được danh sách tỉnh/thành. Thử tải lại trang.' : 'Mức riêng của tỉnh được ưu tiên hơn mức cho tất cả tỉnh/thành.'}>
          <Select id="ship-province" invalid={!!errors.provinceCode} {...register('provinceCode')}>
            <option value="">Tất cả tỉnh/thành</option>
            {missing && <option value={rate!.provinceCode!}>{rate!.provinceName ?? rate!.provinceCode}</option>}
            {list.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </Select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={`Phí giao hàng (${currency})`} htmlFor="ship-fee" error={errors.fee?.message} required>
            <Input id="ship-fee" type="number" inputMode="decimal" step="any" min={0} invalid={!!errors.fee} {...register('fee')} />
          </FormField>
          <FormField label={`Đơn tối thiểu (${currency})`} htmlFor="ship-min" error={errors.minOrderAmount?.message} hint="Để trống: áp dụng cho mọi giá trị đơn.">
            <Input id="ship-min" type="number" inputMode="decimal" step="any" min={0} invalid={!!errors.minOrderAmount} {...register('minOrderAmount')} />
          </FormField>
        </div>
        <FormField label={`Miễn phí từ (${currency})`} htmlFor="ship-free" error={errors.freeShipThreshold?.message} hint="Tạm tính đạt mức này thì miễn phí giao hàng. Để trống: không miễn phí theo ngưỡng.">
          <Input id="ship-free" type="number" inputMode="decimal" step="any" min={0} invalid={!!errors.freeShipThreshold} {...register('freeShipThreshold')} />
        </FormField>
        <div className="flex flex-wrap items-end gap-4">
          <FormField label="Thứ tự" htmlFor="ship-sort" error={errors.sortOrder?.message} className="w-32" hint="Nhỏ hơn được chọn trước.">
            <Input id="ship-sort" type="number" inputMode="numeric" step={1} min={0} invalid={!!errors.sortOrder} {...register('sortOrder')} />
          </FormField>
          <Switch label="Đang bật" {...register('isActive')} />
        </div>
      </form>
    </Modal>
  )
}
