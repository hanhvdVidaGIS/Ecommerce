import { Check, Circle } from 'lucide-react'
import { passwordChecks } from '@/lib/account/password'

/** Gợi ý luật mật khẩu (khớp backend), đánh dấu luật đã đạt ngay khi nhập. */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="mt-1 space-y-0.5" aria-label="Yêu cầu mật khẩu">
      {passwordChecks(value).map((c) => (
        <li key={c.id} className={`flex items-center gap-1.5 ${c.ok ? 'text-success' : ''}`}>
          {c.ok ? <Check size={12} aria-hidden /> : <Circle size={12} aria-hidden />}
          <span>{c.label}<span className="sr-only">{c.ok ? ' (đã đạt)' : ' (chưa đạt)'}</span></span>
        </li>
      ))}
    </ul>
  )
}
