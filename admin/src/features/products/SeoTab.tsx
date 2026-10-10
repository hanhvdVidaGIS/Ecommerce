import type { UseFormReturn } from 'react-hook-form'
import { ImageField } from '@/components/media/MediaPicker'
import { Card, CardHeader, FormField, Input, Switch, Textarea } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { ProductFormValues } from './model'

/** Đếm ký tự theo độ dài gợi ý của công cụ tìm kiếm; vượt gợi ý chỉ cảnh báo, không chặn lưu. */
function Counter({ value, recommended }: { value: string; recommended: number }) {
  const n = value.length
  return <span className={cn(n > recommended && 'text-amber-700')}>{n}/{recommended} ký tự gợi ý</span>
}

export function SeoTab({ form }: { form: UseFormReturn<ProductFormValues> }) {
  const { register, watch, setValue, formState: { errors } } = form
  const seo = watch('seo')
  const images = watch('images')
  const e = errors.seo
  // Backend chỉ trả mã ảnh Open Graph; chỉ xem trước được khi ảnh đó trùng một ảnh sản phẩm hoặc vừa được chọn.
  const preview = images.find((i) => i.mediaId === seo.ogImageMediaId)

  return (
    <Card>
      <CardHeader title="SEO" description="Nội dung hiển thị trên kết quả tìm kiếm và khi chia sẻ liên kết. Để trống để dùng tên và mô tả của sản phẩm." />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <FormField label="Tiêu đề meta" htmlFor="seo-title" error={e?.metaTitle?.message} hint={<Counter value={seo.metaTitle} recommended={60} />} className="sm:col-span-2">
          <Input id="seo-title" invalid={!!e?.metaTitle} {...register('seo.metaTitle')} />
        </FormField>
        <FormField label="Mô tả meta" htmlFor="seo-desc" error={e?.metaDescription?.message} hint={<Counter value={seo.metaDescription} recommended={160} />} className="sm:col-span-2">
          <Textarea id="seo-desc" rows={3} invalid={!!e?.metaDescription} {...register('seo.metaDescription')} />
        </FormField>
        <FormField label="Từ khoá" htmlFor="seo-keywords" error={e?.keywords?.message} hint="Phân tách bằng dấu phẩy.">
          <Input id="seo-keywords" invalid={!!e?.keywords} {...register('seo.keywords')} />
        </FormField>
        <FormField label="Liên kết canonical" htmlFor="seo-canonical" error={e?.canonicalUrl?.message} hint="Chỉ điền khi nội dung trùng với một trang khác.">
          <Input id="seo-canonical" type="url" inputMode="url" placeholder="https://" invalid={!!e?.canonicalUrl} {...register('seo.canonicalUrl')} />
        </FormField>
        <div className="space-y-1">
          <ImageField
            label="Ảnh Open Graph"
            value={seo.ogImageMediaId}
            preview={preview ? { url: preview.url, altText: preview.altText } : null}
            onChange={(id) => setValue('seo.ogImageMediaId', id, { shouldDirty: true })}
          />
          {seo.ogImageMediaId && !preview && <p className="text-xs text-muted">Đã chọn một ảnh (chưa có bản xem trước).</p>}
          {e?.ogImageMediaId?.message && <p role="alert" className="text-xs text-danger">{e.ogImageMediaId.message}</p>}
        </div>
        <div className="flex items-end">
          <Switch label="Không cho công cụ tìm kiếm lập chỉ mục (noindex)" {...register('seo.noIndex')} />
        </div>
      </div>
    </Card>
  )
}
