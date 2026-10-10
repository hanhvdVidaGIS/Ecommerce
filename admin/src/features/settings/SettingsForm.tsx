import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { ErrorState } from '@/components/ui/data'
import { Button, Card, CardHeader, Skeleton } from '@/components/ui/primitives'
import { toFormPath } from '@/lib/forms'
import { GROUP_TITLES, SettingControl, useGroupedSettings } from './SettingControl'
import { useSettings, useUpdateSettings, type Setting } from './api'

/**
 * Form lưu cấu hình theo nhóm. Chỉ gửi các khoá đã thay đổi; lỗi theo khoá từ backend hiện ngay dưới ô nhập tương ứng.
 */
export function SettingsForm({ include, exclude, canEdit }: {
  include: (group: string) => boolean
  exclude?: (setting: Setting) => boolean
  canEdit: boolean
}) {
  const settings = useSettings()
  const update = useUpdateSettings()
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const visible = useMemo(() => (settings.data ?? []).filter((s) => !exclude?.(s)), [settings.data, exclude])
  const groups = useGroupedSettings(visible, include)

  // Nạp giá trị từ máy chủ; giữ nguyên phần người dùng đang sửa dở khi dữ liệu được làm mới.
  useEffect(() => {
    if (!settings.data) return
    setValues((prev) => {
      const next: Record<string, string> = {}
      for (const s of settings.data) next[s.key] = s.key in prev && prev[s.key] !== s.value ? prev[s.key] : s.value
      return next
    })
  }, [settings.data])

  const changed = useMemo(() => {
    const out: Record<string, string> = {}
    for (const s of visible) if (include(s.group) && values[s.key] !== undefined && values[s.key] !== s.value) out[s.key] = values[s.key]
    return out
  }, [values, visible, include])
  const dirty = Object.keys(changed).length > 0

  const save = async () => {
    setErrors({})
    try {
      await update.mutateAsync(changed)
      toast.success('Đã lưu cấu hình')
    } catch (e) {
      if (e instanceof ApiError && e.details.length > 0) {
        const fieldErrors: Record<string, string> = {}
        for (const d of e.details) fieldErrors[toFormPath(d.field)] = d.message
        setErrors(fieldErrors)
        toast.error('Một số giá trị chưa hợp lệ')
      } else {
        toast.error(e instanceof ApiError ? e.message : 'Không lưu được cấu hình')
      }
    }
  }

  if (settings.error) return <Card><ErrorState error={settings.error} onRetry={() => settings.refetch()} /></Card>
  if (settings.isLoading) return <Card className="space-y-3 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9" />)}</Card>

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([group, items]) => (
        <Card key={group}>
          <CardHeader title={GROUP_TITLES[group] ?? group} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {items.map((s) => (
              <SettingControl key={s.key} setting={s} value={values[s.key] ?? ''} error={errors[s.key]} disabled={!canEdit} onChange={(v) => setValues((p) => ({ ...p, [s.key]: v }))} />
            ))}
          </div>
        </Card>
      ))}
      {canEdit ? (
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          {dirty && <span className="mr-auto text-xs text-muted">Có {Object.keys(changed).length} thay đổi chưa lưu</span>}
          <Button variant="secondary" disabled={!dirty} onClick={() => { setValues((p) => ({ ...p, ...Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value])) })); setErrors({}) }}>Hoàn tác</Button>
          <Button disabled={!dirty} loading={update.isPending} onClick={save}>Lưu cấu hình</Button>
        </div>
      ) : (
        <p className="text-xs text-muted">Bạn chỉ có quyền xem các cấu hình này.</p>
      )}
    </div>
  )
}
