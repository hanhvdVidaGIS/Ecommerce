import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { ApiError } from '@/api/client'
import { useMeta } from '@/api/hooks'
import type { MediaRef } from '@/api/types'
import { Can } from '@/auth/guards'
import { UnsavedChangesGuard } from '@/components/content/UnsavedChangesGuard'
import { RichTextEditor } from '@/components/editor/RichTextEditor'
import { ImageField } from '@/components/media/MediaPicker'
import { ErrorState, PageHeader } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, CardHeader, FormField, Input, Select, Skeleton, Switch, Textarea } from '@/components/ui/primitives'
import { useMediaRef } from '@/features/pages/api'
import { applyApiError, toastError } from '@/lib/forms'
import { fromLocalInput } from '@/lib/format'
import { cn, slugify } from '@/lib/utils'
import { useDeletePost, usePost, useSavePost } from './api'
import { META_DESCRIPTION_HINT, META_TITLE_HINT, POST_STATE_BADGE, postSchema, postState, publicPostPath, toFormValues, toPayload, type Post, type PostFormValues } from './model'

/** Đếm ký tự gợi ý (không chặn); vượt gợi ý thì đổi màu cảnh báo vì công cụ tìm kiếm sẽ cắt bớt. */
function CharCount({ value, hint }: { value: string; hint: number }) {
  return <span className={cn('text-xs', value.length > hint ? 'text-warning' : 'text-muted')} aria-live="polite">{value.length}/{hint}</span>
}

type Preview = Pick<MediaRef, 'url' | 'altText'> | null

function PostForm({ post }: { post: Post | null }) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const meta = useMeta()
  const save = useSavePost()
  const del = useDeletePost()
  const [coverPreview, setCoverPreview] = useState<Preview>(null)
  const [ogPreview, setOgPreview] = useState<Preview>(null)
  const [exitTo, setExitTo] = useState<string | null>(null)

  const form = useForm<PostFormValues>({ resolver: zodResolver(postSchema), defaultValues: toFormValues(post) })
  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting, isDirty } } = form
  const title = watch('title')
  const slug = watch('slug')
  const status = watch('status')
  const publishedAt = watch('publishedAt')
  const metaTitle = watch('metaTitle')
  const metaDescription = watch('metaDescription')
  const coverId = watch('coverMediaId')
  const ogId = watch('ogImageMediaId')
  const savedOg = useMediaRef(post?.seo.ogImageMediaId)

  // Rời trang sau khi lưu/xoá chạy trong effect để lúc đó cảnh báo "chưa lưu" đã được tắt.
  useEffect(() => { if (exitTo) navigate(exitTo, { replace: true }) }, [exitTo, navigate])

  const onSubmit = handleSubmit(async (v) => {
    try {
      const result = await save.mutateAsync({ id: post?.id, body: toPayload(v) })
      toast.success('Đã lưu bài viết')
      if (post) reset(toFormValues(result))
      else setExitTo(`/posts/${result.id}`)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'slug_taken') form.setError('slug', { type: 'server', message: e.message })
      else applyApiError(form, e)
    }
  })

  const onDelete = async () => {
    if (!post) return
    if (!(await confirm({ title: `Xoá bài viết "${post.title}"?`, message: 'Bài viết sẽ biến mất khỏi website và không thể hoàn tác.', confirmLabel: 'Xoá' }))) return
    try {
      await del.mutateAsync(post.id)
      toast.success('Đã xoá bài viết')
      setExitTo('/posts')
    } catch (e) {
      toastError(e, 'Không xoá được bài viết.')
    }
  }

  const statuses = meta.data?.enums['PublishStatus'] ?? []
  const shownSlug = slug.trim() || slugify(title)
  // Trạng thái hiệu lực của dữ liệu ĐÃ LƯU (quyết định có nút "Xem trên website") và của giá trị đang nhập.
  const savedState = post ? postState(post.status, post.publishedAt) : 'draft'
  const liveState = postState(status, fromLocalInput(publishedAt))
  const liveBadge = POST_STATE_BADGE[liveState]
  const viewHref = post ? publicPostPath(post.slug, savedState) : null

  return (
    <>
      <UnsavedChangesGuard when={isDirty && !exitTo} />
      <div className="mb-2"><Link to="/posts" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Bài viết</Link></div>
      <PageHeader
        title={post ? 'Sửa bài viết' : 'Thêm bài viết'}
        description={post ? `/blog/${post.slug}` : undefined}
        actions={
          <>
            {viewHref && (
              <a href={viewHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text hover:bg-surface-2">
                <ExternalLink className="h-4 w-4" aria-hidden /> Xem trên website
              </a>
            )}
            <Can permission={P.PostManage}>
              {post && <Button variant="secondary" onClick={onDelete}><Trash2 className="h-4 w-4 text-danger" aria-hidden /> Xoá</Button>}
              <Button type="submit" form="post-form" loading={isSubmitting} disabled={!!post && !isDirty}>Lưu</Button>
            </Can>
          </>
        }
      />
      <form id="post-form" onSubmit={onSubmit} noValidate className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <FormField label="Tiêu đề" htmlFor="post-title" error={errors.title?.message} required>
              <Input id="post-title" autoFocus={!post} invalid={!!errors.title} {...register('title')} />
            </FormField>
            <FormField label="Tóm tắt" htmlFor="post-summary" error={errors.summary?.message} hint="Hiện ở danh sách bài viết trên website.">
              <Textarea id="post-summary" rows={3} invalid={!!errors.summary} {...register('summary')} />
            </FormField>
            <FormField label="Nội dung" htmlFor="post-content" error={errors.content?.message}>
              <Controller
                control={control}
                name="content"
                render={({ field }) => <RichTextEditor id="post-content" label="Nội dung bài viết" value={field.value} onChange={(html) => field.onChange(html)} invalid={!!errors.content} />}
              />
            </FormField>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Trạng thái hiệu lực</span>
              <Badge tone={liveBadge.tone}>{liveBadge.label}</Badge>
            </div>
            <FormField label="Trạng thái" htmlFor="post-status" hint="Bài nháp không hiện ra website.">
              <Select id="post-status" {...register('status')}>
                {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </FormField>
            <FormField
              label="Thời điểm đăng" htmlFor="post-published-at" error={errors.publishedAt?.message}
              hint="Chọn thời điểm ở tương lai để hẹn giờ đăng. Để trống khi đăng = đăng ngay (theo giờ của trình duyệt)."
            >
              <div className="flex gap-2">
                <Input id="post-published-at" type="datetime-local" invalid={!!errors.publishedAt} {...register('publishedAt')} />
                {publishedAt && <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setValue('publishedAt', '', { shouldDirty: true })}>Xoá</Button>}
              </div>
            </FormField>
            <FormField label="Slug" htmlFor="post-slug" error={errors.slug?.message} hint={shownSlug ? `Địa chỉ: /blog/${shownSlug}. Để trống để tự tạo từ tiêu đề.` : 'Để trống để tự tạo từ tiêu đề.'}>
              <Input id="post-slug" invalid={!!errors.slug} {...register('slug')} />
            </FormField>
            <ImageField
              label="Ảnh bìa"
              aspect="wide"
              value={coverId}
              preview={coverPreview ?? (coverId && coverId === post?.coverMediaId ? post.cover : null)}
              onChange={(id, preview) => { setCoverPreview(preview); setValue('coverMediaId', id, { shouldDirty: true }) }}
            />
          </Card>

          <Card>
            <CardHeader title="SEO" description="Hiển thị trên kết quả tìm kiếm và khi chia sẻ." />
            <div className="space-y-4 p-4">
              <FormField label={<span className="flex items-center justify-between gap-2">Tiêu đề SEO <CharCount value={metaTitle} hint={META_TITLE_HINT} /></span>} htmlFor="post-meta-title" error={errors.metaTitle?.message} hint="Gợi ý tối đa 60 ký tự. Để trống dùng tiêu đề bài viết.">
                <Input id="post-meta-title" invalid={!!errors.metaTitle} {...register('metaTitle')} />
              </FormField>
              <FormField label={<span className="flex items-center justify-between gap-2">Mô tả SEO <CharCount value={metaDescription} hint={META_DESCRIPTION_HINT} /></span>} htmlFor="post-meta-desc" error={errors.metaDescription?.message} hint="Gợi ý tối đa 160 ký tự.">
                <Textarea id="post-meta-desc" rows={3} invalid={!!errors.metaDescription} {...register('metaDescription')} />
              </FormField>
              <FormField label="Từ khoá" htmlFor="post-keywords" error={errors.keywords?.message} hint="Cách nhau bằng dấu phẩy.">
                <Input id="post-keywords" invalid={!!errors.keywords} {...register('keywords')} />
              </FormField>
              <ImageField
                label="Ảnh chia sẻ (OG)"
                aspect="wide"
                value={ogId}
                preview={ogPreview ?? (ogId && ogId === post?.seo.ogImageMediaId ? savedOg.data : null)}
                onChange={(id, preview) => { setOgPreview(preview); setValue('ogImageMediaId', id, { shouldDirty: true }) }}
              />
              <FormField label="Canonical URL" htmlFor="post-canonical" error={errors.canonicalUrl?.message} hint="Chỉ điền khi nội dung trùng với trang khác.">
                <Input id="post-canonical" placeholder="https://..." invalid={!!errors.canonicalUrl} {...register('canonicalUrl')} />
              </FormField>
              <Switch label="Không cho công cụ tìm kiếm lập chỉ mục (noindex)" {...register('noIndex')} />
            </div>
          </Card>
        </div>
      </form>
    </>
  )
}

export default function PostEditorPage() {
  const { id } = useParams()
  const q = usePost(id)

  if (id && q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (id && !q.data) return (
    <div className="space-y-3" aria-busy>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64" />
    </div>
  )
  // key: chuyển giữa /posts/new và /posts/:id phải dựng lại form với dữ liệu tương ứng.
  return <PostForm key={id ?? 'new'} post={id ? q.data ?? null : null} />
}
