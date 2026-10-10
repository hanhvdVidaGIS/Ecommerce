import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useLabels, useMeta } from '@/api/hooks'
import { Modal } from '@/components/ui/overlays'
import { Button, FormField, Input, Select, Switch } from '@/components/ui/primitives'
import { applyApiError } from '@/lib/forms'
import { useSaveCoupon } from './api'
import { makeCouponSchema, toFormValues, toPayload, type Coupon, type CouponFormValues } from './model'

/** Thêm/sửa mã giảm giá. Mã đã có lượt dùng thì khoá ô mã (backend trả code_locked nếu cố đổi). */
export function CouponFormModal({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const { currency } = useLabels()
  const meta = useMeta()
  const save = useSaveCoupon()
  const used = coupon?.usedCount ?? 0
  const locked = used > 0
  const types = meta.data?.enums['CouponType'] ?? (coupon ? [{ value: coupon.type, label: coupon.type }] : [])
  const schema = useMemo(() => makeCouponSchema(used), [used])

  const form = useForm<CouponFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(coupon, types[0]?.value as CouponFormValues['type'] | undefined),
  })
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = form
  const type = watch('type')

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ id: coupon?.id, body: toPayload(v) })
      toast.success('Đã lưu mã giảm giá')
      onClose()
    } catch (e) {
      // 409: trùng mã / mã bị khoá => gắn vào ô mã.
      if (e instanceof ApiError && (e.code === 'code_taken' || e.code === 'code_locked')) {
        form.setError('code', { type: 'server', message: e.code === 'code_taken' ? 'Mã này đã tồn tại.' : e.message })
        return
      }
      applyApiError(form, e)
    }
  })

  const valueUnit = type === 'Percent' ? '%' : currency
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={coupon ? 'Sửa mã giảm giá' : 'Thêm mã giảm giá'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="coupon-form" loading={isSubmitting}>Lưu</Button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField
          label="Mã"
          htmlFor="coupon-code"
          error={errors.code?.message}
          required
          hint={locked ? `Mã đã được dùng ${used} lượt nên không đổi được. Muốn đổi mã, hãy tắt mã này và tạo mã mới.` : 'Chữ, số, gạch ngang, gạch dưới; tự viết hoa.'}
        >
          <Input
            id="coupon-code"
            autoFocus={!locked}
            autoComplete="off"
            className={locked ? 'bg-surface-2 uppercase text-muted' : 'uppercase'}
            readOnly={locked}
            aria-readonly={locked || undefined}
            invalid={!!errors.code}
            maxLength={50}
            {...register('code', { onChange: (e) => setValue('code', e.target.value.toUpperCase()) })}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Loại" htmlFor="coupon-type" error={errors.type?.message} required>
            <Select id="coupon-type" invalid={!!errors.type} {...register('type')}>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </FormField>
          {type !== 'FreeShipping' && (
            <FormField label={`Giá trị (${valueUnit})`} htmlFor="coupon-value" error={errors.value?.message} required>
              <Input id="coupon-value" type="number" inputMode="decimal" step="any" min={0} invalid={!!errors.value} {...register('value')} />
            </FormField>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={`Đơn tối thiểu (${currency})`} htmlFor="coupon-min" error={errors.minOrderAmount?.message} hint="Để trống: không yêu cầu.">
            <Input id="coupon-min" type="number" inputMode="decimal" step="any" min={0} invalid={!!errors.minOrderAmount} {...register('minOrderAmount')} />
          </FormField>
          {type === 'Percent' && (
            <FormField label={`Giảm tối đa (${currency})`} htmlFor="coupon-max" error={errors.maxDiscount?.message} hint="Để trống: không giới hạn.">
              <Input id="coupon-max" type="number" inputMode="decimal" step="any" min={0} invalid={!!errors.maxDiscount} {...register('maxDiscount')} />
            </FormField>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tổng lượt dùng" htmlFor="coupon-limit" error={errors.usageLimit?.message} hint={used > 0 ? `Đã dùng ${used} lượt. Để trống: không giới hạn.` : 'Để trống: không giới hạn.'}>
            <Input id="coupon-limit" type="number" inputMode="numeric" min={1} step={1} invalid={!!errors.usageLimit} {...register('usageLimit')} />
          </FormField>
          <FormField label="Lượt dùng mỗi khách" htmlFor="coupon-per" error={errors.perUserLimit?.message} hint="Để trống: không giới hạn.">
            <Input id="coupon-per" type="number" inputMode="numeric" min={1} step={1} invalid={!!errors.perUserLimit} {...register('perUserLimit')} />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Bắt đầu" htmlFor="coupon-start" error={errors.startAt?.message} hint="Để trống: có hiệu lực ngay.">
            <Input id="coupon-start" type="datetime-local" invalid={!!errors.startAt} {...register('startAt')} />
          </FormField>
          <FormField label="Kết thúc" htmlFor="coupon-end" error={errors.endAt?.message} hint="Để trống: không giới hạn.">
            <Input id="coupon-end" type="datetime-local" invalid={!!errors.endAt} {...register('endAt')} />
          </FormField>
        </div>

        <Switch label="Đang bật" {...register('isActive')} />
      </form>
    </Modal>
  )
}
