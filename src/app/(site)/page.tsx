import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock, ShieldCheck, WifiOff, Zap } from 'lucide-react'
import { Faq } from '@/components/marketing/SiteChrome'
import { SITE } from '@/lib/site'
import { CATEGORIES, TOOLS, toolHref } from '@/tools/registry'
import { ToolIcon } from '@/tools/ui/ToolIcon'

const TITLE = `${SITE.name} – Free PDF Editor & ${TOOLS.length} PDF Tools Online (No Upload)`
const DESCRIPTION = `Free online PDF editor: edit, merge, split, compress, convert, sign and OCR PDFs – ${TOOLS.length} free tools that run in your browser. No upload, no sign-up, works offline.`

/** The tools most people come for – linked prominently from the hero (the links search engines pick as sitelinks). */
const POPULAR: [string, string][] = [['edit-pdf', 'Edit PDF'], ['merge-pdf', 'Merge PDF'], ['compress-pdf', 'Compress PDF'], ['split-pdf', 'Split PDF'], ['pdf-to-word', 'PDF to Word'], ['sign-pdf', 'Sign PDF']]
const BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]))

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ['pdf editor', 'free pdf editor', 'online pdf editor', 'pdf tools', 'free pdf tools online', 'merge pdf', 'compress pdf', 'pdf to word', 'split pdf', 'sign pdf', 'pdf editor', 'private pdf', 'pdf without upload', 'gst invoice'],
  alternates: { canonical: '/' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/', type: 'website', siteName: SITE.name },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export const FAQ = [
  { q: 'Are my PDFs uploaded to a server?', a: 'Never. Every tool runs inside your browser on your own device. Your files are processed locally and never sent anywhere; in the editor, a strict Content-Security-Policy even blocks every connection to other websites.' },
  { q: 'Is OurPDF really free?', a: 'Yes. All tools are free, with no account, no watermark and no limit on the number of files – only your device’s memory applies.' },
  { q: 'Can it convert PDF to Word, Excel or PowerPoint?', a: 'Yes – on your device. Text, headings and tables are rebuilt as editable .docx, .xlsx and .pptx files. Scanned PDFs need OCR first.' },
  { q: 'Does it work on my phone and offline?', a: 'Yes. Every tool works in modern mobile and desktop browsers, and after your first visit the site keeps working without an internet connection. You can also install it as an app.' },
  { q: 'Are the AI tools private too?', a: 'Yes. Chat with PDF, the summariser and audio transcription use small AI models that run inside your browser. Nothing is sent to a cloud AI service.' },
  { q: 'Is redaction real or just a black box?', a: 'Real. Redacted pages are re-rendered with the boxes burned into the pixels and the original text is removed from the file.' },
]

const WHY = [
  { icon: Lock, title: 'Nothing is uploaded', text: 'Files are processed on your device. There is no server to send them to.' },
  { icon: Zap, title: 'Fast and simple', text: 'Open a tool, drop a file, get the result. No sign-up, no waiting in queues.' },
  { icon: WifiOff, title: 'Works offline', text: 'After the first visit, the tools keep working without a connection.' },
  { icon: ShieldCheck, title: 'Free, no watermark', text: 'Every tool is free with no limits and nothing stamped on your files.' },
]

export default function Home() {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE.url}/#website`, name: SITE.name, alternateName: ['Our PDF', 'ourpdf.space'], url: SITE.url, description: DESCRIPTION, inLanguage: 'en', publisher: { '@id': `${SITE.url}/#org` } },
      { '@type': 'Organization', '@id': `${SITE.url}/#org`, name: SITE.name, url: SITE.url, logo: `${SITE.url}/logo.png`, email: SITE.contactEmail },
      { '@type': 'SiteNavigationElement', name: POPULAR.map(([, l]) => l), url: POPULAR.map(([slug]) => `${SITE.url}/${slug}`) },
      { '@type': 'SoftwareApplication', name: SITE.name, url: SITE.url, applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', description: DESCRIPTION, isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
      { '@type': 'ItemList', name: 'PDF tools', itemListElement: TOOLS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE.url}${toolHref(t)}`, name: t.name })) },
      { '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
  }
  return (
    <main className="overflow-x-clip pb-8">
      <section className="relative isolate overflow-hidden border-b bg-gradient-to-br from-primary/[0.07] via-background to-violet-500/[0.07]" aria-labelledby="hero-h">
        <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-60" aria-hidden />
        <div className="pointer-events-none absolute -right-32 -top-32 -z-10 size-[28rem] rounded-full bg-primary/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 left-1/4 -z-10 size-96 rounded-full bg-violet-500/10 blur-3xl" aria-hidden />
        <div className="px-4 pb-10 pt-10 sm:px-8 sm:pt-14 xl:px-12">
          <p className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-semibold text-muted-foreground"><Lock className="size-3.5 text-primary" aria-hidden /> 100% private · runs in your browser</p>
          <h1 id="hero-h" className="mt-4 max-w-4xl text-balance text-4xl font-extrabold tracking-tight sm:text-5xl xl:text-6xl">Every PDF tool you need, <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">without uploading a thing</span></h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">{TOOLS.length} free tools to merge, split, compress, convert, sign, protect and understand your documents. Pick a tool below to get started.</p>
          <nav aria-label="Popular tools" className="mt-7" data-testid="popular-tools">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Popular tools</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {POPULAR.map(([slug, label]) => {
                const t = BY_SLUG.get(slug)!
                return <li key={slug}><Link href={toolHref(t)} className="flex h-11 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:text-primary"><ToolIcon name={t.icon} className="size-4 shrink-0 text-primary" />{label}</Link></li>
              })}
            </ul>
          </nav>
          <nav aria-label="Jump to category" className="mt-6 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => <a key={c.id} href={`#${c.id}`} className="rounded-full border bg-background/80 px-3.5 py-1.5 text-sm font-medium backdrop-blur transition hover:border-primary hover:text-primary">{c.title}</a>)}
          </nav>
        </div>
      </section>

      <div className="px-4 pt-10 sm:px-8 xl:px-12">
      <div className="space-y-12" id="tools">
        {CATEGORIES.map((c) => {
          const items = TOOLS.filter((t) => t.category === c.id)
          return (
            <section key={c.id} id={c.id} aria-labelledby={`cat-${c.id}`} className="scroll-mt-24">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id={`cat-${c.id}`} className="text-xl font-bold tracking-tight sm:text-2xl">{c.title}</h2>
                <p className="text-sm text-muted-foreground">{c.blurb}</p>
              </div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3">
                {items.map((t) => (
                  <li key={t.slug}>
                    <Link href={toolHref(t)} className="tool-card group flex h-full gap-3.5 rounded-2xl border bg-card p-4" data-testid={`tool-${t.slug}`}>
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><ToolIcon name={t.icon} className="size-5" /></span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-semibold leading-snug">{t.name}{t.isNew && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">New</span>}</span>
                        <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{t.description}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <section aria-labelledby="why-h" className="mt-20">
        <h2 id="why-h" className="text-2xl font-bold tracking-tight">Why people choose OurPDF</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map((w) => (
            <li key={w.title} className="rounded-2xl border bg-card p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white"><w.icon className="size-5" aria-hidden /></span>
              <h3 className="mt-4 font-semibold">{w.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{w.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" aria-labelledby="faq-h" className="mt-20 scroll-mt-24">
        <h2 id="faq-h" className="text-2xl font-bold tracking-tight">Frequently asked questions</h2>
        <div className="mt-6"><Faq items={FAQ} /></div>
      </section>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </main>
  )
}
