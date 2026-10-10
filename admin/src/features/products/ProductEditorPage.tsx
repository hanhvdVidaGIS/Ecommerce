import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLabels } from '@/api/hooks'
import { ErrorState, PageHeader } from '@/components/ui/data'
import { Card, Skeleton } from '@/components/ui/primitives'
import { useAttributeDefs, useBrandOptions, useCategoryTree, useProduct } from './api'
import { ProductForm } from './ProductForm'
import { StatusBadge } from './StatusBadge'

function EditorSkeleton() {
  return (
    <Card className="space-y-3 p-4" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9" />)}
    </Card>
  )
}

/** Tải chi tiết sản phẩm, danh mục, thương hiệu và định nghĩa thuộc tính, rồi mới dựng form (form chỉ nhận dữ liệu ban đầu một lần). */
export default function ProductEditorPage() {
  const { id } = useParams()
  const labels = useLabels()
  const noun = labels.product.toLowerCase()
  const product = useProduct(id)
  const categories = useCategoryTree()
  const brands = useBrandOptions()

  const neededAttributeIds = useMemo(() => {
    const d = product.data
    return d ? [...d.applicableAttributeIds, ...d.optionAttributeIds, ...d.attributes.map((a) => a.attributeId)] : []
  }, [product.data])
  const attrs = useAttributeDefs(neededAttributeIds)

  const error = (id ? product.error : null) ?? categories.error ?? brands.error ?? attrs.error
  const loading = (id ? product.isLoading : false) || categories.isLoading || brands.isLoading || attrs.loading
  const retry = () => { product.refetch(); categories.refetch(); brands.refetch() }

  const title = id ? (product.data?.name ?? noun) : `Thêm ${noun}`
  return (
    <>
      <Link to="/products" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-text"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {labels.product}</Link>
      <PageHeader title={title} actions={product.data ? <StatusBadge status={product.data.status} /> : undefined} />
      {error ? (
        <Card><ErrorState error={error} onRetry={retry} /></Card>
      ) : loading || (id && !product.data) || !categories.data || !brands.data ? (
        <EditorSkeleton />
      ) : (
        // key theo mã để chuyển từ /new sang /:id (sau khi tạo) dựng lại form từ dữ liệu máy chủ
        <ProductForm key={id ?? 'new'} detail={product.data ?? null} categories={categories.data} brands={brands.data} initialDefs={attrs.defs} />
      )}
    </>
  )
}
