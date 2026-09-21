import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, CheckCircle2, Lock, Sparkles } from 'lucide-react'
import { Icon } from '@/components/marketing/icons'
import { CtaBand, FeatureChips, SectionHeading } from '@/components/marketing/Sections'
import { Faq, SiteFooter, SiteHeader } from '@/components/marketing/SiteChrome'
import { FEATURE_LIST, TOTAL_FEATURES } from '@/lib/features'
import { SEO_EXTRA } from '@/lib/seo-extra'
import { SEO_MAP, SEO_PAGES } from '@/lib/seo-pages'
import { SITE, SOCIAL_IMAGE } from '@/lib/site'

export const dynamicParams = false

export function generateStaticParams() {
  return SEO_PAGES.map((p) => ({ tool: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const { tool } = await params
  const page = SEO_MAP.get(tool)
  if (!page) return {}
  return {
    title: page.title,
    description: page.description,
    keywords: SEO_EXTRA[page.slug]?.keywords,
    alternates: { canonical: `/${page.slug}` },
    openGraph: { title: page.title, description: page.description, url: `/${page.slug}`, type: 'website', siteName: SITE.name, images: [SOCIAL_IMAGE] },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description, images: [SOCIAL_IMAGE.url] },
  }
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params
  const page = SEO_MAP.get(tool)
  if (!page) notFound()
  const extra = SEO_EXTRA[page.slug]
  const href = page.tool === 'editor' ? '/editor' : `/editor?tool=${page.tool}`
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebApplication', name: `${SITE.name} – ${page.h1}`, url: `${SITE.url}/${page.slug}`, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', description: page.description, isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, featureList: [...page.points, ...FEATURE_LIST] },
      { '@type': 'HowTo', name: page.h1, description: page.description, step: page.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: `Step ${i + 1}`, text: s })) },
      { '@type': 'FAQPage', mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE.name, item: SITE.url }, { '@type': 'ListItem', position: 2, name: page.h1, item: `${SITE.url}/${page.slug}` }] },
    ],
  }
  return (
    <>
      <SiteHeader />
      <main>
        <header className="relative overflow-hidden border-b">
          <div className="bg-grid absolute inset-0 -z-10" aria-hidden />
          <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/10 to-transparent" aria-hidden />
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
            <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground"><ol className="flex flex-wrap gap-2"><li><Link href="/" className="hover:underline">Home</Link></li><li aria-hidden>/</li><li aria-current="page">{page.h1}</li></ol></nav>
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
              <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/30"><Icon name={extra?.icon ?? 'Layers'} className="size-8" /></span>
              <div>
                <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">{page.h1}</h1>
                <p className="mt-4 max-w-3xl text-pretty text-lg text-muted-foreground">{page.intro}</p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href={href} className="inline-flex h-12 items-center rounded-xl bg-primary px-8 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:bg-primary/90" data-testid="tool-cta">{page.cta}</Link>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="size-4 text-primary" aria-hidden /> Free · No upload · Works offline</span>
            </div>
          </div>
        </header>

        <article className="mx-auto max-w-5xl space-y-20 px-4 py-16 sm:px-6">
          <section aria-labelledby="how">
            <SectionHeading id="how" eyebrow="How it works" title={`How to ${page.h1.charAt(0).toLowerCase()}${page.h1.slice(1)}`} />
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {page.steps.map((s, i) => (
                <li key={s} className="card-lift rounded-2xl border bg-card p-6"><span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span><p className="mt-4 leading-relaxed">{s}</p></li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="why">
            <SectionHeading id="why" eyebrow="Why OurPDF" title="Built for this job – and private by design" />
            <ul className="mt-10 grid gap-3 sm:grid-cols-2">
              {page.points.map((p) => (<li key={p} className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" aria-hidden /> {p}</li>))}
            </ul>
            <p className="mt-6 flex items-start gap-3 rounded-xl border bg-primary/5 p-4 text-sm"><Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /><span><strong>Private by design:</strong> your PDF is processed inside your browser. It is never uploaded, and there is no account to create.</span></p>
          </section>

          {extra && (
            <section aria-labelledby="uses">
              <SectionHeading id="uses" eyebrow="Use cases" title="What people use it for" />
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {extra.useCases.map((u) => (<li key={u} className="flex items-center gap-3 rounded-xl border bg-card p-4"><Sparkles className="size-5 shrink-0 text-amber-500" aria-hidden /> {u}</li>))}
              </ul>
            </section>
          )}

          <section aria-labelledby="faq"><SectionHeading id="faq" eyebrow="FAQ" title="Questions & answers" /><div className="mt-8"><Faq items={page.faq} /></div></section>

          <section aria-labelledby="all">
            <SectionHeading id="all" eyebrow={`${TOTAL_FEATURES - (TOTAL_FEATURES % 10)}+ features`} title="Everything else OurPDF can do" text="One private workspace – the same editor also includes all of these tools." />
            <div className="mt-10"><FeatureChips /></div>
            <p className="mt-8 text-center"><Link href="/features" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Browse the full feature list <ArrowRight className="size-4" aria-hidden /></Link></p>
          </section>

          <aside aria-labelledby="related">
            <h2 id="related" className="text-2xl font-bold tracking-tight">Related PDF tools</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {page.related.map((r) => { const rp = SEO_MAP.get(r); return rp ? (
                <li key={r}><Link href={`/${r}`} className="card-lift flex h-full flex-col rounded-xl border bg-card p-4"><Icon name={SEO_EXTRA[r]?.icon ?? 'Layers'} className="size-5 text-primary" /><span className="mt-3 text-sm font-medium leading-snug">{rp.h1}</span></Link></li>
              ) : null })}
            </ul>
          </aside>
        </article>
        <CtaBand title={`${page.cta} now`} text="Nothing to install, nothing to upload." cta={page.cta} href={href} />
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </>
  )
}
