import type { MetadataRoute } from 'next'
import { SEO_PAGES } from '@/lib/seo-pages'
import { SITE } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: SITE.url, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE.url}/features`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE.url}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${SITE.url}/editor`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    ...SEO_PAGES.map((p) => ({ url: `${SITE.url}/${p.slug}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.8 })),
  ]
}
