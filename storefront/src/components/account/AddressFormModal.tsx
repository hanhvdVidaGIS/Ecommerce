'use client'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { TextField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { UnitSelect } from '@/components/ui/UnitSelect'
import { ADDRESS_FIELDS, addressToForm, emptyAddressForm, validateAddress, type AddressField, type AddressForm, type CustomerAddress } from '@/lib/account/address'
import { toFormErrors, type FieldErrors } from '@/lib/account/form-errors'
import { hasErrors } from '@/lib/account/validation'
import { api } from '@/lib/client-api'
import { useProvinces, useWards } from '@/lib/use-address'

interface Props {
  /** Địa chỉ đang sửa; không truyền = thêm mới. */
  address?: CustomerAddress
  /** Chưa có địa chỉ nào: địa chỉ đầu tiên luôn là mặc định. */
  isFirst: boolean
  /** Đặt sẵn "mặc định" khi mở từ nút "Đặt mặc định" của địa chỉ cũ thiếu mã tỉnh/phường. */
  forceDefault?: boolean
  onClose: () => void
  /** Nhận toàn bộ danh sách mới (backend trả về cả danh sách sau mỗi thay đổi). */
  onSaved: (list: CustomerAddress[], wasEdit: boolean) => void
}

export function AddressFormModal({ address, isFirst, forceDefault, onClose, onSaved }: Props) {
  const uid = useId()
  const [v, setV] = useState<AddressForm>(() => address ? { ...addressToForm(address), isDefault: address.isDefault || !!forceDefault } : emptyAddressForm(isFirst))
  const [errors, setErrors] = useState<FieldErrors<AddressField>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const provinces = useProvinces()
  const wards = useWards(v.provinceCode || null)
  const set = <K extends keyof AddressForm>(k: K, val: AddressForm[K]) => setV((s) => ({ ...s, [k]: val }))
  // Backend không cho bỏ mặc định trực tiếp (chọn địa chỉ khác làm mặc định), và địa chỉ đầu tiên tự mặc định.
  const lockDefault = isFirst || !!address?.isDefault

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    const client = validateAddress(v)
    setErrors(client)
    setGeneral(null)
    if (hasErrors(client)) return
    submitting.current = true
    setBusy(true)
    const body = { receiverName: v.receiverName.trim(), phone: v.phone.trim(), addressLine: v.addressLine.trim(), provinceCode: v.provinceCode, wardCode: v.wardCode, isDefault: v.isDefault || lockDefault }
    try {
      const list = address
        ? await api.put<CustomerAddress[]>(`/api/account/addresses/${address.id}`, body)
        : await api.post<CustomerAddress[]>('/api/account/addresses', body)
      onSaved(list, !!address)
    } catch (err) {
      const f = toFormErrors(err, ADDRESS_FIELDS)
      setErrors(f.fields)
      setGeneral(f.general ?? null)
      setBusy(false)
    } finally {
      submitting.current = false
    }
  }

  return (
    <Modal open onClose={onClose} busy={busy} title={address ? 'Sửa địa chỉ' : 'Thêm địa chỉ'} size="md">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {general ? <Alert>{general}</Alert> : null}
        <TextField label="Họ tên người nhận" name="receiverName" autoComplete="name" required value={v.receiverName} error={errors.receiverName} onChange={(e) => set('receiverName', e.target.value)} />
        <TextField label="Số điện thoại" name="phone" type="tel" inputMode="tel" autoComplete="tel" required value={v.phone} error={errors.phone}
          hint="Số di động Việt Nam, ví dụ 0912 345 678." onChange={(e) => set('phone', e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <UnitSelect id={`${uid}-province`} label="Tỉnh / Thành phố" required placeholder="Chọn tỉnh/thành phố" value={v.provinceCode} units={provinces.data}
            loading={provinces.loading} loadError={provinces.error} onRetry={provinces.retry} error={errors.provinceCode}
            onChange={(code) => setV((s) => ({ ...s, provinceCode: code, wardCode: '' }))} />
          <UnitSelect id={`${uid}-ward`} label="Phường / Xã" required placeholder="Chọn phường/xã" value={v.wardCode} units={wards.data}
            loading={wards.loading} loadError={wards.error} onRetry={wards.retry} disabled={!v.provinceCode} error={errors.wardCode}
            onChange={(code) => set('wardCode', code)} />
        </div>
        <TextField label="Số nhà, tên đường" name="addressLine" autoComplete="street-address" required value={v.addressLine} error={errors.addressLine} onChange={(e) => set('addressLine', e.target.value)} />
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.isDefault || lockDefault} disabled={lockDefault} onChange={(e) => set('isDefault', e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Đặt làm địa chỉ mặc định
          </label>
          {lockDefault && !isFirst ? <p className="mt-1 text-xs text-muted">Để đổi địa chỉ mặc định, hãy đặt một địa chỉ khác làm mặc định.</p> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Huỷ</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu địa chỉ'}</button>
        </div>
      </form>
    </Modal>
  )
}
