import { forwardRef, type SelectHTMLAttributes } from 'react'
import { Select } from '@/components/ui/primitives'
import type { CategoryItem } from './api'
import { categoryOptionLabel } from './model'

/** Ô chọn một danh mục (cây có thụt lề). `placeholder` là dòng đầu có giá trị rỗng. */
export const CategorySelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { categories: readonly CategoryItem[] | undefined; placeholder: string; invalid?: boolean }>(
  function CategorySelect({ categories, placeholder, ...rest }, ref) {
    return (
      <Select ref={ref} {...rest}>
        <option value="">{placeholder}</option>
        {categories?.map((c) => <option key={c.id} value={c.id}>{categoryOptionLabel(c)}</option>)}
      </Select>
    )
  },
)
