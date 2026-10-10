import { describe, expect, it } from 'vitest'
import { canSave, diffCodes, groupPermissions, groupState, isDirty, payloadCodes, setGroup, toggleCode, type PermissionItem } from './matrix'

const perm = (group: string, code: string, superAdminOnly = false): PermissionItem => ({ group, code, description: code, superAdminOnly })
const CATALOG: PermissionItem[] = [
  perm('Product', 'Product.View'),
  perm('Product', 'Product.Update'),
  perm('Order', 'Order.View'),
  perm('User', 'User.Manage', true),
  perm('Product', 'Product.Delete'),
]

describe('groupPermissions', () => {
  it('nhóm theo group, giữ thứ tự xuất hiện đầu tiên', () => {
    const g = groupPermissions(CATALOG)
    expect(g.map((x) => x.group)).toEqual(['Product', 'Order', 'User'])
    expect(g[0].items.map((p) => p.code)).toEqual(['Product.View', 'Product.Update', 'Product.Delete'])
  })
})

describe('toggleCode', () => {
  it('thêm và bỏ quyền, không đổi tập gốc', () => {
    const base = new Set(['Product.View'])
    const added = toggleCode(base, CATALOG[1], true)
    expect([...added].sort()).toEqual(['Product.Update', 'Product.View'])
    expect([...base]).toEqual(['Product.View'])
    expect(toggleCode(added, CATALOG[0], false).has('Product.View')).toBe(false)
  })

  it('bỏ qua quyền superAdminOnly', () => {
    expect(toggleCode(new Set(), CATALOG[3], true).size).toBe(0)
  })
})

describe('setGroup', () => {
  const product = groupPermissions(CATALOG)[0].items

  it('chọn cả nhóm rồi bỏ cả nhóm', () => {
    const all = setGroup(new Set(['Order.View']), product, true)
    expect([...all].sort()).toEqual(['Order.View', 'Product.Delete', 'Product.Update', 'Product.View'])
    expect([...setGroup(all, product, false)]).toEqual(['Order.View'])
  })

  it('không chọn quyền superAdminOnly khi chọn cả nhóm', () => {
    const userGroup = groupPermissions(CATALOG)[2].items
    expect(setGroup(new Set(), userGroup, true).size).toBe(0)
    const mixed = [CATALOG[0], CATALOG[3]]
    expect([...setGroup(new Set(), mixed, true)]).toEqual(['Product.View'])
  })
})

describe('groupState', () => {
  const [product, , user] = groupPermissions(CATALOG).map((g) => g.items)

  it('none / some / all', () => {
    expect(groupState(new Set(), product)).toEqual({ selected: 0, total: 3, state: 'none' })
    expect(groupState(new Set(['Product.View']), product)).toEqual({ selected: 1, total: 3, state: 'some' })
    expect(groupState(new Set(['Product.View', 'Product.Update', 'Product.Delete']), product).state).toBe('all')
  })

  it('nhóm toàn quyền superAdminOnly có tổng 0 và không bao giờ là "all"', () => {
    expect(groupState(new Set(['User.Manage']), user)).toEqual({ selected: 0, total: 0, state: 'none' })
  })
})

describe('diffCodes', () => {
  it('tính phần thêm và phần bớt so với bản gốc', () => {
    expect(diffCodes(['A', 'B'], ['B', 'C'])).toEqual({ added: ['C'], removed: ['A'] })
    expect(diffCodes(['A'], new Set(['A']))).toEqual({ added: [], removed: [] })
  })
})

describe('isDirty / canSave', () => {
  const base = { originalName: 'Kế toán', originalCodes: ['Order.View'], name: 'Kế toán', codes: new Set(['Order.View']) }

  it('không đổi gì thì không dirty, Lưu bị tắt', () => {
    expect(isDirty(base)).toBe(false)
    expect(canSave(base, { readOnly: false, saving: false })).toBe(false)
  })

  it('đổi quyền hoặc đổi tên thì dirty', () => {
    expect(isDirty({ ...base, codes: new Set(['Order.View', 'Order.Update']) })).toBe(true)
    expect(isDirty({ ...base, name: 'Kế toán trưởng' })).toBe(true)
  })

  it('đổi rồi hoàn lại về bản gốc thì không còn dirty', () => {
    const added = toggleCode(base.codes, perm('Order', 'Order.Update'), true)
    expect(isDirty({ ...base, codes: toggleCode(added, perm('Order', 'Order.Update'), false) })).toBe(false)
  })

  it('khoảng trắng đầu/cuối của tên không tính là thay đổi', () => {
    expect(isDirty({ ...base, name: '  Kế toán ' })).toBe(false)
  })

  it('Lưu bật khi có thay đổi hợp lệ', () => {
    const changed = { ...base, codes: new Set<string>() }
    expect(canSave(changed, { readOnly: false, saving: false })).toBe(true)
  })

  it('Lưu tắt khi chỉ đọc, đang lưu, tên trống hoặc quá dài', () => {
    const changed = { ...base, codes: new Set<string>() }
    expect(canSave(changed, { readOnly: true, saving: false })).toBe(false)
    expect(canSave(changed, { readOnly: false, saving: true })).toBe(false)
    expect(canSave({ ...changed, name: '   ' }, { readOnly: false, saving: false })).toBe(false)
    expect(canSave({ ...changed, name: 'x'.repeat(101) }, { readOnly: false, saving: false })).toBe(false)
  })
})

describe('payloadCodes', () => {
  it('loại quyền superAdminOnly và sắp xếp ổn định', () => {
    expect(payloadCodes(new Set(['User.Manage', 'Product.View', 'Order.View']), CATALOG)).toEqual(['Order.View', 'Product.View'])
  })
})
