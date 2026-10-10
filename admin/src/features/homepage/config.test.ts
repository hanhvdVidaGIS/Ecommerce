import { describe, expect, it } from 'vitest'
import { buildConfig, splitConfig } from './config'

describe('splitConfig', () => {
  it('tách limit và viewAllUrl ra ô thân thiện, phần còn lại vào JSON nâng cao', () => {
    const { friendly, advanced } = splitConfig({ limit: 8, viewAllUrl: '/products?sort=newest', autoplay: true, tags: ['a'] })
    expect(friendly).toEqual({ limit: '8', viewAllUrl: '/products?sort=newest' })
    expect(JSON.parse(advanced)).toEqual({ autoplay: true, tags: ['a'] })
  })

  it('cấu hình rỗng hoặc không phải đối tượng cho ô trống', () => {
    expect(splitConfig({})).toEqual({ friendly: { limit: '', viewAllUrl: '' }, advanced: '' })
    expect(splitConfig(null)).toEqual({ friendly: { limit: '', viewAllUrl: '' }, advanced: '' })
    expect(splitConfig([1, 2])).toEqual({ friendly: { limit: '', viewAllUrl: '' }, advanced: '' })
  })

  it('giá trị sai kiểu của khoá thân thiện ở lại trong JSON để không bị mất', () => {
    const { friendly, advanced } = splitConfig({ limit: 'nhiều', viewAllUrl: 5 })
    expect(friendly).toEqual({ limit: '', viewAllUrl: '' })
    expect(JSON.parse(advanced)).toEqual({ limit: 'nhiều', viewAllUrl: 5 })
  })
})

describe('buildConfig', () => {
  it('vòng đi-về giữ nguyên khoá lạ và giá trị', () => {
    const original = { limit: 4, viewAllUrl: '/x', placement: 'promo', nested: { a: [1, 2, { b: null }] }, flag: false }
    const { friendly, advanced } = splitConfig(original)
    const r = buildConfig(friendly, advanced)
    expect(r).toEqual({ ok: true, config: original })
  })

  it('ô thân thiện được đổi, khoá lạ vẫn còn', () => {
    const r = buildConfig({ limit: '12', viewAllUrl: ' /new ' }, '{"autoplay": true}')
    expect(r).toEqual({ ok: true, config: { autoplay: true, limit: 12, viewAllUrl: '/new' } })
  })

  it('xoá ô thân thiện thì bỏ khoá khỏi cấu hình', () => {
    const { friendly, advanced } = splitConfig({ limit: 8, viewAllUrl: '/x', keep: 1 })
    const r = buildConfig({ ...friendly, limit: '', viewAllUrl: '' }, advanced)
    expect(r).toEqual({ ok: true, config: { keep: 1 } })
  })

  it('JSON rỗng cho cấu hình rỗng', () => {
    expect(buildConfig({ limit: '', viewAllUrl: '' }, '  ')).toEqual({ ok: true, config: {} })
  })

  it('báo lỗi cú pháp JSON ở ô nâng cao', () => {
    const r = buildConfig({ limit: '', viewAllUrl: '' }, '{"a": }')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.advanced).toMatch(/sai cú pháp/)
  })

  it('JSON hợp lệ nhưng không phải đối tượng bị từ chối (mảng, số, null, chuỗi)', () => {
    for (const text of ['[1,2]', '5', 'null', '"x"']) {
      const r = buildConfig({ limit: '', viewAllUrl: '' }, text)
      expect(r.ok, text).toBe(false)
      if (!r.ok) expect(r.errors.advanced, text).toMatch(/đối tượng JSON/)
    }
  })

  it('kiểm tra limit là số nguyên trong khoảng cho phép', () => {
    for (const bad of ['0', '-3', '1.5', 'abc', '101']) {
      const r = buildConfig({ limit: bad, viewAllUrl: '' }, '')
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(r.errors.limit, bad).toBeTruthy()
    }
    expect(buildConfig({ limit: '100', viewAllUrl: '' }, '')).toEqual({ ok: true, config: { limit: 100 } })
  })

  it('từ chối viewAllUrl nguy hiểm, nhận / và http(s)', () => {
    for (const bad of ['javascript:alert(1)', '//evil.example', 'data:text/html,x', 'ftp://x']) {
      const r = buildConfig({ limit: '', viewAllUrl: bad }, '')
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(r.errors.viewAllUrl, bad).toBeTruthy()
    }
    expect(buildConfig({ limit: '', viewAllUrl: 'https://a.b/c' }, '').ok).toBe(true)
  })

  it('gom lỗi của nhiều ô cùng lúc', () => {
    const r = buildConfig({ limit: 'x', viewAllUrl: 'javascript:1' }, '{')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['advanced', 'limit', 'viewAllUrl'])
  })

  it('người dùng tự gõ limit trong JSON khi ô thân thiện trống thì được giữ', () => {
    expect(buildConfig({ limit: '', viewAllUrl: '' }, '{"limit": 3}')).toEqual({ ok: true, config: { limit: 3 } })
  })
})
