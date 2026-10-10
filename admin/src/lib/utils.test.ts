import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cn, slugify } from './utils'

const vectors = JSON.parse(readFileSync(join(__dirname, '../../../docs/slug-vectors.json'), 'utf8')) as { cases: { input: string; slug: string }[] }

describe('slugify', () => {
  it.each(vectors.cases)('khớp vector dùng chung với backend: "$input" → "$slug"', ({ input, slug }) => {
    expect(slugify(input)).toBe(slug)
  })

  it('có đủ vector để phép kiểm có ý nghĩa', () => {
    expect(vectors.cases.length).toBeGreaterThanOrEqual(8)
  })
})

describe('cn', () => {
  it('gộp class và để Tailwind ưu tiên giá trị sau', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c')
  })
})
