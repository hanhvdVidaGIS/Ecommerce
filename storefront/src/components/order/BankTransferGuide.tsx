'use client'
import type { Order } from '@/api/types'
import { CopyButton } from '@/components/ui/CopyButton'
import { useMoney } from '@/providers/SiteProvider'

/** Hướng dẫn chuyển khoản: nội dung chuyển khoản là mã đơn để đối soát. */
export function BankTransferGuide({ order }: { order: Order }) {
  const money = useMoney()
  const bank = order.bankTransfer
  if (!bank) return null
  const rows: Array<{ label: string; value: string; copy?: string }> = [
    ...(bank.bank ? [{ label: 'Ngân hàng', value: bank.bank }] : []),
    ...(bank.accountNumber ? [{ label: 'Số tài khoản', value: bank.accountNumber, copy: bank.accountNumber }] : []),
    ...(bank.accountName ? [{ label: 'Chủ tài khoản', value: bank.accountName }] : []),
    { label: 'Số tiền', value: money(order.grandTotal), copy: String(Math.round(order.grandTotal)) },
    { label: 'Nội dung chuyển khoản', value: bank.transferContent, copy: bank.transferContent },
  ]
  return (
    <section aria-labelledby="bank-guide" className="border border-accent bg-subtle p-4 md:p-5">
      <h2 id="bank-guide" className="text-base font-semibold">Hướng dẫn chuyển khoản</h2>
      <p className="mt-1 text-sm text-muted">Vui lòng chuyển đúng số tiền và ghi đúng nội dung để đơn được xác nhận nhanh nhất.</p>
      <dl className="mt-4 divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="break-all font-semibold">{r.value}</span>
              {r.copy ? <CopyButton text={r.copy} label={r.label.toLowerCase()} /> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
