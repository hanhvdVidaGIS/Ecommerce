'use client'
import { useRef, useState } from 'react'
import { MapPin, Plus } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { MAX_ADDRESSES, addressToForm, formatAddress, type CustomerAddress } from '@/lib/account/address'
import { api } from '@/lib/client-api'
import { errorMessage } from '@/lib/errors'
import { useApiQuery } from '@/lib/use-api-query'
import { useToast } from '@/providers/ToastProvider'
import { AddressFormModal } from './AddressFormModal'
import { ListSkeleton, PageHeading } from './shared'

type Editing = { address?: CustomerAddress; forceDefault?: boolean } | null

export function AddressesClient() {
  const toast = useToast()
  const q = useApiQuery<CustomerAddress[]>(() => api.get<CustomerAddress[]>('/api/account/addresses'), 'addresses')
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<CustomerAddress | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const lock = useRef(false)
  const list = q.data ?? []
  const full = list.length >= MAX_ADDRESSES

  async function makeDefault(a: CustomerAddress) {
    // Địa chỉ cũ thiếu mã tỉnh/phường không gửi được (backend bắt buộc): mở form để bổ sung.
    if (!a.provinceCode || !a.wardCode) { setEditing({ address: a, forceDefault: true }); return }
    if (lock.current) return
    lock.current = true
    setBusyId(a.id)
    try {
      q.setData(await api.put<CustomerAddress[]>(`/api/account/addresses/${a.id}`, { ...addressToForm(a), isDefault: true }))
      toast.show('Đã đặt làm địa chỉ mặc định.', 'success')
    } catch (e) {
      toast.show(errorMessage(e), 'error')
    } finally {
      lock.current = false
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleting || lock.current) return
    lock.current = true
    setBusyId(deleting.id)
    setDeleteError(null)
    try {
      q.setData(await api.delete<CustomerAddress[]>(`/api/account/addresses/${deleting.id}`))
      toast.show('Đã xoá địa chỉ.', 'success')
      setDeleting(null)
    } catch (e) {
      setDeleteError(errorMessage(e))
    } finally {
      lock.current = false
      setBusyId(null)
    }
  }

  const addButton = (
    <button type="button" className="btn btn-primary" onClick={() => setEditing({})} disabled={full || q.loading || !!q.error}>
      <Plus size={18} aria-hidden />Thêm địa chỉ
    </button>
  )

  return (
    <div>
      <PageHeading title="Sổ địa chỉ" description={`Tối đa ${MAX_ADDRESSES} địa chỉ giao hàng.${list.length ? ` Đang có ${list.length}/${MAX_ADDRESSES}.` : ''}`} action={list.length > 0 || q.loading ? addButton : undefined} />
      {full ? <p role="status" className="mb-4 rounded border border-line bg-subtle px-3 py-2 text-sm">Bạn đã đạt giới hạn {MAX_ADDRESSES} địa chỉ. Hãy xoá bớt để thêm địa chỉ mới.</p> : null}

      {q.loading && !q.data ? <ListSkeleton rows={2} height="h-28" /> : q.error && !q.data ? <ErrorState message={q.error} onRetry={q.reload} /> : list.length === 0 ? (
        <div>
          <EmptyState icon={<MapPin size={40} />} title="Bạn chưa lưu địa chỉ nào" description="Lưu địa chỉ để đặt hàng nhanh hơn ở lần sau." />
          <div className="mt-4 flex justify-center">{addButton}</div>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((a) => (
            <li key={a.id} className="flex flex-col border border-line p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold">{a.receiverName}</span>
                {a.isDefault ? <span className="rounded bg-accent px-2 py-0.5 text-xs font-semibold text-accent-contrast">Mặc định</span> : null}
              </div>
              <p className="text-sm">{a.phone}</p>
              <p className="mt-1 flex-1 text-sm text-muted">{formatAddress(a)}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
                <button type="button" className="py-1 text-accent hover:underline" onClick={() => setEditing({ address: a })}>Sửa</button>
                {!a.isDefault ? <button type="button" className="py-1 text-accent hover:underline disabled:opacity-50" disabled={busyId === a.id} onClick={() => void makeDefault(a)}>{busyId === a.id ? 'Đang lưu…' : 'Đặt mặc định'}</button> : null}
                <button type="button" className="py-1 text-danger hover:underline" onClick={() => { setDeleteError(null); setDeleting(a) }}>Xoá</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <AddressFormModal address={editing.address} forceDefault={editing.forceDefault} isFirst={list.length === 0 && !editing.address} onClose={() => setEditing(null)}
          onSaved={(next, wasEdit) => { q.setData(next); setEditing(null); toast.show(wasEdit ? 'Đã cập nhật địa chỉ.' : 'Đã thêm địa chỉ.', 'success') }} />
      ) : null}

      <ConfirmDialog open={!!deleting} title="Xoá địa chỉ này?" danger busy={!!deleting && busyId === deleting.id} error={deleteError}
        description={deleting ? <>{deleting.receiverName} · {formatAddress(deleting)}{deleting.isDefault && list.length > 1 ? '. Một địa chỉ khác sẽ tự động trở thành mặc định.' : ''}</> : undefined}
        confirmLabel="Xoá" cancelLabel="Giữ lại" onConfirm={() => void confirmDelete()} onCancel={() => { setDeleting(null); setDeleteError(null) }} />
    </div>
  )
}
