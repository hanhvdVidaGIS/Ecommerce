import { ImagePlus, Trash2, Wand2, X } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { useLabels, useMeta } from '@/api/hooks'
import { MediaPickerModal } from '@/components/media/MediaPicker'
import { useConfirm } from '@/components/ui/overlays'
import { Badge, Button, Card, CardHeader, Checkbox, FormField, Input } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { slugify } from '@/lib/utils'
import { useGenerateVariants, type AttributeDef } from './api'
import { emptyVariant, type ProductFormValues } from './model'
import { applyBulk, buildGenerateRequest, collapseToSingle, mergeGeneratedVariants, type BulkPatch, type OptionSelection } from './variants'

function VariantImageCell({ form, index }: { form: UseFormReturn<ProductFormValues>; index: number }) {
  const [open, setOpen] = useState(false)
  const url = useWatch({ control: form.control, name: `variants.${index}.imageUrl` })
  const set = (id: string | null, u: string | null) => {
    form.setValue(`variants.${index}.imageMediaId`, id, { shouldDirty: true })
    form.setValue(`variants.${index}.imageUrl`, u, { shouldDirty: true })
  }
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={url ? `Đổi ảnh biến thể ${index + 1}` : `Chọn ảnh biến thể ${index + 1}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed border-border bg-surface-2 hover:border-accent disabled:cursor-not-allowed"
      >
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4 text-muted" aria-hidden />}
      </button>
      {url && <button type="button" aria-label={`Gỡ ảnh biến thể ${index + 1}`} onClick={() => set(null, null)} className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>}
      {open && <MediaPickerModal open onClose={() => setOpen(false)} title="Ảnh biến thể" onPick={([m]) => set(m.id, m.url)} />}
    </div>
  )
}

/**
 * Tuỳ chọn biến thể + bảng biến thể chỉnh sửa được. "Tạo biến thể" gọi backend để sinh tích Descartes rồi hợp nhất với
 * biến thể sẵn có theo tổ hợp giá trị (giữ mã, SKU, giá, tồn kho; chỉ thêm tổ hợp mới; cảnh báo trước khi loại tổ hợp cũ).
 */
export function VariantsTab({ form, canEdit, canViewCost, optionAttrs, selection, onSelectionChange, hasCategory }: {
  form: UseFormReturn<ProductFormValues>
  canEdit: boolean
  canViewCost: boolean
  /** Thuộc tính tuỳ chọn biến thể áp dụng cho danh mục chính (đang bật). */
  optionAttrs: readonly AttributeDef[]
  selection: OptionSelection[]
  onSelectionChange: (s: OptionSelection[]) => void
  hasCategory: boolean
}) {
  const labels = useLabels()
  const meta = useMeta()
  const confirm = useConfirm()
  const generate = useGenerateVariants()
  const { register, control, formState: { errors } } = form
  const { fields, replace, remove } = useFieldArray({ control, name: 'variants', keyName: 'fid' })
  const [bulk, setBulk] = useState<BulkPatch & { price: string; salePrice: string; costPrice: string; stockQuantity: string }>({ price: '', salePrice: '', costPrice: '', stockQuantity: '' })
  const maxVariants = meta.data?.maxVariants ?? 200
  const hasOptions = fields.some((f) => f.options.length > 0)
  const rootError = errors.variants?.root?.message
  const noun = labels.product.toLowerCase()

  const combos = selection.reduce((n, s) => n * Math.max(1, s.valueIds.length), selection.some((s) => s.valueIds.length > 0) ? 1 : 0)
  const tooMany = combos > maxVariants

  const toggleValue = (attributeId: string, valueId: string, on: boolean) => {
    const current = selection.find((s) => s.attributeId === attributeId)?.valueIds ?? []
    const ids = on ? [...current, valueId] : current.filter((v) => v !== valueId)
    const rest = selection.filter((s) => s.attributeId !== attributeId)
    const next = ids.length > 0 ? [...rest, { attributeId, valueIds: ids }] : rest
    // giữ thứ tự thuộc tính như khi hiển thị để nhãn biến thể ổn định
    onSelectionChange(next.sort((a, b) => optionAttrs.findIndex((d) => d.id === a.attributeId) - optionAttrs.findIndex((d) => d.id === b.attributeId)))
  }

  const run = async () => {
    const typedBase = form.getValues('baseSku').trim()
    const baseSku = typedBase || slugify(form.getValues('name')).toUpperCase().slice(0, 30)
    const req = buildGenerateRequest(selection, baseSku)
    if (!req) return
    let generated
    try {
      generated = await generate.mutateAsync(req)
    } catch (e) {
      toastError(e, 'Không tạo được biến thể.')
      return
    }
    const result = mergeGeneratedVariants(form.getValues('variants'), generated)
    // Chỉ cảnh báo với biến thể đã lưu; dòng nhập dở chưa lưu bị thay thế thì không mất dữ liệu nào trên máy chủ.
    const lost = result.removed.filter((v) => v.variantId)
    if (lost.length > 0) {
      const ok = await confirm({
        title: `Bỏ ${lost.length} biến thể không còn trong tổ hợp mới?`,
        message: (
          <div className="space-y-2">
            <p>Các biến thể sau sẽ bị xoá khi bạn lưu, cùng giá, tồn kho và mục trong giỏ hàng, flash sale:</p>
            <ul className="max-h-40 list-disc overflow-y-auto pl-5">{lost.map((v) => <li key={v.variantId ?? v.sku}>{v.label || 'Mặc định'} ({v.sku || 'chưa có SKU'})</li>)}</ul>
          </div>
        ),
        confirmLabel: 'Tạo biến thể',
      })
      if (!ok) return
    }
    replace(result.variants)
    form.setValue('baseSku', baseSku, { shouldDirty: false })
    toast.success(`Đã tạo ${result.variants.length} biến thể: giữ ${result.kept}, thêm ${result.added}${lost.length ? `, bỏ ${lost.length}` : ''}`)
  }

  const clearOptions = async () => {
    const dropped = Math.max(0, fields.length - 1)
    if (dropped > 0 && !(await confirm({ title: `Chuyển về ${noun} không biến thể?`, message: `Chỉ giữ biến thể đầu tiên, ${dropped} biến thể còn lại sẽ bị xoá khi lưu.`, confirmLabel: 'Chuyển' }))) return
    replace(collapseToSingle(form.getValues('variants')))
    onSelectionChange([])
  }

  const applyAll = () => {
    const next = applyBulk(form.getValues('variants'), bulk, { canViewCost })
    replace(next)
    toast.success(`Đã áp cho ${next.length} biến thể`)
  }

  const fieldError = (i: number, key: 'sku' | 'barcode' | 'price' | 'salePrice' | 'costPrice' | 'stockQuantity' | 'label') => errors.variants?.[i]?.[key]?.message

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Tuỳ chọn biến thể" description={`Chọn thuộc tính và giá trị để tạo các biến thể; bỏ trống nếu ${noun} chỉ có một phiên bản.`} />
        <div className="space-y-4 p-4">
          {optionAttrs.length === 0 ? (
            <p className="text-sm text-muted">
              {hasCategory ? `${labels.category} chính chưa có thuộc tính tuỳ chọn biến thể nào.` : `Chọn ${labels.category.toLowerCase()} chính ở tab Thông tin chung để có thuộc tính tuỳ chọn biến thể.`}
              {' '}Bạn vẫn có thể nhập một biến thể duy nhất bên dưới.
            </p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {optionAttrs.map((def) => {
                  const chosen = selection.find((s) => s.attributeId === def.id)?.valueIds ?? []
                  return (
                    <fieldset key={def.id} className="space-y-1.5">
                      <legend className="text-xs font-medium">{def.name}</legend>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border p-2">
                        {def.values.length === 0 && <span className="text-xs text-muted">Thuộc tính chưa có giá trị.</span>}
                        {def.values.map((v) => (
                          <Checkbox
                            key={v.id}
                            checked={chosen.includes(v.id)}
                            onChange={(e) => toggleValue(def.id, v.id, e.target.checked)}
                            label={<span className="inline-flex items-center gap-1.5">{def.dataType === 'Color' && <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border border-border" style={{ backgroundColor: v.colorHex ?? undefined }} />}{v.label}</span>}
                          />
                        ))}
                      </div>
                    </fieldset>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <FormField label="Tiền tố SKU" htmlFor="p-basesku" hint="SKU gợi ý = tiền tố + giá trị. Để trống để lấy từ tên." className="w-full sm:w-64">
                  <Input id="p-basesku" autoComplete="off" {...register('baseSku')} />
                </FormField>
                <Button onClick={run} loading={generate.isPending} disabled={combos === 0 || tooMany}><Wand2 className="h-4 w-4" aria-hidden /> Tạo biến thể</Button>
                {hasOptions && <Button variant="secondary" onClick={clearOptions}>Bỏ tuỳ chọn</Button>}
                <p className={tooMany ? 'text-xs text-danger' : 'text-xs text-muted'} role={tooMany ? 'alert' : undefined}>
                  {combos === 0 ? 'Chưa chọn giá trị nào.' : tooMany ? `Tổ hợp tạo ra ${combos} biến thể, vượt giới hạn ${maxVariants}.` : `Sẽ có ${combos} biến thể.`}
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={`Biến thể (${fields.length})`} description={canViewCost ? undefined : 'Bạn không có quyền xem giá vốn nên cột giá vốn được ẩn.'} />
        {canEdit && fields.length > 1 && (
          <div className="flex flex-wrap items-end gap-2 border-b border-border bg-surface-2/50 px-4 py-3">
            <p className="w-full text-xs font-medium sm:w-auto sm:pb-2">Áp cho tất cả</p>
            <FormField label="Giá bán" htmlFor="bulk-price" className="w-28"><Input id="bulk-price" type="number" min={0} step="any" value={bulk.price} onChange={(e) => setBulk({ ...bulk, price: e.target.value })} /></FormField>
            <FormField label="Giá khuyến mãi" htmlFor="bulk-sale" className="w-28"><Input id="bulk-sale" type="number" min={0} step="any" value={bulk.salePrice} onChange={(e) => setBulk({ ...bulk, salePrice: e.target.value })} /></FormField>
            {canViewCost && <FormField label="Giá vốn" htmlFor="bulk-cost" className="w-28"><Input id="bulk-cost" type="number" min={0} step="any" value={bulk.costPrice} onChange={(e) => setBulk({ ...bulk, costPrice: e.target.value })} /></FormField>}
            <FormField label="Tồn kho" htmlFor="bulk-stock" className="w-24"><Input id="bulk-stock" type="number" min={0} step={1} value={bulk.stockQuantity} onChange={(e) => setBulk({ ...bulk, stockQuantity: e.target.value })} /></FormField>
            <Button variant="secondary" onClick={applyAll} disabled={!bulk.price && !bulk.salePrice && !bulk.costPrice && !bulk.stockQuantity}>Áp dụng</Button>
          </div>
        )}
        {/* relative: để phần sr-only (định vị tuyệt đối) bị cắt trong khung cuộn thay vì làm tràn cả trang */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium text-muted">
                <th scope="col" className="min-w-28 px-3 py-2.5">Biến thể</th>
                <th scope="col" className="px-3 py-2.5">SKU</th>
                <th scope="col" className="px-3 py-2.5">Barcode</th>
                <th scope="col" className="px-3 py-2.5">Giá bán</th>
                <th scope="col" className="px-3 py-2.5">Giá khuyến mãi</th>
                {canViewCost && <th scope="col" className="px-3 py-2.5">Giá vốn</th>}
                <th scope="col" className="px-3 py-2.5">Tồn kho</th>
                <th scope="col" className="px-3 py-2.5">Bật</th>
                <th scope="col" className="px-3 py-2.5">Ảnh</th>
                <th scope="col" className="px-3 py-2.5"><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.fid} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{f.label || 'Mặc định'}</p>
                    {!f.variantId && <Badge tone="info" className="mt-1">Mới</Badge>}
                    {fieldError(i, 'label') && <p role="alert" className="mt-1 text-xs text-danger">{fieldError(i, 'label')}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <Input aria-label={`SKU biến thể ${i + 1}`} className="w-40" invalid={!!fieldError(i, 'sku')} autoComplete="off" {...register(`variants.${i}.sku`)} />
                    {fieldError(i, 'sku') && <p role="alert" className="mt-1 max-w-44 text-xs text-danger">{fieldError(i, 'sku')}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <Input aria-label={`Barcode biến thể ${i + 1}`} className="w-32" invalid={!!fieldError(i, 'barcode')} autoComplete="off" {...register(`variants.${i}.barcode`)} />
                    {fieldError(i, 'barcode') && <p role="alert" className="mt-1 text-xs text-danger">{fieldError(i, 'barcode')}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <Input aria-label={`Giá bán biến thể ${i + 1}`} type="number" min={0} step="any" inputMode="decimal" className="w-28" invalid={!!fieldError(i, 'price')} {...register(`variants.${i}.price`)} />
                    {fieldError(i, 'price') && <p role="alert" className="mt-1 max-w-28 text-xs text-danger">{fieldError(i, 'price')}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <Input aria-label={`Giá khuyến mãi biến thể ${i + 1}`} type="number" min={0} step="any" inputMode="decimal" className="w-28" invalid={!!fieldError(i, 'salePrice')} {...register(`variants.${i}.salePrice`)} />
                    {fieldError(i, 'salePrice') && <p role="alert" className="mt-1 max-w-32 text-xs text-danger">{fieldError(i, 'salePrice')}</p>}
                  </td>
                  {canViewCost && (
                    <td className="px-3 py-2">
                      <Input aria-label={`Giá vốn biến thể ${i + 1}`} type="number" min={0} step="any" inputMode="decimal" className="w-28" invalid={!!fieldError(i, 'costPrice')} {...register(`variants.${i}.costPrice`)} />
                      {fieldError(i, 'costPrice') && <p role="alert" className="mt-1 max-w-28 text-xs text-danger">{fieldError(i, 'costPrice')}</p>}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <Input aria-label={`Tồn kho biến thể ${i + 1}`} type="number" min={0} step={1} inputMode="numeric" className="w-24" invalid={!!fieldError(i, 'stockQuantity')} {...register(`variants.${i}.stockQuantity`)} />
                    {fieldError(i, 'stockQuantity') && <p role="alert" className="mt-1 max-w-28 text-xs text-danger">{fieldError(i, 'stockQuantity')}</p>}
                  </td>
                  <td className="px-3 py-2"><input type="checkbox" role="switch" aria-label={`Bật biến thể ${i + 1}`} className="mt-2 h-4 w-4 accent-[var(--accent)]" {...register(`variants.${i}.isActive`)} /></td>
                  <td className="px-3 py-2"><VariantImageCell form={form} index={i} /></td>
                  <td className="px-3 py-2 text-right">
                    {canEdit && fields.length > 1 && (
                      <Button variant="ghost" size="sm" aria-label={`Xoá biến thể ${i + 1}`} onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {fields.length === 0 && (
          <div className="p-4"><Button variant="secondary" onClick={() => replace([emptyVariant()])}>Thêm biến thể mặc định</Button></div>
        )}
        {rootError && <p role="alert" className="border-t border-border px-4 py-3 text-xs text-danger">{rootError}</p>}
      </Card>
    </div>
  )
}
