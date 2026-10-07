import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Sparkles } from 'lucide-react'
import { Icon } from '@/components/marketing/icons'
import { CtaBand, PageHero } from '@/components/site/PageHero'
import { ToolIcon } from '@/tools/ui/ToolIcon'
import { FEATURE_CATEGORIES, TOTAL_FEATURES } from '@/lib/features'
import { CATEGORIES, TOOLS, toolHref } from '@/tools/registry'
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
      <main className="overflow-x-clip pb-8">
        <PageHero
          crumb="Features"
          eyebrow={<><Sparkles className="size-3.5 text-primary" aria-hidden /> Everything runs on your device</>}
          title={<>The complete OurPDF <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">feature list</span></>}
          text={`${TOTAL_FEATURES}+ capabilities across ${FEATURE_CATEGORIES.length} categories – editing, annotation, forms, signatures, OCR, security, conversion and more. Nothing is ever uploaded.`}
          stats={[{ value: `${TOTAL_FEATURES}+`, label: 'features' }, { value: `${TOOLS.length}`, label: 'focused tools' }, { value: `${FEATURE_CATEGORIES.length}`, label: 'categories' }, { value: '0', label: 'bytes uploaded' }]}
        >
          <nav aria-label="Feature categories" className="mt-8 flex flex-wrap gap-2">
            {FEATURE_CATEGORIES.map((c) => (<a key={c.id} href={`#${c.id}`} className="rounded-full border bg-background/80 px-3.5 py-1.5 text-sm font-medium backdrop-blur transition hover:border-primary hover:text-primary">{c.title}</a>))}
          </nav>
        </PageHero>

        <div className="px-4 pt-12 sm:px-8 xl:px-12">
          <div className="overflow-hidden rounded-3xl border bg-card">
            {FEATURE_CATEGORIES.map((c, idx) => (
              <section key={c.id} id={c.id} aria-labelledby={`cat-${c.id}`} className={`grid scroll-mt-24 gap-5 p-6 sm:p-8 lg:grid-cols-[minmax(240px,320px)_1fr] lg:gap-10 ${idx ? 'border-t' : ''}`}>
                <div className="flex items-start gap-4 lg:flex-col lg:gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/20"><Icon name={c.icon} className="size-6" /></span>
                  <div>
                    <h2 id={`cat-${c.id}`} className="text-lg font-bold tracking-tight">{c.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.blurb}</p>
                    <p className="mt-2 inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{c.items.length} features</p>
                  </div>
                </div>
                <ul className="flex flex-wrap content-start gap-2">
                  {c.items.map((i) => (<li key={i} className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm"><Check className="size-3.5 shrink-0 text-green-600" aria-hidden />{i}</li>))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <section className="px-4 pt-16 sm:px-8 xl:px-12" aria-labelledby="tools-h">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Try it now</p>
          <h2 id="tools-h" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Jump straight to a tool</h2>
          <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-5">
            {CATEGORIES.map((c) => (
              <div key={c.id} className="rounded-2xl border bg-card p-5">
                <h3 className="text-sm font-bold">{c.title}</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {TOOLS.filter((t) => t.category === c.id).map((t) => (<li key={t.slug}><Link href={toolHref(t)} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm transition hover:border-primary hover:text-primary"><ToolIcon name={t.icon} className="size-3.5 text-primary" />{t.name.replace(/ – .*$/, '')}</Link></li>))}
                </ul>
              </div>
            ))}
          </div>
        </section>
        <CtaBand title="Ready to try it – privately?" text="Pick a tool or open the full editor. Your files never leave your device." cta="Browse all tools" href="/" />
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </>
  )
}
