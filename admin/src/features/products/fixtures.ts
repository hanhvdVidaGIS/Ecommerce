import type { AttributeDef, ProductDetail } from './api'
import type { VariantFormValue } from './model'

/** Dữ liệu dựng sẵn cho test (không dùng ngoài test). */
export function attrDef(over: Partial<AttributeDef> & Pick<AttributeDef, 'id' | 'name' | 'dataType'>): AttributeDef {
  return {
    code: over.id, unit: null, isFilterable: false, isVariantOption: false, isRequired: false, isVisibleOnProduct: true, isActive: true, sortOrder: 0,
    values: [], categoryIds: [], ...over,
  }
}

export const SIZE = attrDef({
  id: 'a-size', name: 'Dung tích', dataType: 'Select', isVariantOption: true,
  values: [
    { id: 'v-50', code: '50', label: '50 ml', colorHex: null, imageMediaId: null, image: null, sortOrder: 1 },
    { id: 'v-100', code: '100', label: '100 ml', colorHex: null, imageMediaId: null, image: null, sortOrder: 2 },
  ],
})

export const COLOR = attrDef({
  id: 'a-color', name: 'Màu', dataType: 'Color', isVariantOption: true,
  values: [
    { id: 'c-red', code: 'red', label: 'Đỏ', colorHex: 'red', imageMediaId: null, image: null, sortOrder: 1 },
    { id: 'c-blue', code: 'blue', label: 'Xanh', colorHex: 'blue', imageMediaId: null, image: null, sortOrder: 2 },
  ],
})

export function variant(over: Partial<VariantFormValue> = {}): VariantFormValue {
  return {
    variantId: null, sku: 'SKU-1', barcode: '', price: '100', salePrice: '', costPrice: '', stockQuantity: '0', isActive: true,
    imageMediaId: null, imageUrl: null, options: [], label: '', ...over,
  }
}

export function detail(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: 'p-1', name: 'SP', slug: 'sp', primaryCategoryId: 'cat-1', categoryIds: ['cat-1', 'cat-2'], brandId: 'b-1', shortDescription: null,
    description: '<p>x</p>', videoUrl: null, status: 'Active', isFeatured: true, isBestSeller: false, isNew: false,
    seo: { metaTitle: 'T', metaDescription: null, keywords: null, ogImageMediaId: null, canonicalUrl: null, noIndex: false },
    images: [], attributes: [], optionAttributeIds: [], canViewCost: true, applicableAttributeIds: [],
    variants: [{
      id: 'var-1', sku: 'SP-1', barcode: null, price: 100, salePrice: 90, costPrice: 50, stockQuantity: 5, isDefault: true, isActive: true,
      imageMediaId: null, image: null, options: [],
    }],
    ...over,
  }
}
