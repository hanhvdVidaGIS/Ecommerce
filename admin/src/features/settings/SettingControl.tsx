import { useMemo } from 'react'
import { useMeta, useSiteConfig } from '@/api/hooks'
import { ImageField } from '@/components/media/MediaPicker'
import { Checkbox, FormField, Input, Select, Textarea } from '@/components/ui/primitives'
import { useFonts, type Setting } from './api'

/**
 * Ô nhập cho một khoá cấu hình. Kiểu ô (control) do backend mô tả nên Admin không gắn cứng tên khoá;
 * thêm khoá mới ở backend là trang cấu hình tự hiển thị đúng ô nhập.
 */
export function SettingControl({ setting, value, onChange, error, disabled }: {
  setting: Setting
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
}) {
  const id = `setting-${setting.key}`
  const { data: site } = useSiteConfig()
  const fonts = useFonts()
  const meta = useMeta()

  const control = (() => {
    switch (setting.control) {
      case 'textarea':
        return <Textarea id={id} value={value} disabled={disabled} invalid={!!error} rows={3} maxLength={2000} onChange={(e) => onChange(e.target.value)} />
      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${setting.label} (bảng màu)`}
              value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              className="h-9 w-12 cursor-pointer rounded border border-border bg-surface p-1"
            />
            <Input id={id} value={value} disabled={disabled} invalid={!!error} maxLength={7} placeholder="#RRGGBB" className="max-w-32 font-mono" onChange={(e) => onChange(e.target.value)} />
          </div>
        )
      case 'font':
        return (
          <Select id={id} value={value} disabled={disabled} invalid={!!error} onChange={(e) => onChange(e.target.value)}>
            {!fonts.data?.includes(value) && value && <option value={value}>{value}</option>}
            {fonts.data?.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        )
      case 'media': {
        const preview = site?.media?.[setting.key] ?? null
        return <ImageField value={value || null} preview={preview} aspect={setting.key.includes('logo') || setting.key.includes('cover') ? 'wide' : 'square'} onChange={(mediaId) => onChange(mediaId ?? '')} />
      }
      case 'boolean':
        return <Checkbox checked={value === 'true'} disabled={disabled} onChange={(e) => onChange(e.target.checked ? 'true' : 'false')} label="Bật" />
      case 'number':
        return <Input id={id} type="number" value={value} disabled={disabled} invalid={!!error} onChange={(e) => onChange(e.target.value)} />
      case 'payment-methods': {
        const methods = meta.data?.enums?.PaymentMethod ?? []
        let enabled: string[] = []
        try { enabled = JSON.parse(value || '[]') } catch { enabled = [] }
        return (
          <div className="flex flex-col gap-2">
            {methods.map((m) => (
              <Checkbox
                key={m.value}
                label={m.label}
                disabled={disabled}
                checked={enabled.includes(m.value)}
                onChange={(e) => onChange(JSON.stringify(e.target.checked ? [...enabled, m.value] : enabled.filter((x) => x !== m.value)))}
              />
            ))}
            <p className="text-xs text-muted">Cổng thanh toán trực tuyến (VNPay, MoMo, ZaloPay, Stripe) sẽ xuất hiện tại đây khi được tích hợp.</p>
          </div>
        )
      }
      case 'bank-account': {
        let bank: { bank?: string; accountNumber?: string; accountName?: string } = {}
        try { bank = JSON.parse(value || '{}') } catch { bank = {} }
        const set = (k: 'bank' | 'accountNumber' | 'accountName', v: string) => onChange(JSON.stringify({ ...bank, [k]: v }))
        return (
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Ngân hàng" placeholder="Ngân hàng" value={bank.bank ?? ''} disabled={disabled} maxLength={100} onChange={(e) => set('bank', e.target.value)} />
            <Input aria-label="Số tài khoản" placeholder="Số tài khoản" value={bank.accountNumber ?? ''} disabled={disabled} maxLength={50} inputMode="numeric" onChange={(e) => set('accountNumber', e.target.value)} />
            <Input aria-label="Chủ tài khoản" placeholder="Chủ tài khoản" value={bank.accountName ?? ''} disabled={disabled} maxLength={100} onChange={(e) => set('accountName', e.target.value)} />
          </div>
        )
      }
      case 'json':
        return <Textarea id={id} value={value} disabled={disabled} invalid={!!error} rows={4} className="font-mono text-xs" onChange={(e) => onChange(e.target.value)} />
      default:
        return <Input id={id} value={value} disabled={disabled} invalid={!!error} maxLength={2000} onChange={(e) => onChange(e.target.value)} />
    }
  })()

  return (
    <FormField label={setting.label} htmlFor={id} error={error} className={setting.control === 'textarea' || setting.control === 'bank-account' || setting.control === 'json' ? 'sm:col-span-2' : undefined}>
      {control}
    </FormField>
  )
}

/** Gom các khoá theo nhóm, giữ thứ tự backend trả về. */
export function useGroupedSettings(settings: Setting[] | undefined, include: (group: string) => boolean) {
  return useMemo(() => {
    const groups = new Map<string, Setting[]>()
    for (const s of settings ?? []) {
      if (!include(s.group)) continue
      groups.set(s.group, [...(groups.get(s.group) ?? []), s])
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])
}

/** Tên hiển thị của nhóm cấu hình (chỉ là nhãn giao diện; mã nhóm do backend quyết định). */
export const GROUP_TITLES: Record<string, string> = {
  general: 'Thông tin chung', branding: 'Nhận diện', theme: 'Màu sắc và font', contact: 'Liên hệ',
  social: 'Mạng xã hội', footer: 'Footer', seo: 'SEO mặc định', store: 'Cửa hàng',
}
