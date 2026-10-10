import { Lock } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { groupPermissions, groupState, isAssignable, setGroup, toggleCode, type PermissionItem } from './matrix'

function GroupCheckbox({ state, disabled, label, onChange }: { state: 'none' | 'some' | 'all'; disabled: boolean; label: string; onChange: (checked: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  // `indeterminate` chỉ đặt được qua thuộc tính DOM, không có prop HTML tương ứng.
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some' }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      className="h-4 w-4 rounded border-border accent-[var(--accent)]"
      checked={state === 'all'}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}

/**
 * Ma trận quyền nhóm theo `group`. Quyền superAdminOnly luôn bị khoá với vai trò khác Super Admin
 * (backend cũng từ chối); `readOnly` khoá toàn bộ (Super Admin, hoặc người xem thiếu Permission.Manage).
 */
export function PermissionMatrix({ permissions, selected, onChange, readOnly, isSuperAdminRole }: {
  permissions: PermissionItem[]
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  readOnly: boolean
  isSuperAdminRole: boolean
}) {
  const groups = groupPermissions(permissions)
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {groups.map(({ group, items }) => {
        const gs = groupState(selected, items)
        const groupLabel = isSuperAdminRole ? items.length : gs.total
        return (
          <section key={group} aria-label={`Nhóm quyền ${group}`} className="rounded-lg border border-border">
            <header className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <GroupCheckbox
                  state={isSuperAdminRole ? 'all' : gs.state}
                  disabled={readOnly || gs.total === 0}
                  label={`Chọn cả nhóm ${group}`}
                  onChange={(checked) => onChange(setGroup(selected, items, checked))}
                />
                {group}
              </label>
              <span className="text-xs text-muted">{isSuperAdminRole ? `${groupLabel}/${groupLabel}` : `${gs.selected}/${gs.total}`}</span>
            </header>
            <ul className="divide-y divide-border">
              {items.map((p) => {
                const locked = !isAssignable(p) && !isSuperAdminRole
                const checked = selected.has(p.code)
                const id = `perm-${p.code}`
                return (
                  <li key={p.code} className={cn('flex items-start gap-2 px-3 py-2', locked && 'bg-surface-2/60')}>
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[var(--accent)]"
                      checked={checked}
                      disabled={readOnly || locked}
                      onChange={(e) => onChange(toggleCode(selected, p, e.target.checked))}
                    />
                    <label htmlFor={id} className={cn('min-w-0 flex-1 text-sm', (readOnly || locked) ? 'cursor-default' : 'cursor-pointer')}>
                      <span className="block">{p.description}</span>
                      <span className="block break-all font-mono text-[11px] text-muted">{p.code}</span>
                      {locked && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                          <Lock className="h-3 w-3" aria-hidden /> Chỉ dành cho Super Admin, không gán được cho vai trò khác.
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
