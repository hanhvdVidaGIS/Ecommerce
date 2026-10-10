import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { useForm, type FieldErrors, type FieldPath } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { P } from '@/api/catalog.generated'
import { ApiError } from '@/api/client'
import { useLabels } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { Tabs } from '@/components/ui/data'
import { useConfirm } from '@/components/ui/overlays'
import { Button } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import {
  fetchApplicableAttributeIds, fetchAttributeDef, useApplicableAttributeIds, useAttributeDefs, useSaveProduct,
  type AttributeDef, type BrandItem, type CategoryItem, type ProductDetail,
} from './api'
import { AttributesTab } from './AttributesTab'
import { collectErrorPaths, mapApiError } from './errors'
import { GeneralTab } from './GeneralTab'
import { ImagesTab } from './ImagesTab'
import { LeaveGuard } from './LeaveGuard'
import {
  buildAttributeEntries, descriptiveDefs, emptyProductValues, optionDefs, planCategoryChange, productFormSchema, tabForPath, toFormValues, toRequest,
  type EditorTab, type ProductFormValues,
} from './model'
import { SeoTab } from './SeoTab'
import { VariantsTab } from './VariantsTab'
import { collapseToSingle, selectionFromVariants, type OptionSelection } from './variants'

const TAB_ORDER: EditorTab[] = ['general', 'images', 'attributes', 'variants', 'seo']

export function ProductForm({ detail, categories, brands, initialDefs }: {
  /** null = tạo mới. Chỉ đọc một lần khi gắn; sau khi lưu form tự nạp lại từ phản hồi. */
  detail: ProductDetail | null
  categories: CategoryItem[]
  brands: BrandItem[]
  initialDefs: ReadonlyMap<string, AttributeDef>
}) {
  const isNew = !detail
  const labels = useLabels()
  const noun = labels.product.toLowerCase()
  const { can } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const save = useSaveProduct()
  const canEdit = isNew ? can(P.ProductCreate) : can(P.ProductUpdate)
  // Giá vốn: lấy theo quyền backend đã tính cho người dùng này; sản phẩm mới chưa có chi tiết nên dùng quyền từ phiên đăng nhập.
  const canViewCost = detail ? detail.canViewCost : can(P.ProductViewCost)

  const [initial] = useState(() => (detail ? toFormValues(detail, initialDefs, detail.applicableAttributeIds) : emptyProductValues()))
  const baseline = useRef(initial)
  const form = useForm<ProductFormValues>({ resolver: zodResolver(productFormSchema), defaultValues: initial })
  const { isDirty } = form.formState

  const [tab, setTab] = useState<EditorTab>('general')
  const [selection, setSelection] = useState<OptionSelection[]>(() => selectionFromVariants(initial.variants, detail?.applicableAttributeIds ?? []))
  const [categoryBusy, setCategoryBusy] = useState(false)
  const slugTouched = useRef(!isNew)
  const allowLeave = useRef(false)

  // Thuộc tính áp dụng theo danh mục chính hiện tại
  const categoryId = form.watch('primaryCategoryId')
  const applicable = useApplicableAttributeIds(categoryId || null, categories, detail ? { categoryId: detail.primaryCategoryId, ids: detail.applicableAttributeIds } : undefined)
  const { defs, loading: defsLoading } = useAttributeDefs(applicable.ids)
  const applicableDefs = useMemo(() => applicable.ids.flatMap((id) => (defs.has(id) ? [defs.get(id)!] : [])), [applicable.ids, defs])
  const optionAttrs = useMemo(() => optionDefs(applicableDefs), [applicableDefs])

  const errorPaths = collectErrorPaths(form.formState.errors)
  const tabsWithErrors = new Set(errorPaths.map(tabForPath))

  const reloadFrom = (values: ProductFormValues, order: readonly string[]) => {
    baseline.current = values
    form.reset(values)
    setSelection(selectionFromVariants(values.variants, order))
  }

  const changeCategory = async (next: string) => {
    if (next === form.getValues('primaryCategoryId')) return
    setCategoryBusy(true)
    try {
      const ids = next ? await fetchApplicableAttributeIds(qc, next, categories) : []
      const nextDefs = await Promise.all(ids.map((id) => fetchAttributeDef(qc, id)))
      const attributes = form.getValues('attributes')
      const variants = form.getValues('variants')
      const usedOptionAttributeIds = [...new Set(variants.flatMap((v) => v.options.map((o) => o.attributeId)))]
      const newOptionIds = optionDefs(nextDefs).map((d) => d.id)
      const plan = planCategoryChange({ attributes, usedOptionAttributeIds, newDescriptiveIds: descriptiveDefs(nextDefs).map((d) => d.id), newOptionIds })

      if (plan.lostAttributeIds.length > 0 || plan.lostOptionAttributeIds.length > 0) {
        const nameOf = (id: string) => attributes.find((a) => a.attributeId === id)?.name ?? defs.get(id)?.name ?? initialDefs.get(id)?.name ?? '?'
        const ok = await confirm({
          title: `Đổi ${labels.category.toLowerCase()} chính?`,
          message: (
            <div className="space-y-2">
              {plan.lostAttributeIds.length > 0 && <p>Các thuộc tính sau không còn áp dụng và giá trị đã nhập sẽ bị bỏ: <strong>{plan.lostAttributeIds.map(nameOf).join(', ')}</strong>.</p>}
              {plan.lostOptionAttributeIds.length > 0 && <p>Tuỳ chọn biến thể <strong>{plan.lostOptionAttributeIds.map(nameOf).join(', ')}</strong> không còn áp dụng: các biến thể sẽ thu về một biến thể (biến thể đầu tiên), {Math.max(0, variants.length - 1)} biến thể khác sẽ bị xoá khi lưu.</p>}
            </div>
          ),
          confirmLabel: 'Đổi',
        })
        if (!ok) return
      }

      form.setValue('primaryCategoryId', next, { shouldDirty: true })
      form.setValue('categoryIds', form.getValues('categoryIds').filter((c) => c !== next), { shouldDirty: true })
      form.setValue('attributes', buildAttributeEntries(nextDefs, { previous: attributes }), { shouldDirty: true })
      if (plan.lostOptionAttributeIds.length > 0) {
        form.setValue('variants', collapseToSingle(variants), { shouldDirty: true })
        setSelection([])
      } else {
        setSelection((s) => s.filter((x) => newOptionIds.includes(x.attributeId)))
      }
    } catch (e) {
      toastError(e, 'Không đổi được danh mục.')
    } finally {
      setCategoryBusy(false)
    }
  }

  const onInvalid = (errors: FieldErrors<ProductFormValues>) => {
    const paths = collectErrorPaths(errors)
    const first = TAB_ORDER.find((t) => paths.some((p) => tabForPath(p) === t))
    if (first) setTab(first)
    toast.error(`Còn ${paths.length} chỗ chưa hợp lệ, vui lòng kiểm tra lại.`)
    // đợi tab hiển thị rồi đưa tiêu điểm tới ô lỗi đầu tiên
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  const submit = form.handleSubmit(async (values) => {
    const body = toRequest(values, { canViewCost })
    try {
      const saved = await save.mutateAsync({ id: detail?.id, body })
      toast.success(isNew ? 'Đã tạo' : 'Đã lưu')
      if (isNew) {
        allowLeave.current = true
        navigate(`/products/${saved.id}`, { replace: true })
      } else {
        const order = saved.applicableAttributeIds
        reloadFrom(toFormValues(saved, defs.size > 0 ? defs : initialDefs, order), order)
      }
    } catch (e) {
      if (!(e instanceof ApiError)) { toastError(e, 'Không lưu được. Vui lòng thử lại.'); return }
      const { placed, unplaced } = mapApiError(e, values)
      for (const p of placed) form.setError(p.path as FieldPath<ProductFormValues>, { type: 'server', message: p.message })
      if (placed.length > 0) {
        const first = TAB_ORDER.find((t) => placed.some((p) => tabForPath(p.path) === t))
        if (first) setTab(first)
        requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      }
      if (unplaced.length > 0 || placed.length === 0) toast.error(unplaced.length > 0 ? unplaced.join(' ') : e.message)
      else toast.error('Máy chủ từ chối một số giá trị, xem các ô báo lỗi.')
    }
  }, onInvalid)

  const tabs = (
    [['general', 'Thông tin chung'], ['images', 'Hình ảnh'], ['attributes', 'Thuộc tính'], ['variants', 'Biến thể'], ['seo', 'SEO']] as const
  ).map(([key, label]) => ({
    key,
    label: <span className="inline-flex items-center gap-1.5">{label}{tabsWithErrors.has(key) && <span role="img" aria-label="có lỗi" className="h-2 w-2 rounded-full bg-danger" />}</span>,
  }))

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <LeaveGuard when={isDirty} allowRef={allowLeave} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <fieldset disabled={!canEdit} className="m-0 min-w-0 border-0 p-0">
        {tab === 'general' && <GeneralTab form={form} categories={categories} brands={brands} slugTouched={slugTouched} canEdit={canEdit} categoryBusy={categoryBusy} onPrimaryCategoryChange={changeCategory} />}
        {tab === 'images' && <ImagesTab form={form} canEdit={canEdit} />}
        {tab === 'attributes' && <AttributesTab form={form} defs={defs} loading={defsLoading || categoryBusy} hasCategory={!!categoryId} canEdit={canEdit} />}
        {tab === 'variants' && <VariantsTab form={form} canEdit={canEdit} canViewCost={canViewCost} optionAttrs={optionAttrs} selection={selection} onSelectionChange={setSelection} hasCategory={!!categoryId} />}
        {tab === 'seo' && <SeoTab form={form} />}
      </fieldset>

      {canEdit ? (
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          {isDirty && <span className="mr-auto text-xs text-muted" role="status">Có thay đổi chưa lưu</span>}
          <Button variant="secondary" disabled={!isDirty || save.isPending} onClick={() => reloadFrom(baseline.current, detail?.applicableAttributeIds ?? [])}>Hoàn tác</Button>
          <Button type="submit" loading={save.isPending} disabled={!isDirty && !isNew}>{isNew ? `Tạo ${noun}` : 'Lưu thay đổi'}</Button>
        </div>
      ) : (
        <p className="text-xs text-muted">Bạn chỉ có quyền xem {noun} này.</p>
      )}
    </form>
  )
}
