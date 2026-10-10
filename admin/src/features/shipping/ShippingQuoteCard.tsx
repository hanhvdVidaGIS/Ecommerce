import { useState } from 'react'
import { useLabels } from '@/api/hooks'
import { Button, Card, CardHeader, FormField, Input, Select } from '@/components/ui/primitives'
import { toastError } from '@/lib/forms'
import { formatMoney } from '@/lib/format'
import { useProvinces, useQuoteShipping } from './api'
import { describeQuote } from './model'

/** Thử tính phí: gọi đúng API mà trang thanh toán dùng nên kết quả khớp với những gì khách thấy. */
export function ShippingQuoteCard() {
  const { currency } = useLabels()
  const provinces = useProvinces()
  const quote = useQuoteShipping()
  const [province, setProvince] = useState('')
  const [subtotal, setSubtotal] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = subtotal.trim() === '' ? Number.NaN : Number(subtotal)
    if (!Number.isFinite(n) || n < 0) {
      setError(subtotal.trim() === '' ? 'Nhập tạm tính' : 'Tạm tính phải là số không âm')
      return
    }
    setError(null)
    try {
      await quote.mutateAsync({ provinceCode: province, subtotal: n })
    } catch (err) {
      toastError(err, 'Không tính được phí.')
    }
  }

  const money = (n: number) => formatMoney(n, currency)
  const result = quote.data ? describeQuote(quote.data, money) : null

  return (
    <Card className="mt-4">
      <CardHeader title="Thử tính phí" description="Nhập tỉnh/thành và tạm tính để xem khách sẽ bị tính bao nhiêu." />
      <form onSubmit={run} noValidate className="grid items-start gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <FormField label="Tỉnh/thành" htmlFor="quote-province">
          <Select id="quote-province" value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">Chưa chọn tỉnh/thành</option>
            {(provinces.data ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </Select>
        </FormField>
        <FormField label={`Tạm tính (${currency})`} htmlFor="quote-subtotal" error={error ?? undefined}>
          <Input id="quote-subtotal" type="number" inputMode="decimal" step="any" min={0} invalid={!!error} value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
        </FormField>
        <div className="sm:pt-[1.125rem]">
          <Button type="submit" loading={quote.isPending} className="w-full sm:w-auto">Tính phí</Button>
        </div>
      </form>
      {result && (
        <div className="border-t border-border px-4 py-3 text-sm" role="status" aria-live="polite">
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Phí giao hàng</dt>
            <dd className="font-semibold">{result.fee}</dd>
            <dt className="text-muted">Mức áp dụng</dt>
            <dd>{result.rate}</dd>
            {result.freeShip && (
              <>
                <dt className="text-muted">Ngưỡng miễn phí</dt>
                <dd>{result.freeShip}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </Card>
  )
}
