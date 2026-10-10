import type { MutableRefObject } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { useLabels, useMeta } from '@/api/hooks'
import { RichTextEditor } from '@/components/editor/RichTextEditor'
import { Card, CardHeader, FormField, Input, Select, Switch, Textarea } from '@/components/ui/primitives'
import { slugify } from '@/lib/utils'
import type { BrandItem, CategoryItem } from './api'
import { CategorySelect } from './CategorySelect'
import { categoryOptionLabel, type ProductFormValues } from './model'

export function GeneralTab({ form, categories, brands, slugTouched, canEdit, categoryBusy, onPrimaryCategoryChange }: {
  form: UseFormReturn<ProductFormValues>
  categories: readonly CategoryItem[]
  brands: readonly BrandItem[]
  /** Người dùng đã tự sửa slug thì ngừng tự sinh từ tên. */
  slugTouched: MutableRefObject<boolean>
  canEdit: boolean
  /** Đang tải bộ thuộc tính của danh mục mới chọn. */
  categoryBusy: boolean
  onPrimaryCategoryChange: (categoryId: string) => void
}) {
  const labels = useLabels()
  const meta = useMeta()
  const { register, control, setValue, watch, formState: { errors } } = form
  const primary = watch('primaryCategoryId')
  const extra = watch('categoryIds')
  const statuses = meta.data?.enums?.ProductStatus ?? []
  const noun = labels.product.toLowerCase()

  const name = register('name', {
    onChange: (e) => { if (!slugTouched.current) setValue('slug', slugify(e.target.value), { shouldDirty: true }) },
  })
  const slug = register('slug', { onChange: (e) => { slugTouched.current = e.target.value.trim() !== '' } })

  const toggleExtra = (id: string, on: boolean) =>
    setValue('categoryIds', on ? [...extra, id] : extra.filter((c) => c !== id), { shouldDirty: true })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Thông tin chung" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <FormField label={`Tên ${noun}`} htmlFor="p-name" error={errors.name?.message} required className="sm:col-span-2">
            <Input id="p-name" invalid={!!errors.name} autoComplete="off" {...name} />
          </FormField>
          <FormField label="Slug" htmlFor="p-slug" error={errors.slug?.message} hint="Để trống để tự tạo từ tên.">
            <Input id="p-slug" invalid={!!errors.slug} autoComplete="off" {...slug} />
          </FormField>
          <FormField label="Trạng thái" htmlFor="p-status" error={errors.status?.message}>
            <Select id="p-status" invalid={!!errors.status} {...register('status')}>
              {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </FormField>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-2">
            <Switch label="Nổi bật" {...register('isFeatured')} />
            <Switch label="Bán chạy" {...register('isBestSeller')} />
            <Switch label="Mới" {...register('isNew')} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Phân loại" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <FormField label={`${labels.brand}`} htmlFor="p-brand" error={errors.brandId?.message}>
            <Select id="p-brand" invalid={!!errors.brandId} {...register('brandId')}>
              <option value="">Không có</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.isActive ? '' : ' (ẩn)'}</option>)}
            </Select>
          </FormField>
          <FormField label={`${labels.category} chính`} htmlFor="p-category" error={errors.primaryCategoryId?.message} hint="Quyết định bộ thuộc tính và tuỳ chọn biến thể áp dụng.">
            <Controller
              control={control}
              name="primaryCategoryId"
              render={({ field }) => (
                <CategorySelect
                  id="p-category"
                  categories={categories}
                  placeholder="Chưa chọn"
                  invalid={!!errors.primaryCategoryId}
                  disabled={categoryBusy}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) => onPrimaryCategoryChange(e.target.value)}
                />
              )}
            />
          </FormField>
          <fieldset className="space-y-1 sm:col-span-2">
            <legend className="text-xs font-medium">{labels.category} phụ</legend>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
              {categories.length === 0 && <p className="p-1 text-xs text-muted">Chưa có {labels.category.toLowerCase()} nào.</p>}
              {categories.filter((c) => c.id !== primary).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={extra.includes(c.id)} onChange={(e) => toggleExtra(c.id, e.target.checked)} />
                  <span className="whitespace-pre">{categoryOptionLabel(c)}</span>
                </label>
              ))}
            </div>
            {errors.categoryIds && <p role="alert" className="text-xs text-danger">{String(errors.categoryIds.message ?? '')}</p>}
          </fieldset>
        </div>
      </Card>

      <Card>
        <CardHeader title="Mô tả" />
        <div className="space-y-4 p-4">
          <FormField label="Mô tả ngắn" htmlFor="p-short" error={errors.shortDescription?.message} hint="Hiển thị ở danh sách và đầu trang chi tiết (tối đa 1000 ký tự).">
            <Textarea id="p-short" rows={3} invalid={!!errors.shortDescription} {...register('shortDescription')} />
          </FormField>
          <FormField label="Mô tả đầy đủ" htmlFor="p-desc" error={errors.description?.message}>
            {/* Trình soạn thảo không có chế độ chỉ đọc; `inert` chặn mọi thao tác khi người dùng chỉ có quyền xem */}
            <div inert={!canEdit}>
              <Controller
                control={control}
                name="description"
                render={({ field }) => <RichTextEditor id="p-desc" label="Mô tả đầy đủ" value={field.value} onChange={field.onChange} invalid={!!errors.description} placeholder="Nhập mô tả đầy đủ..." />}
              />
            </div>
          </FormField>
          <FormField label="Liên kết video" htmlFor="p-video" error={errors.videoUrl?.message} hint="Địa chỉ video giới thiệu (http hoặc https).">
            <Input id="p-video" type="url" inputMode="url" placeholder="https://" invalid={!!errors.videoUrl} {...register('videoUrl')} />
          </FormField>
        </div>
      </Card>
    </div>
  )
}
