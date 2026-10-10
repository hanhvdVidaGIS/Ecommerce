import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { P } from '@/api/catalog.generated'
import { ApiError } from '@/api/client'
import { useMeta } from '@/api/hooks'
import type { MediaRef } from '@/api/types'
import { Can } from '@/auth/guards'
import { isSafeLink, LINK_ERROR } from '@/components/content/links'
import { UnsavedChangesGuard } from '@/components/content/UnsavedChangesGuard'
import { RichTextEditor } from '@/components/editor/RichTextEditor'
import { ImageField } from '@/components/media/MediaPicker'
import { ErrorState, PageHeader } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Button, Card, CardHeader, FormField, Input, Select, Skeleton, Switch, Textarea } from '@/components/ui/primitives'
import { applyApiError, emptyToNull } from '@/lib/forms'
import { cn, slugify } from '@/lib/utils'
import { useDeletePage, useMediaRef, usePage, useSavePage, type PageDetail } from './api'
import { toastDeletePageError } from './deletePage'

const META_TITLE_HINT = 60
const META_DESCRIPTION_HINT = 160

// Chỉ gợi ý TIÊU ĐỀ cho các trang thường gặp; nội dung (nhất là pháp lý) do người dùng tự soạn.
const TITLE_SUGGESTIONS = ['Giới thiệu', 'Liên hệ', 'Chính sách vận chuyển', 'Chính sách đổi trả', 'Chính sách bảo mật', 'Điều khoản sử dụng', 'Câu hỏi thường gặp']

const schema = z.object({
  title: z.string().trim().min(1, 'Nhập tiêu đề').max(200, 'Tối đa 200 ký tự'),
  slug: z.string().trim().max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$|^$/, 'Chỉ gồm chữ thường, số và dấu gạch ngang'),
  status: z.enum(['Draft', 'Published']),
  content: z.string().max(500_000, 'Nội dung quá dài'),
  metaTitle: z.string().max(200, 'Tối đa 200 ký tự'),
  metaDescription: z.string().max(500, 'Tối đa 500 ký tự'),
  keywords: z.string().max(500, 'Tối đa 500 ký tự'),
  canonicalUrl: z.string().trim().max(500, 'Tối đa 500 ký tự').refine(isSafeLink, LINK_ERROR),
  noIndex: z.boolean(),
  ogImageMediaId: z.string().nullable(),
})
type Values = z.infer<typeof schema>

function toValues(p: PageDetail | null): Values {
  return {
    title: p?.title ?? '',
    slug: p?.slug ?? '',
    status: p?.status ?? 'Draft',
    content: p?.content ?? '',
    metaTitle: p?.seo.metaTitle ?? '',
    metaDescription: p?.seo.metaDescription ?? '',
    keywords: p?.seo.keywords ?? '',
    canonicalUrl: p?.seo.canonicalUrl ?? '',
    noIndex: p?.seo.noIndex ?? false,
    ogImageMediaId: p?.seo.ogImageMediaId ?? null,
  }
}

/** Đếm ký tự gợi ý (không chặn); vượt gợi ý thì đổi màu cảnh báo vì công cụ tìm kiếm sẽ cắt bớt. */
function CharCount({ value, hint }: { value: string; hint: number }) {
  return <span className={cn('text-xs', value.length > hint ? 'text-warning' : 'text-muted')} aria-live="polite">{value.length}/{hint}</span>
}

function PageForm({ page }: { page: PageDetail | null }) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const meta = useMeta()
  const save = useSavePage()
  const del = useDeletePage()
  const [ogPreview, setOgPreview] = useState<Pick<MediaRef, 'url' | 'altText'> | null>(null)
  const [exitTo, setExitTo] = useState<string | null>(null)

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(page) })
  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting, isDirty } } = form
  const title = watch('title')
  const slug = watch('slug')
  const metaTitle = watch('metaTitle')
  const metaDescription = watch('metaDescription')
  const ogId = watch('ogImageMediaId')
  const savedOg = useMediaRef(page?.seo.ogImageMediaId)

  // Rời trang sau khi lưu/xoá chạy trong effect để lúc đó cảnh báo "chưa lưu" đã được tắt.
  useEffect(() => { if (exitTo) navigate(exitTo, { replace: true }) }, [exitTo, navigate])

  const onSubmit = handleSubmit(async (v) => {
    try {
      const result = await save.mutateAsync({
        id: page?.id,
        body: {
          title: v.title,
          slug: emptyToNull(v.slug),
          content: v.content || null,
          status: v.status,
          seo: {
            metaTitle: emptyToNull(v.metaTitle),
            metaDescription: emptyToNull(v.metaDescription),
            keywords: emptyToNull(v.keywords),
            ogImageMediaId: v.ogImageMediaId,
            canonicalUrl: emptyToNull(v.canonicalUrl),
            noIndex: v.noIndex,
          },
        },
      })
      toast.success('Đã lưu trang')
      if (page) reset(toValues(result))
      else setExitTo(`/pages/${result.id}`)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'slug_taken') form.setError('slug', { type: 'server', message: e.message })
      else applyApiError(form, e)
    }
  })

  const onDelete = async () => {
    if (!page) return
    if (!(await confirm({ title: `Xoá trang "${page.title}"?`, message: 'Không thể hoàn tác. Trang đang nằm trong menu thì phải gỡ khỏi menu trước.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(page.id)
      toast.success('Đã xoá trang')
      setExitTo('/pages')
    } catch (e) {
      toastDeletePageError(e)
    }
  }

  const statuses = meta.data?.enums['PublishStatus'] ?? []
  const shownSlug = slug.trim() || slugify(title)
  return (
    <>
      <UnsavedChangesGuard when={isDirty && !exitTo} />
      <div className="mb-2"><Link to="/pages" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Trang nội dung</Link></div>
      <PageHeader
        title={page ? 'Sửa trang' : 'Thêm trang'}
        description={page ? `/${page.slug}` : undefined}
        actions={
          <Can permission={P.PageManage}>
            {page && <Button variant="secondary" onClick={onDelete}><Trash2 className="h-4 w-4 text-danger" aria-hidden /> Xoá</Button>}
            <Button type="submit" form="page-form" loading={isSubmitting} disabled={!!page && !isDirty}>Lưu</Button>
          </Can>
        }
      />
      <form id="page-form" onSubmit={onSubmit} noValidate className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <FormField label="Tiêu đề" htmlFor="page-title" error={errors.title?.message} required>
              <Input id="page-title" autoFocus={!page} invalid={!!errors.title} {...register('title')} />
            </FormField>
            {!page && (
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Gợi ý tiêu đề">
                <span className="text-xs text-muted">Tạo nhanh:</span>
                {TITLE_SUGGESTIONS.map((t) => (
                  <Button key={t} size="sm" variant="secondary" onClick={() => setValue('title', t, { shouldDirty: true, shouldValidate: true })}>{t}</Button>
                ))}
              </div>
            )}
            <FormField label="Nội dung" htmlFor="page-content" error={errors.content?.message}>
              <Controller
                control={control}
                name="content"
                render={({ field }) => <RichTextEditor id="page-content" label="Nội dung trang" value={field.value} onChange={(html) => field.onChange(html)} invalid={!!errors.content} />}
              />
            </FormField>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <FormField label="Trạng thái" htmlFor="page-status" hint="Trang chưa xuất bản không hiện ra website, kể cả trong menu.">
              <Select id="page-status" {...register('status')}>
                {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Slug" htmlFor="page-slug" error={errors.slug?.message} hint={shownSlug ? `Địa chỉ: /${shownSlug}. Để trống để tự tạo từ tiêu đề.` : 'Để trống để tự tạo từ tiêu đề.'}>
              <Input id="page-slug" invalid={!!errors.slug} {...register('slug')} />
            </FormField>
          </Card>

          <Card>
            <CardHeader title="SEO" description="Hiển thị trên kết quả tìm kiếm và khi chia sẻ." />
            <div className="space-y-4 p-4">
              <FormField label={<span className="flex items-center justify-between gap-2">Tiêu đề SEO <CharCount value={metaTitle} hint={META_TITLE_HINT} /></span>} htmlFor="page-meta-title" error={errors.metaTitle?.message} hint="Gợi ý tối đa 60 ký tự. Để trống dùng tiêu đề trang.">
                <Input id="page-meta-title" invalid={!!errors.metaTitle} {...register('metaTitle')} />
              </FormField>
              <FormField label={<span className="flex items-center justify-between gap-2">Mô tả SEO <CharCount value={metaDescription} hint={META_DESCRIPTION_HINT} /></span>} htmlFor="page-meta-desc" error={errors.metaDescription?.message} hint="Gợi ý tối đa 160 ký tự.">
                <Textarea id="page-meta-desc" rows={3} invalid={!!errors.metaDescription} {...register('metaDescription')} />
              </FormField>
              <FormField label="Từ khoá" htmlFor="page-keywords" error={errors.keywords?.message} hint="Cách nhau bằng dấu phẩy.">
                <Input id="page-keywords" invalid={!!errors.keywords} {...register('keywords')} />
              </FormField>
              <ImageField
                label="Ảnh chia sẻ (OG)"
                aspect="wide"
                value={ogId}
                preview={ogPreview ?? (ogId && ogId === page?.seo.ogImageMediaId ? savedOg.data : null)}
                onChange={(id, preview) => { setOgPreview(preview); setValue('ogImageMediaId', id, { shouldDirty: true }) }}
              />
              <FormField label="Canonical URL" htmlFor="page-canonical" error={errors.canonicalUrl?.message} hint="Chỉ điền khi nội dung trùng với trang khác.">
                <Input id="page-canonical" placeholder="https://..." invalid={!!errors.canonicalUrl} {...register('canonicalUrl')} />
              </FormField>
              <Switch label="Không cho công cụ tìm kiếm lập chỉ mục (noindex)" {...register('noIndex')} />
            </div>
          </Card>
        </div>
      </form>
    </>
  )
}

export default function PageEditorPage() {
  const { id } = useParams()
  const q = usePage(id)

  if (id && q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (id && !q.data) return (
    <div className="space-y-3" aria-busy>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64" />
    </div>
  )
  // key: chuyển giữa /pages/new và /pages/:id (hoặc trang khác) phải dựng lại form với dữ liệu tương ứng.
  return <PageForm key={id ?? 'new'} page={id ? q.data ?? null : null} />
}
