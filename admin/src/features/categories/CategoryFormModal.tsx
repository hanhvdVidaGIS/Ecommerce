import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { useLabels } from '@/api/hooks'
import { ImageField } from '@/components/media/MediaPicker'
import { ErrorState } from '@/components/ui/data'
import { Modal } from '@/components/ui/overlays'
import { Badge, Button, FormField, Input, Select, Skeleton, Switch, Textarea } from '@/components/ui/primitives'
import { applyApiError, emptyToNull } from '@/lib/forms'
import { useCategory, useSaveCategory, type CategoryDetail, type CategoryItem } from './api'
import { nextSortOrder, parentOptions } from './tree'

const schema = z.object({
  name: z.string().trim().min(1, 'Nhập tên').max(200, 'Tối đa 200 ký tự'),
  slug: z.string().trim().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$|^$/, 'Chỉ gồm chữ thường, số và dấu gạch ngang'),
  parentId: z.string(),
  description: z.string().max(2000, 'Tối đa 2000 ký tự'),
  sortOrder: z.coerce.number().int('Phải là số nguyên').min(-100000, 'Tối thiểu -100000').max(100000, 'Tối đa 100000'),
  isActive: z.boolean(),
  metaTitle: z.string().max(200, 'Tối đa 200 ký tự'),
  metaDescription: z.string().max(500, 'Tối đa 500 ký tự'),
  keywords: z.string().max(500, 'Tối đa 500 ký tự'),
  canonicalUrl: z.string().trim().max(500, 'Tối đa 500 ký tự'),
  noIndex: z.boolean(),
})
type Values = z.input<typeof schema>

type Preview = { url: string; altText: string | null } | null
interface ImageState { id: string | null; preview: Preview }

/**
 * Hộp thoại thêm/sửa danh mục. Khi sửa, tải chi tiết (mô tả, banner, SEO, thuộc tính đã gán) rồi mới dựng form
 * để giá trị mặc định luôn đúng; `target` là mục đang sửa, hoặc `{ parentId }` khi thêm mới.
 */
export function CategoryFormModal({ flat, target, readOnly, onClose }: {
  flat: CategoryItem[]
  target: { id: string } | { parentId: string | null }
  readOnly: boolean
  onClose: () => void
}) {
  const labels = useLabels()
  const id = 'id' in target ? target.id : null
  const detail = useCategory(id)
  const noun = labels.category.toLowerCase()

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={id ? (readOnly ? `Chi tiết ${noun}` : `Sửa ${noun}`) : `Thêm ${noun}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{readOnly ? 'Đóng' : 'Huỷ'}</Button>
          {!readOnly && <Button type="submit" form="category-form" disabled={!!id && !detail.data}>Lưu</Button>}
        </>
      }
    >
      {id && detail.isLoading ? (
        <div className="space-y-3" aria-busy><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-24" /></div>
      ) : id && detail.error ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <CategoryForm flat={flat} category={detail.data ?? null} defaultParentId={'parentId' in target ? target.parentId : null} readOnly={readOnly} onClose={onClose} />
      )}
    </Modal>
  )
}

function CategoryForm({ flat, category, defaultParentId, readOnly, onClose }: {
  flat: CategoryItem[]
  category: CategoryDetail | null
  defaultParentId: string | null
  readOnly: boolean
  onClose: () => void
}) {
  const labels = useLabels()
  const save = useSaveCategory()
  const noun = labels.category.toLowerCase()
  const [icon, setIcon] = useState<ImageState>({ id: category?.iconMediaId ?? null, preview: category?.icon ?? null })
  const [banner, setBanner] = useState<ImageState>({ id: category?.bannerMediaId ?? null, preview: category?.banner ?? null })
  // Backend chỉ trả mã ảnh OG (không có URL xem trước), nên chỉ hiển thị trạng thái đã đặt.
  const [ogImage, setOgImage] = useState<ImageState>({ id: category?.seo.ogImageMediaId ?? null, preview: null })

  const options = useMemo(() => parentOptions(flat, category?.id ?? null), [flat, category?.id])
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? '',
      slug: category?.slug ?? '',
      parentId: category ? (category.parentId ?? '') : (defaultParentId ?? ''),
      description: category?.description ?? '',
      sortOrder: category?.sortOrder ?? nextSortOrder(flat, defaultParentId),
      isActive: category?.isActive ?? true,
      metaTitle: category?.seo.metaTitle ?? '',
      metaDescription: category?.seo.metaDescription ?? '',
      keywords: category?.seo.keywords ?? '',
      canonicalUrl: category?.seo.canonicalUrl ?? '',
      noIndex: category?.seo.noIndex ?? false,
    },
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form

  const onSubmit = handleSubmit(async (v) => {
    const data = schema.parse(v)
    try {
      await save.mutateAsync({
        id: category?.id,
        body: {
          name: data.name,
          slug: emptyToNull(data.slug),
          parentId: data.parentId || null,
          description: emptyToNull(data.description),
          iconMediaId: icon.id,
          bannerMediaId: banner.id,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
          seo: {
            metaTitle: emptyToNull(data.metaTitle),
            metaDescription: emptyToNull(data.metaDescription),
            keywords: emptyToNull(data.keywords),
            ogImageMediaId: ogImage.id,
            canonicalUrl: emptyToNull(data.canonicalUrl),
            noIndex: data.noIndex,
          },
        },
      })
      toast.success('Đã lưu')
      onClose()
    } catch (e) {
      // slug_taken là lỗi xung đột không kèm tên trường nên gắn tay vào ô slug; lỗi parentId (vòng lặp/quá sâu) đã kèm trường.
      if (e instanceof ApiError && e.code === 'slug_taken') form.setError('slug', { type: 'server', message: e.message })
      else applyApiError(form, e)
    }
  })

  return (
    <form id="category-form" onSubmit={onSubmit} noValidate>
      <fieldset disabled={readOnly} className="min-w-0 space-y-4">
        <FormField label="Tên" htmlFor="cat-name" error={errors.name?.message} required>
          <Input id="cat-name" autoFocus invalid={!!errors.name} {...register('name')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Slug" htmlFor="cat-slug" error={errors.slug?.message} hint="Để trống để tự tạo từ tên.">
            <Input id="cat-slug" invalid={!!errors.slug} {...register('slug')} />
          </FormField>
          <FormField label={`${labels.category} cha`} htmlFor="cat-parent" error={errors.parentId?.message} hint="Cây tối đa 5 cấp.">
            <Select id="cat-parent" invalid={!!errors.parentId} {...register('parentId')}>
              <option value="">— Không có (cấp gốc) —</option>
              {options.map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.disabled ? ' (quá sâu)' : ''}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Mô tả" htmlFor="cat-desc" error={errors.description?.message}>
          <Textarea id="cat-desc" rows={3} {...register('description')} />
        </FormField>
        <div className="flex flex-wrap gap-6">
          <ImageField label="Icon" value={icon.id} preview={icon.preview} onChange={(id, preview) => setIcon({ id, preview })} />
          <ImageField label="Banner" aspect="wide" value={banner.id} preview={banner.preview} onChange={(id, preview) => setBanner({ id, preview })} />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <FormField label="Thứ tự" htmlFor="cat-sort" error={errors.sortOrder?.message} className="w-28">
            <Input id="cat-sort" type="number" {...register('sortOrder')} />
          </FormField>
          <Switch label="Hiển thị" {...register('isActive')} />
        </div>

        <details className="rounded-md border border-border" open={Object.keys(errors).some((k) => /meta|keywords|canonical|noIndex/.test(k))}>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">SEO</summary>
          <div className="space-y-4 border-t border-border p-3">
            <FormField label="Tiêu đề SEO" htmlFor="cat-mt" error={errors.metaTitle?.message}><Input id="cat-mt" {...register('metaTitle')} /></FormField>
            <FormField label="Mô tả SEO" htmlFor="cat-md" error={errors.metaDescription?.message}><Textarea id="cat-md" rows={2} {...register('metaDescription')} /></FormField>
            <FormField label="Từ khoá" htmlFor="cat-kw" error={errors.keywords?.message} hint="Cách nhau bằng dấu phẩy."><Input id="cat-kw" {...register('keywords')} /></FormField>
            <FormField label="Canonical URL" htmlFor="cat-cu" error={errors.canonicalUrl?.message}><Input id="cat-cu" type="url" inputMode="url" {...register('canonicalUrl')} /></FormField>
            <div className="space-y-1">
              <ImageField label="Ảnh OG (chia sẻ mạng xã hội)" value={ogImage.id} preview={ogImage.preview} onChange={(id, preview) => setOgImage({ id, preview })} />
              {ogImage.id && !ogImage.preview && <p className="text-xs text-muted">Đã đặt ảnh OG (không có bản xem trước cho ảnh đã lưu).</p>}
            </div>
            <Switch label="Không cho công cụ tìm kiếm lập chỉ mục (noindex)" {...register('noIndex')} />
          </div>
        </details>
      </fieldset>

      {category && (
        <section className="mt-4 space-y-1.5" aria-label="Thuộc tính đã gán">
          <p className="text-xs font-medium">Thuộc tính đã gán cho {noun} này</p>
          {category.attributes.length === 0 ? (
            <p className="text-xs text-muted">Chưa gán thuộc tính nào trực tiếp. Gán tại trang Thuộc tính, tab “Danh mục áp dụng”.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {category.attributes.map((a) => (
                <Link key={a.id} to={`/attributes/${a.id}`} onClick={onClose}><Badge tone="info" className="hover:underline">{a.name}</Badge></Link>
              ))}
            </div>
          )}
          <p className="text-xs text-muted">Chỉ hiển thị thuộc tính gán trực tiếp; thuộc tính của {noun} cha cũng áp dụng cho {noun} này.</p>
        </section>
      )}
      {isSubmitting && <span className="sr-only" role="status">Đang lưu</span>}
    </form>
  )
}
