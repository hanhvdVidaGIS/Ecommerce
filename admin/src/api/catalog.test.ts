import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { P } from './catalog.generated'

const catalog = JSON.parse(readFileSync(join(__dirname, '../../../docs/catalog.json'), 'utf8')) as { permissions: { code: string }[] }

describe('catalog.generated', () => {
  it('có đúng các mã quyền của docs/catalog.json (chạy npm run gen:catalog nếu lệch)', () => {
    expect(Object.values(P).sort()).toEqual(catalog.permissions.map((p) => p.code).sort())
  })

  it('tên khoá là mã quyền bỏ dấu chấm', () => {
    for (const [key, code] of Object.entries(P)) expect(key).toBe(code.replace('.', ''))
  })
})
