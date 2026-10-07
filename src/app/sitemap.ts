import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'
import { TOOLS } from '@/tools/registry'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: SITE.url, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...TOOLS.map((t) => ({ url: `${SITE.url}/${t.slug}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.9 })),
    { url: `${SITE.url}/features`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE.url}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE.url}/editor`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ]
}
