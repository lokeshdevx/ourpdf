import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, CheckCircle2, Lock } from 'lucide-react'
import { Faq } from '@/components/marketing/SiteChrome'
import { SITE, SOCIAL_IMAGE } from '@/lib/site'
import { CATEGORIES, TOOL_MAP, TOOLS, toolHref } from '@/tools/registry'
import { TOOL_SEO } from '@/tools/seo'
import { ToolIcon } from '@/tools/ui/ToolIcon'
import { ToolLoader } from '@/tools/ui/ToolLoader'

export const dynamicParams = false

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const { tool } = await params
  const t = TOOL_MAP.get(tool)
  const seo = TOOL_SEO.get(tool)
  if (!t || !seo) return {}
  return {
    title: seo.title,
    description: seo.description,
    keywords: t.keywords,
    alternates: { canonical: `/${t.slug}` },
    openGraph: { title: seo.title, description: seo.description, url: `/${t.slug}`, type: 'website', siteName: SITE.name, images: [SOCIAL_IMAGE] },
    twitter: { card: 'summary_large_image', title: seo.title, description: seo.description, images: [SOCIAL_IMAGE.url] },
  }
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params
  const t = TOOL_MAP.get(tool)
  const seo = TOOL_SEO.get(tool)
  if (!t || !seo) notFound()
  const cat = CATEGORIES.find((c) => c.id === t.category)!
  const related = TOOLS.filter((x) => x.category === t.category && x.slug !== t.slug).slice(0, 6)
  const url = `${SITE.url}/${t.slug}`
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebApplication', name: t.name, url, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', description: seo.description, isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, featureList: seo.points },
      { '@type': 'HowTo', name: `How to use ${t.name}`, step: seo.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: `Step ${i + 1}`, text: s })) },
      { '@type': 'FAQPage', mainEntity: seo.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE.name, item: SITE.url }, { '@type': 'ListItem', position: 2, name: cat.title, item: `${SITE.url}/#${cat.id}` }, { '@type': 'ListItem', position: 3, name: t.name, item: url }] },
    ],
  }
  return (
    <main className="px-4 pb-8 pt-6 sm:px-8 xl:px-12">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5"><li><Link href="/" className="hover:text-foreground">All tools</Link></li><li aria-hidden>/</li><li><Link href={`/#${cat.id}`} className="hover:text-foreground">{cat.title}</Link></li><li aria-hidden>/</li><li aria-current="page" className="text-foreground">{t.name}</li></ol>
      </nav>
      <header className="mb-8 flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/25"><ToolIcon name={t.icon} className="size-7" /></span>
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-extrabold tracking-tight sm:text-3xl">{t.name}</h1>
          <p className="mt-1.5 max-w-3xl text-pretty text-muted-foreground">{t.description}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Lock className="size-3.5 text-primary" aria-hidden /> Runs in your browser · files never leave your device</p>
        </div>
      </header>

      {t.editor ? (
        <section className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-10">
          <p className="mx-auto max-w-xl text-muted-foreground">Editing text, adding images and placing signatures happens in the full-screen PDF editor.</p>
          <Link href={`/editor?tool=${t.editor}`} className="mt-5 inline-flex h-12 items-center rounded-xl bg-primary px-8 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:bg-primary/90" data-testid="tool-cta">Open the PDF editor <ArrowRight className="ml-2 size-4" aria-hidden /></Link>
        </section>
      ) : (
        <ToolLoader slug={t.slug} />
      )}

      <div className="mt-16 space-y-12">
        <section aria-labelledby="how">
          <h2 id="how" className="text-xl font-bold tracking-tight">How to use {t.name.replace(/ – .*$/, '')}</h2>
          <ol className="mt-4 space-y-3">
            {seo.steps.map((s, i) => (
              <li key={i} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span><p className="pt-0.5 text-sm leading-relaxed">{s}</p></li>
            ))}
          </ol>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {seo.points.map((p) => <li key={p} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> {p}</li>)}
          </ul>
        </section>
        <section aria-labelledby="faq-h">
          <h2 id="faq-h" className="text-xl font-bold tracking-tight">Questions & answers</h2>
          <div className="mt-4"><Faq items={seo.faq} /></div>
        </section>
      </div>

      <p className="mt-10 max-w-3xl text-sm leading-relaxed text-muted-foreground">{seo.intro}</p>

      {related.length > 0 && (
        <aside aria-labelledby="related" className="mt-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Keep going</p>
              <h2 id="related" className="mt-1 text-xl font-bold tracking-tight">More {cat.title.toLowerCase()} tools</h2>
            </div>
            <Link href={`/#${cat.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">See all {cat.title.toLowerCase()} <ArrowRight className="size-4" aria-hidden /></Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={toolHref(r)} className="tool-card group relative flex h-full gap-3.5 rounded-2xl border bg-card p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><ToolIcon name={r.icon} className="size-5" /></span>
                  <span className="min-w-0 flex-1 pr-5">
                    <span className="block text-sm font-semibold leading-snug">{r.name}</span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{r.description}</span>
                  </span>
                  <ArrowRight className="absolute right-4 top-4 size-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </main>
  )
}
