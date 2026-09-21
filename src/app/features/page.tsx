import type { Metadata } from 'next'
import Link from 'next/link'
import { CtaBand, FeatureCategories, SectionHeading } from '@/components/marketing/Sections'
import { SiteFooter, SiteHeader } from '@/components/marketing/SiteChrome'
import { FEATURE_CATEGORIES, TOTAL_FEATURES } from '@/lib/features'
import { SEO_PAGES } from '@/lib/seo-pages'
import { SITE, SOCIAL_IMAGE } from '@/lib/site'

const TITLE = 'All PDF Editor Features – Complete List | OurPDF'
const DESC = `Every OurPDF feature in one place: ${TOTAL_FEATURES}+ tools for editing, annotating, signing, OCR, forms, page management, security, conversion and compression – all private and in your browser.`

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  keywords: ['pdf editor features', 'pdf editor tools list', 'pdf annotation tools', 'pdf form builder', 'pdf ocr', 'pdf redaction', 'pdf page organizer'],
  alternates: { canonical: '/features' },
  openGraph: { title: TITLE, description: DESC, url: '/features', type: 'website', siteName: SITE.name, images: [SOCIAL_IMAGE] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: [SOCIAL_IMAGE.url] },
}

export default function FeaturesPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: TITLE, url: `${SITE.url}/features`, description: DESC, isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url } },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE.name, item: SITE.url }, { '@type': 'ListItem', position: 2, name: 'Features', item: `${SITE.url}/features` }] },
      { '@type': 'ItemList', name: 'OurPDF feature categories', numberOfItems: FEATURE_CATEGORIES.length, itemListElement: FEATURE_CATEGORIES.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, url: `${SITE.url}/features#${c.id}` })) },
      { '@type': 'SoftwareApplication', name: SITE.name, applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, featureList: FEATURE_CATEGORIES.flatMap((c) => c.items) },
    ],
  }
  return (
    <>
      <SiteHeader />
      <main>
        <header className="relative overflow-hidden border-b">
          <div className="bg-grid absolute inset-0 -z-10" aria-hidden />
          <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground"><ol className="flex justify-center gap-2"><li><Link href="/" className="hover:underline">Home</Link></li><li aria-hidden>/</li><li aria-current="page">Features</li></ol></nav>
            <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">The complete OurPDF <span className="bg-gradient-to-r from-primary via-violet-500 to-cyan-500 bg-clip-text text-transparent box-decoration-clone">feature list</span></h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{TOTAL_FEATURES}+ capabilities across {FEATURE_CATEGORIES.length} categories. Every one of them runs on your device – nothing is uploaded.</p>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <nav aria-label="Feature categories" className="mb-12 flex flex-wrap justify-center gap-2">
            {FEATURE_CATEGORIES.map((c) => (<a key={c.id} href={`#${c.id}`} className="rounded-full border bg-card px-4 py-1.5 text-sm transition hover:border-primary hover:text-primary">{c.title}</a>))}
          </nav>
          <FeatureCategories headingLevel={2} />
        </div>
        <section className="border-t bg-muted/30" aria-labelledby="tools-h">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
            <SectionHeading id="tools-h" title="Jump straight to a tool" />
            <ul className="mt-8 flex flex-wrap justify-center gap-2">
              {SEO_PAGES.map((p) => (<li key={p.slug}><Link href={`/${p.slug}`} className="inline-block rounded-full border bg-card px-4 py-2 text-sm transition hover:border-primary hover:text-primary">{p.h1}</Link></li>))}
            </ul>
          </div>
        </section>
        <CtaBand />
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </>
  )
}
