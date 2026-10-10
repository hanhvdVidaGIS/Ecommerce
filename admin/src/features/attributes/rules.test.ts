import { describe, expect, it } from 'vitest'
import {
  canBeFilterable, canBeVariantOption, flagRestrictions, hasValueList, isHexColor, nextValueSortOrder, normalizeFlags, normalizeHex,
  planValueMove, validateFlags, valueKind, valueToRequest, type AttributeDataType, type AttributeValue,
} from './rules'

const ALL: AttributeDataType[] = ['Text', 'Number', 'Select', 'MultiSelect', 'Color', 'Boolean', 'Image']

describe('quy tắc cờ theo kiểu dữ liệu (khớp backend)', () => {
  it('chỉ Select/Color/Image tạo được biến thể', () => {
    expect(ALL.filter(canBeVariantOption)).toEqual(['Select', 'Color', 'Image'])
  })

  it('mọi kiểu trừ Text đều lọc được', () => {
    expect(ALL.filter((t) => !canBeFilterable(t))).toEqual(['Text'])
  })

  it('danh sách giá trị chỉ có ở Select/MultiSelect/Color/Image', () => {
    expect(ALL.filter(hasValueList)).toEqual(['Select', 'MultiSelect', 'Color', 'Image'])
  })

  it('flagRestrictions khoá đúng cờ và "bắt buộc" khi là tuỳ chọn biến thể', () => {
    expect(flagRestrictions('Text', { isVariantOption: false })).toEqual({ isFilterable: 'type', isVariantOption: 'type', isRequired: null })
    expect(flagRestrictions('Select', { isVariantOption: true })).toEqual({ isFilterable: null, isVariantOption: null, isRequired: 'variant' })
  })

  it('normalizeFlags tắt các cờ bị khoá khi đổi kiểu', () => {
    const flags = { isFilterable: true, isVariantOption: true, isRequired: false }
    expect(normalizeFlags('Select', flags)).toEqual(flags)
    expect(normalizeFlags('Text', flags)).toEqual({ isFilterable: false, isVariantOption: false, isRequired: false })
    expect(normalizeFlags('Number', flags)).toEqual({ isFilterable: true, isVariantOption: false, isRequired: false })
  })

  it('bật tạo biến thể thì tự tắt "bắt buộc"', () => {
    expect(normalizeFlags('Color', { isFilterable: false, isVariantOption: true, isRequired: true }).isRequired).toBe(false)
    // Không phải biến thể thì giữ nguyên
    expect(normalizeFlags('Color', { isFilterable: false, isVariantOption: false, isRequired: true }).isRequired).toBe(true)
  })

  it('validateFlags báo đúng các tổ hợp backend từ chối', () => {
    expect(validateFlags('Text', { isFilterable: true, isVariantOption: true, isRequired: false })).toEqual({
      isFilterable: 'Kiểu dữ liệu này không dùng làm bộ lọc.',
      isVariantOption: 'Kiểu dữ liệu này không dùng để tạo biến thể.',
    })
    expect(validateFlags('MultiSelect', { isFilterable: true, isVariantOption: true, isRequired: false })).toEqual({ isVariantOption: 'Kiểu dữ liệu này không dùng để tạo biến thể.' })
    expect(validateFlags('Select', { isFilterable: true, isVariantOption: true, isRequired: false })).toEqual({})
  })
})

describe('giá trị thuộc tính', () => {
  it('valueKind theo kiểu', () => {
    expect(ALL.map(valueKind)).toEqual([null, null, 'plain', 'plain', 'color', null, 'image'])
  })

  it('kiểm tra và chuẩn hoá màu #RRGGBB', () => {
    expect(isHexColor('#a1B2c3')).toBe(true)
    expect(isHexColor('a1b2c3')).toBe(false)
    expect(isHexColor('#abc')).toBe(false)
    expect(normalizeHex('#abc')).toBe('#AABBCC')
    expect(normalizeHex(' ff0000 ')).toBe('#FF0000')
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex('xyz')).toBeNull()
  })

  const v = (id: string, sortOrder: number, label = id): AttributeValue => ({ id, code: id, label, colorHex: null, imageMediaId: null, image: null, sortOrder })

  it('thứ tự mặc định cho giá trị mới nằm cuối', () => {
    expect(nextValueSortOrder([])).toBe(10)
    expect(nextValueSortOrder([v('a', 10), v('b', 35)])).toBe(45)
  })

  it('planValueMove đổi chỗ và đánh số lại, chỉ trả mục đổi', () => {
    const values = [v('a', 10), v('b', 20), v('c', 30)]
    expect(planValueMove(values, 'b', 'up')).toEqual([{ id: 'b', sortOrder: 10 }, { id: 'a', sortOrder: 20 }])
    expect(planValueMove(values, 'b', 'down')).toEqual([{ id: 'c', sortOrder: 20 }, { id: 'b', sortOrder: 30 }])
  })

  it('planValueMove ở biên thì không làm gì', () => {
    const values = [v('a', 10), v('b', 20)]
    expect(planValueMove(values, 'a', 'up')).toEqual([])
    expect(planValueMove(values, 'b', 'down')).toEqual([])
    expect(planValueMove(values, 'zzz', 'up')).toEqual([])
  })

  it('planValueMove xử lý thứ tự trùng nhau (tất cả 0) bằng cách đánh số lại', () => {
    const values = [v('a', 0, 'A'), v('b', 0, 'B'), v('c', 0, 'C')]
    expect(planValueMove(values, 'c', 'up')).toEqual([
      { id: 'a', sortOrder: 10 }, { id: 'c', sortOrder: 20 }, { id: 'b', sortOrder: 30 },
    ])
  })

  it('valueToRequest giữ đủ trường và cho phép ghi đè', () => {
    const value = { ...v('a', 10), colorHex: '#FF0000' }
    expect(valueToRequest(value, { sortOrder: 20 })).toEqual({ code: 'a', label: 'a', colorHex: '#FF0000', imageMediaId: null, sortOrder: 20 })
  })
})
