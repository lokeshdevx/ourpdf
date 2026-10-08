import Link from 'next/link'
import { Coffee, Mail } from 'lucide-react'
import { BrandMark, Wordmark } from '@/components/brand'
import { MadeInIndia } from '@/components/made-in-india'
import { BackToTop } from '@/components/marketing/BackToTop'
import { OTHER_APPS, SITE } from '@/lib/site'
import { CATEGORIES, TOOLS, toolHref } from '@/tools/registry'
import { SidebarNav } from './SidebarNav'
import { Clarity } from './Clarity'
import { TopBar } from './TopBar'

const COLUMNS: { title: string; slugs: string[] }[] = [
  { title: 'Popular tools', slugs: ['merge-pdf', 'compress-pdf', 'split-pdf', 'edit-pdf', 'sign-pdf', 'organize-pdf', 'rotate-pdf', 'add-watermark'] },
  { title: 'Convert', slugs: ['pdf-to-word', 'word-to-pdf', 'pdf-to-jpg', 'images-to-pdf', 'pdf-to-excel', 'excel-to-pdf', 'pdf-to-powerpoint', 'powerpoint-to-pdf'] },
  { title: 'Security & AI', slugs: ['encrypt-pdf', 'remove-password', 'redact-pdf', 'auto-redact-pii', 'ocr-pdf', 'chat-with-pdf', 'ai-pdf-summarizer', 'compare-pdfs'] },
  { title: 'Business & more', slugs: ['gst-invoice-generator', 'pos-bill-generator', 'resume-builder', 'scan-document', 'text-to-handwriting', 'p2p-file-share', 'pdf-workflow', 'repair-pdf'] },
]

const linkCls = 'text-muted-foreground transition-colors hover:text-foreground'

function Footer() {
  const bySlug = new Map(TOOLS.map((t) => [t.slug, t]))
  return (
    <footer className="mt-16 border-t bg-muted/30">
      {/* support band */}
      <div className="border-b bg-gradient-to-r from-primary/[0.08] via-transparent to-violet-500/[0.08]">
        <div className="flex flex-col items-start justify-between gap-4 px-4 py-8 sm:px-8 md:flex-row md:items-center xl:px-12">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Enjoying OurPDF? Help keep it free.</h2>
            <p className="mt-1 text-sm text-muted-foreground">No ads, no paywalls – support from people like you keeps every tool free.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={SITE.coffeeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#FFDD00] px-5 text-sm font-semibold text-black shadow-sm transition hover:-translate-y-0.5 hover:brightness-95" data-testid="footer-coffee"><Coffee className="size-4" aria-hidden /> Buy me a coffee</a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:px-8 lg:grid-cols-[1.5fr_repeat(4,1fr)] xl:px-12">
        <div className="col-span-2 space-y-4 lg:col-span-1">
          <Link href="/" className="flex items-center gap-2"><BrandMark size={30} /><Wordmark className="text-xl" /></Link>
          <p className="max-w-sm text-sm text-muted-foreground">{TOOLS.length} free PDF tools that run entirely in your browser. No uploads, no accounts – and they work offline.</p>
          <ul className="space-y-2 text-sm">
            <li><a href={`mailto:${SITE.contactEmail}`} className={`inline-flex items-center gap-2 ${linkCls}`} data-testid="footer-email"><Mail className="size-4 text-primary" aria-hidden /> {SITE.contactEmail}</a></li>
            <li className="text-muted-foreground"><MadeInIndia /></li>
          </ul>
          <div>
            <h2 className="text-sm font-semibold">More free tools</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {OTHER_APPS.map((a) => <li key={a.id}><a href={a.url} target="_blank" rel="noopener" className={linkCls}>{a.name} <span className="text-xs">– {a.tagline.toLowerCase()}</span></a></li>)}
            </ul>
          </div>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {col.slugs.map((s) => { const t = bySlug.get(s); return t ? <li key={s}><Link href={toolHref(t)} className={linkCls}>{t.name.replace(/ – .*$/, '')}</Link></li> : null })}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t">
        <nav aria-label="Site" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-5 text-sm sm:px-8 xl:px-12">
          <Link href="/" className={linkCls}>All tools</Link>
          {CATEGORIES.map((c) => <Link key={c.id} href={`/#${c.id}`} className={linkCls}>{c.title}</Link>)}
          <Link href="/features" className={linkCls}>Features</Link>
          <Link href="/privacy" className={linkCls}>Privacy & security</Link>
          <Link href="/other-tools" className={linkCls}>Other tools</Link>
        </nav>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-8 xl:px-12">
        <span>© {new Date().getFullYear()} {SITE.name} · ourpdf.space · Your files never leave your device.</span>
        <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <MadeInIndia />
          <a href={SITE.coffeeUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Buy me a coffee</a>
          <a href={`mailto:${SITE.contactEmail}`} className="hover:text-foreground">{SITE.contactEmail}</a>
        </span>
      </div>
    </footer>
  )
}

/** Public site layout: tool sidebar on the left, page content on the right. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell min-h-dvh">
      <aside className="sidebar-blue fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col lg:flex" aria-label="Sidebar">
        <Link href="/" aria-label="OurPDF home" className="flex h-16 shrink-0 items-center gap-2 px-5"><span className="grid size-9 place-items-center rounded-xl bg-white shadow-sm"><BrandMark size={26} priority /></span><span className="text-xl font-extrabold tracking-tight text-white">Our<span className="text-sky-200">PDF</span></span></Link>
        <div className="min-h-0 flex-1"><SidebarNav /></div>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-[272px]">
        <TopBar />
        <div className="flex-1">{children}</div>
        <Footer />
        <BackToTop />
      </div>
      <Clarity />
    </div>
  )
}
