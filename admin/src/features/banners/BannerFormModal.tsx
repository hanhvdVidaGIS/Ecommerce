import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useMeta } from '@/api/hooks'
import type { MediaRef } from '@/api/types'
import { isSafeLink, LINK_ERROR } from '@/components/content/links'
import { ImageField } from '@/components/media/MediaPicker'
import { Modal } from '@/components/ui/overlays'
import { Button, FormField, Input, Select } from '@/components/ui/primitives'
import { applyApiError, emptyToNull } from '@/lib/forms'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { useSaveBanner, type Banner } from './api'
import { placementLabel } from './placements'
import { validateDateRange } from './schedule'

const schema = z.object({
  title: z.string().trim().min(1, 'Nhập tiêu đề').max(200, 'Tối đa 200 ký tự'),
  subtitle: z.string().max(500, 'Tối đa 500 ký tự'),
  buttonText: z.string().max(100, 'Tối đa 100 ký tự'),
  buttonUrl: z.string().trim().max(500, 'Tối đa 500 ký tự').refine(isSafeLink, LINK_ERROR),
  placement: z.string().min(1, 'Chọn vị trí'),
  startAt: z.string(),
  endAt: z.string(),
  status: z.enum(['Draft', 'Published']),
  sortOrder: z.coerce.number().int('Phải là số nguyên'),
}).superRefine((v, ctx) => {
  const err = validateDateRange(v.startAt, v.endAt)
  if (err) ctx.addIssue({ code: 'custom', path: ['endAt'], message: err })
})
type Values = z.input<typeof schema>

type Img = { id: string | null; preview: Pick<MediaRef, 'url' | 'altText'> | null }

/** Thêm/sửa banner. Thời gian nhập theo giờ địa phương của trình duyệt, gửi lên dạng ISO UTC. */
export function BannerFormModal({ banner, defaultSortOrder, onClose }: { banner: Banner | null; defaultSortOrder: number; onClose: () => void }) {
  const meta = useMeta()
  const save = useSaveBanner()
  const [desktop, setDesktop] = useState<Img>({ id: banner?.desktopMediaId ?? null, preview: banner?.desktopImage ?? null })
  const [mobile, setMobile] = useState<Img>({ id: banner?.mobileMediaId ?? null, preview: banner?.mobileImage ?? null })
  const placements = meta.data?.bannerPlacements ?? (banner ? [banner.placement] : [])
  const statuses = meta.data?.enums['PublishStatus'] ?? []

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: banner?.title ?? '',
      subtitle: banner?.subtitle ?? '',
      buttonText: banner?.buttonText ?? '',
      buttonUrl: banner?.buttonUrl ?? '',
      placement: banner?.placement ?? placements[0] ?? '',
      startAt: toLocalInput(banner?.startAt),
      endAt: toLocalInput(banner?.endAt),
      status: banner?.status ?? 'Published',
      sortOrder: banner?.sortOrder ?? defaultSortOrder,
    },
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form

  const onSubmit = handleSubmit(async (v) => {
    const data = schema.parse(v)
    try {
      await save.mutateAsync({
        id: banner?.id,
        body: {
          title: data.title,
          subtitle: emptyToNull(data.subtitle),
          desktopMediaId: desktop.id,
          mobileMediaId: mobile.id,
          buttonText: emptyToNull(data.buttonText),
          buttonUrl: emptyToNull(data.buttonUrl),
          startAt: fromLocalInput(data.startAt),
          endAt: fromLocalInput(data.endAt),
          placement: data.placement,
          status: data.status,
          sortOrder: data.sortOrder,
        },
      })
      toast.success('Đã lưu banner')
      onClose()
    } catch (e) {
      applyApiError(form, e)
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={banner ? 'Sửa banner' : 'Thêm banner'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="banner-form" loading={isSubmitting}>Lưu</Button>
        </>
      }
    >
      <form id="banner-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Tiêu đề" htmlFor="banner-title" error={errors.title?.message} required>
          <Input id="banner-title" autoFocus invalid={!!errors.title} {...register('title')} />
        </FormField>
        <FormField label="Phụ đề" htmlFor="banner-subtitle" error={errors.subtitle?.message}>
          <Input id="banner-subtitle" invalid={!!errors.subtitle} {...register('subtitle')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageField label="Ảnh máy tính" aspect="wide" value={desktop.id} preview={desktop.preview} onChange={(id, preview) => setDesktop({ id, preview })} />
          <ImageField label="Ảnh điện thoại" aspect="wide" value={mobile.id} preview={mobile.preview} onChange={(id, preview) => setMobile({ id, preview })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Chữ trên nút" htmlFor="banner-btn" error={errors.buttonText?.message}>
            <Input id="banner-btn" invalid={!!errors.buttonText} {...register('buttonText')} />
          </FormField>
          <FormField label="Liên kết của nút" htmlFor="banner-url" error={errors.buttonUrl?.message} hint="Bắt đầu bằng / hoặc http(s)://">
            <Input id="banner-url" placeholder="/products" invalid={!!errors.buttonUrl} {...register('buttonUrl')} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Vị trí" htmlFor="banner-placement" error={errors.placement?.message} required>
            <Select id="banner-placement" invalid={!!errors.placement} {...register('placement')}>
              {placements.map((p) => <option key={p} value={p}>{placementLabel(p)}</option>)}
            </Select>
          </FormField>
          <FormField label="Trạng thái" htmlFor="banner-status" error={errors.status?.message}>
            <Select id="banner-status" {...register('status')}>
              {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Bắt đầu hiển thị" htmlFor="banner-start" error={errors.startAt?.message} hint="Để trống: hiển thị ngay.">
            <Input id="banner-start" type="datetime-local" invalid={!!errors.startAt} {...register('startAt')} />
          </FormField>
          <FormField label="Kết thúc hiển thị" htmlFor="banner-end" error={errors.endAt?.message} hint="Để trống: không giới hạn.">
            <Input id="banner-end" type="datetime-local" invalid={!!errors.endAt} {...register('endAt')} />
          </FormField>
        </div>
        <FormField label="Thứ tự" htmlFor="banner-sort" error={errors.sortOrder?.message} className="w-32" hint="Nhỏ hơn hiển thị trước.">
          <Input id="banner-sort" type="number" {...register('sortOrder')} />
        </FormField>
      </form>
    </Modal>
  )
}
