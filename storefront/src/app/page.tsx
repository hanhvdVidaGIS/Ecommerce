import { HomeSections } from '@/components/home/HomeSections'
import { getSiteConfig } from '@/lib/site'

export default async function HomePage() {
  const config = await getSiteConfig()
  return <HomeSections config={config} />
}
