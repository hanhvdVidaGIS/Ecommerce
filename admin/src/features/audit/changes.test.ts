import { describe, expect, it } from 'vitest'
import { formatChanges, MAX_CHANGES_CHARS } from './changes'

describe('formatChanges', () => {
  it('trả null khi không có nội dung', () => {
    expect(formatChanges(null)).toBeNull()
    expect(formatChanges(undefined)).toBeNull()
    expect(formatChanges('   ')).toBeNull()
  })

  it('định dạng JSON hợp lệ với thụt lề 2 khoảng trắng', () => {
    const r = formatChanges('{"email": "a@b.c", "roles": ["Staff"]}')
    expect(r?.valid).toBe(true)
    expect(r?.text).toBe('{\n  "email": "a@b.c",\n  "roles": [\n    "Staff"\n  ]\n}')
  })

  it('JSON hỏng thì giữ nguyên văn và không ném lỗi', () => {
    const r = formatChanges('{"a": ')
    expect(r).toEqual({ text: '{"a": ', valid: false, truncated: false })
  })

  it('giá trị JSON nguyên thuỷ vẫn hiển thị được', () => {
    expect(formatChanges('42')?.text).toBe('42')
    expect(formatChanges('"x"')?.text).toBe('"x"')
  })

  it('giữ nguyên thẻ HTML dạng chữ (không loại bỏ, chỉ hiển thị bằng text)', () => {
    expect(formatChanges('{"n":"<img src=x onerror=alert(1)>"}')?.text).toContain('<img src=x onerror=alert(1)>')
  })

  it('biến ký tự điều khiển và ký tự đảo chiều văn bản thành dạng escape nhìn thấy được', () => {
    const r = formatChanges('{"n":"a\u202Eb"}')
    expect(r?.text).not.toContain('\u202E')
    expect(r?.text).toContain('\\u202e')
    const bad = formatChanges('hỏng\u0007')
    expect(bad?.text).toBe('hỏng\\u0007')
  })

  it('cắt bớt nội dung quá dài', () => {
    const r = formatChanges(JSON.stringify({ big: 'x'.repeat(MAX_CHANGES_CHARS * 2) }))
    expect(r?.truncated).toBe(true)
    expect(r!.text.length).toBeLessThan(MAX_CHANGES_CHARS + 50)
    expect(r!.text.endsWith('(đã cắt bớt)')).toBe(true)
  })
})
