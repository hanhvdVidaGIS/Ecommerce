import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useMeta } from '@/api/hooks'
import type { Dto } from '@/api/types'
import { Modal } from '@/components/ui/overlays'
import { Button, FormField, Input, Select, Switch, Textarea } from '@/components/ui/primitives'
import { applyApiError, emptyToNull } from '@/lib/forms'
import { useSaveSection, type HomepageSection } from './api'
import { buildConfig, LIMIT_MAX, LIMIT_MIN, splitConfig } from './config'

type SectionType = Dto<'HomepageSectionType'>

const schema = z.object({
  type: z.string().min(1, 'Chọn loại section'),
  title: z.string().max(200, 'Tối đa 200 ký tự'),
  subtitle: z.string().max(500, 'Tối đa 500 ký tự'),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int('Phải là số nguyên'),
  limit: z.string(),
  viewAllUrl: z.string().max(500, 'Tối đa 500 ký tự'),
  advanced: z.string(),
}).superRefine((v, ctx) => {
  // Kiểm tra cấu hình ở một chỗ duy nhất (config.ts) để lỗi hiện đúng ô.
  const r = buildConfig({ limit: v.limit, viewAllUrl: v.viewAllUrl }, v.advanced)
  if (r.ok) return
  for (const [path, message] of Object.entries(r.errors)) ctx.addIssue({ code: 'custom', path: [path], message })
})
type Values = z.input<typeof schema>

/** Thêm/sửa section trang chủ, gồm cấu hình: ô thân thiện (limit, viewAllUrl) + JSON nâng cao cho các khoá còn lại. */
export function SectionFormModal({ section, defaultSortOrder, onClose }: { section: HomepageSection | null; defaultSortOrder: number; onClose: () => void }) {
  const meta = useMeta()
  const save = useSaveSection()
  const types = meta.data?.enums['HomepageSectionType'] ?? []
  const initial = splitConfig(section?.config)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: section?.type ?? types[0]?.value ?? '',
      title: section?.title ?? '',
      subtitle: section?.subtitle ?? '',
      isActive: section?.isActive ?? true,
      sortOrder: section?.sortOrder ?? defaultSortOrder,
      limit: initial.friendly.limit,
      viewAllUrl: initial.friendly.viewAllUrl,
      advanced: initial.advanced,
    },
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form

  const onSubmit = handleSubmit(async (v) => {
    const data = schema.parse(v)
    const built = buildConfig({ limit: data.limit, viewAllUrl: data.viewAllUrl }, data.advanced)
    if (!built.ok) return // đã báo lỗi từ schema
    try {
      await save.mutateAsync({
        id: section?.id,
        body: {
          type: data.type as SectionType,
          title: emptyToNull(data.title),
          subtitle: emptyToNull(data.subtitle),
          config: built.config,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        },
      })
      toast.success('Đã lưu section')
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
      title={section ? 'Sửa section' : 'Thêm section'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="section-form" loading={isSubmitting}>Lưu</Button>
        </>
      }
    >
      <form id="section-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField label="Loại section" htmlFor="section-type" error={errors.type?.message} required>
          <Select id="section-type" invalid={!!errors.type} {...register('type')}>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Tiêu đề" htmlFor="section-title" error={errors.title?.message}>
          <Input id="section-title" autoFocus invalid={!!errors.title} {...register('title')} />
        </FormField>
        <FormField label="Phụ đề" htmlFor="section-subtitle" error={errors.subtitle?.message}>
          <Input id="section-subtitle" invalid={!!errors.subtitle} {...register('subtitle')} />
        </FormField>
        <div className="flex flex-wrap items-end gap-4">
          <FormField label="Thứ tự" htmlFor="section-sort" error={errors.sortOrder?.message} className="w-28">
            <Input id="section-sort" type="number" {...register('sortOrder')} />
          </FormField>
          <Switch label="Hiển thị trên trang chủ" {...register('isActive')} />
        </div>

        <fieldset className="space-y-4 rounded-md border border-border p-3">
          <legend className="px-1 text-xs font-medium">Cấu hình</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Số lượng hiển thị" htmlFor="section-limit" error={errors.limit?.message} hint={`${LIMIT_MIN}–${LIMIT_MAX}; để trống dùng mặc định.`}>
              <Input id="section-limit" inputMode="numeric" invalid={!!errors.limit} {...register('limit')} />
            </FormField>
            <FormField label='Liên kết "Xem tất cả"' htmlFor="section-viewall" error={errors.viewAllUrl?.message} hint="Bắt đầu bằng / hoặc http(s)://">
              <Input id="section-viewall" placeholder="/products" invalid={!!errors.viewAllUrl} {...register('viewAllUrl')} />
            </FormField>
          </div>
          <FormField
            label="Cấu hình nâng cao (JSON)"
            htmlFor="section-advanced"
            error={errors.advanced?.message}
            hint="Các khoá khác ngoài hai ô trên, dạng đối tượng JSON. Khoá lạ được giữ nguyên khi lưu."
          >
            <Textarea id="section-advanced" rows={5} spellCheck={false} className="font-mono text-xs" invalid={!!errors.advanced} {...register('advanced')} />
          </FormField>
        </fieldset>
      </form>
    </Modal>
  )
}
