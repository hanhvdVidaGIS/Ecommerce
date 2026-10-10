import { PageHeader, EmptyState } from '@/components/ui/data'
import { Card } from '@/components/ui/primitives'

export default function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card><EmptyState title="Chưa có giao diện cho mục này" description="Chức năng đang được xây dựng." /></Card>
    </>
  )
}
