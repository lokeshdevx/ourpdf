import type { Metadata } from 'next'
import { ArrowUpRight, Blocks, Calculator, Image as ImageIcon } from 'lucide-react'
import { CtaBand, PageHero } from '@/components/site/PageHero'
import { OTHER_APPS, SITE, SOCIAL_IMAGE } from '@/lib/site'

const TITLE = 'Other Free Tools – Image Editor & Calculator | OurPDF'
const DESC = 'More free web apps from the makers of OurPDF: Picut, an online image editor, and OurCalc, free online calculators. No sign-up needed.'

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  keywords: ['free online image editor', 'picut', 'online calculator', 'ourcalc', 'free web tools'],
  alternates: { canonical: '/other-tools' },
  openGraph: { title: TITLE, description: DESC, url: '/other-tools', type: 'website', siteName: SITE.name, images: [SOCIAL_IMAGE] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: [SOCIAL_IMAGE.url] },
}

const ICONS = { image: ImageIcon, calculator: Calculator } as const

export default function OtherToolsPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: TITLE, url: `${SITE.url}/other-tools`, description: DESC, isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url } },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE.name, item: SITE.url }, { '@type': 'ListItem', position: 2, name: 'Other tools', item: `${SITE.url}/other-tools` }] },
      { '@type': 'ItemList', name: 'Other free tools', numberOfItems: OTHER_APPS.length, itemListElement: OTHER_APPS.map((a, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'WebApplication', name: a.name, url: a.url, description: a.description, applicationCategory: a.tagline, operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } } })) },
    ],
  }
  return (
    <>
      <main className="overflow-x-clip pb-8">
        <PageHero
          crumb="Other tools"
          eyebrow={<><Blocks className="size-3.5 text-primary" aria-hidden /> From the makers of OurPDF</>}
          title={<>More free tools <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">for everyday work</span></>}
          text="Beyond PDFs: edit images and run quick calculations with our other free web apps – simple, fast and nothing to install."
        />

        <section aria-label="Our other apps" className="px-4 pt-12 sm:px-8 xl:px-12">
          <ul className="grid gap-5 md:grid-cols-2">
            {OTHER_APPS.map((a) => {
              const Icon = ICONS[a.icon]
              return (
                <li key={a.id}>
                  <a href={a.url} target="_blank" rel="noopener" data-testid={`other-app-${a.id}`} className="tool-card group flex h-full flex-col rounded-3xl border bg-card p-6 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/20"><Icon className="size-7" aria-hidden /></span>
                      <ArrowUpRight className="size-5 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                    </div>
                    <h2 className="mt-5 text-2xl font-extrabold tracking-tight">{a.name}</h2>
                    <p className="mt-1 text-sm font-semibold text-primary">{a.tagline} · {a.domain}</p>
                    <p className="mt-3 flex-1 leading-relaxed text-muted-foreground">{a.description}</p>
                    <ul className="mt-5 flex flex-wrap gap-2" aria-label={`${a.name} highlights`}>
                      {a.tags.map((t) => <li key={t} className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium">{t}</li>)}
                    </ul>
                    <span className="mt-6 inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm">Open {a.name} <ArrowUpRight className="size-4" aria-hidden /><span className="sr-only">(opens in a new tab)</span></span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>

        <CtaBand title="Back to your PDFs?" text="Every OurPDF tool runs privately in your browser – your files never leave your device." cta="Browse all PDF tools" href="/" />
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
    </>
  )
}
