import type { UseFormReturn } from 'react-hook-form'
import { EmptyState } from '@/components/ui/data'
import { Card, CardHeader, Checkbox, FormField, Input, Select, Skeleton } from '@/components/ui/primitives'
import { useLabels } from '@/api/hooks'
import type { AttributeDef } from './api'
import type { AttributeFormValue, ProductFormValues } from './model'

function ColorDot({ hex }: { hex: string | null | undefined }) {
  return <span aria-hidden className="inline-block h-4 w-4 shrink-0 rounded-full border border-border" style={{ backgroundColor: hex ?? undefined }} />
}

function AttributeInput({ index, entry, def, form, disabled }: {
  index: number
  entry: AttributeFormValue
  def: AttributeDef | undefined
  form: UseFormReturn<ProductFormValues>
  disabled: boolean
}) {
  const id = `p-attr-${index}`
  const error = form.formState.errors.attributes?.[index]
  const message = error && 'message' in error && typeof error.message === 'string' ? error.message : undefined
  const values = def?.values ?? []
  const setValueIds = (ids: string[]) => form.setValue(`attributes.${index}.valueIds`, ids, { shouldDirty: true })
  const label = entry.unit ? `${entry.name} (${entry.unit})` : entry.name

  switch (entry.dataType) {
    case 'Text':
      return <FormField label={label} htmlFor={id} error={message} required={entry.isRequired}><Input id={id} invalid={!!message} disabled={disabled} {...form.register(`attributes.${index}.text`)} /></FormField>
    case 'Number':
      return <FormField label={label} htmlFor={id} error={message} required={entry.isRequired}><Input id={id} type="number" step="any" inputMode="decimal" invalid={!!message} disabled={disabled} {...form.register(`attributes.${index}.number`)} /></FormField>
    case 'Boolean':
      return (
        <FormField label={label} error={message} required={entry.isRequired} hint={entry.bool === null ? 'Chưa đặt' : undefined}>
          <Checkbox
            id={id}
            label={entry.bool ? 'Có' : 'Không'}
            checked={entry.bool === true}
            disabled={disabled}
            onChange={(e) => form.setValue(`attributes.${index}.bool`, e.target.checked, { shouldDirty: true })}
          />
        </FormField>
      )
    case 'MultiSelect':
      return (
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium">{label}{entry.isRequired && <span className="ml-0.5 text-danger" aria-hidden>*</span>}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border p-2">
            {values.length === 0 && <span className="text-xs text-muted">Thuộc tính chưa có giá trị.</span>}
            {values.map((v) => (
              <Checkbox
                key={v.id}
                label={v.label}
                checked={entry.valueIds.includes(v.id)}
                disabled={disabled}
                onChange={(e) => setValueIds(e.target.checked ? [...entry.valueIds, v.id] : entry.valueIds.filter((x) => x !== v.id))}
              />
            ))}
          </div>
          {message && <p role="alert" className="text-xs text-danger">{message}</p>}
        </fieldset>
      )
    default: {
      // Select, Color, Image: chọn đúng một giá trị
      const selected = values.find((v) => v.id === entry.valueIds[0])
      return (
        <FormField label={label} htmlFor={id} error={message} required={entry.isRequired}>
          <div className="flex items-center gap-2">
            {entry.dataType === 'Color' && <ColorDot hex={selected?.colorHex} />}
            {entry.dataType === 'Image' && selected?.image && <img src={selected.image.url} alt="" className="h-8 w-8 shrink-0 rounded border border-border object-cover" />}
            <Select id={id} invalid={!!message} disabled={disabled} value={entry.valueIds[0] ?? ''} onChange={(e) => setValueIds(e.target.value ? [e.target.value] : [])}>
              <option value="">Chưa chọn</option>
              {values.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </Select>
          </div>
        </FormField>
      )
    }
  }
}

/** Thuộc tính mô tả áp dụng cho danh mục chính (không gồm thuộc tính tạo biến thể, những thuộc tính đó nằm ở tab Biến thể). */
export function AttributesTab({ form, defs, loading, hasCategory, canEdit }: {
  form: UseFormReturn<ProductFormValues>
  defs: ReadonlyMap<string, AttributeDef>
  loading: boolean
  hasCategory: boolean
  canEdit: boolean
}) {
  const labels = useLabels()
  const entries = form.watch('attributes')
  const rootError = form.formState.errors.attributes?.root?.message

  return (
    <Card>
      <CardHeader title="Thuộc tính mô tả" description={`Bộ thuộc tính phụ thuộc vào ${labels.category.toLowerCase()} chính.`} />
      {loading ? (
        <div className="space-y-3 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : entries.length === 0 ? (
        <EmptyState
          title={hasCategory ? `${labels.category} này chưa có thuộc tính mô tả` : `Chưa chọn ${labels.category.toLowerCase()} chính`}
          description={hasCategory ? 'Thêm thuộc tính cho danh mục ở mục Thuộc tính.' : `Chọn ${labels.category.toLowerCase()} chính ở tab Thông tin chung để hiển thị các thuộc tính áp dụng.`}
        />
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {entries.map((entry, i) => (
            <AttributeInput key={entry.attributeId} index={i} entry={entry} def={defs.get(entry.attributeId)} form={form} disabled={!canEdit} />
          ))}
        </div>
      )}
      {rootError && <p role="alert" className="px-4 pb-4 text-xs text-danger">{rootError}</p>}
    </Card>
  )
}
