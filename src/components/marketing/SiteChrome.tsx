import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'
import { MadeInIndia } from '@/components/made-in-india'
import { SEO_PAGES } from '@/lib/seo-pages'
import { SITE } from '@/lib/site'
import { BrandMark, Wordmark } from '@/components/brand'
import { MobileNav } from './MobileNav'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <BrandMark size={34} priority />
      <Wordmark className="text-xl" />
    </span>
  )
}

const label = (slug: string) => slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label={`${SITE.name} home`}><Logo /></Link>
        <nav aria-label="Main" className="ml-8 hidden items-center gap-1 text-sm md:flex">
          {[['/features', 'Features'], ['/#tools', 'Tools'], ['/privacy', 'Privacy'], ['/#faq', 'FAQ']].map(([href, text]) => (
            <Link key={href} href={href} className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{text}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/editor" className="hidden h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:inline-flex">Open editor</Link>
          <MobileNav tools={SEO_PAGES.map((p) => ({ slug: p.slug, label: label(p.slug) }))} />
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">A complete PDF editor that runs entirely in your browser. No uploads, no accounts, no tracking – and it works offline.</p>
          <Link href="/editor" className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Open OurPDF</Link>
        </div>
        <nav aria-label="PDF tools" className="lg:col-span-2">
          <h2 className="text-sm font-semibold">PDF tools</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {SEO_PAGES.map((p) => (<li key={p.slug}><Link href={`/${p.slug}`} className="hover:text-foreground hover:underline">{label(p.slug)}</Link></li>))}
          </ul>
        </nav>
        <nav aria-label="Company">
          <h2 className="text-sm font-semibold">Product</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/features" className="hover:text-foreground hover:underline">All features</Link></li>
            <li><Link href="/privacy" className="hover:text-foreground hover:underline">Privacy & security</Link></li>
            <li><Link href="/editor" className="hover:text-foreground hover:underline">Open editor</Link></li>
            <li><Link href="/#shortcuts" className="hover:text-foreground hover:underline">Keyboard shortcuts</Link></li>
            <li><Link href="/#faq" className="hover:text-foreground hover:underline">FAQ</Link></li>
          </ul>
        </nav>
      </div>
      <div className="flex flex-col items-center justify-center gap-2 border-t px-4 py-5 text-center text-xs text-muted-foreground sm:flex-row sm:gap-4">
        <span>Your files never leave your device. © {new Date().getFullYear()} {SITE.name} · ourpdf.space</span>
        <MadeInIndia className="font-medium text-foreground/80" />
      </div>
    </footer>
  )
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y overflow-hidden rounded-2xl border bg-card">
      {items.map((f) => (
        <details key={f.q} className="group px-5 py-4 open:bg-muted/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[15px] font-medium">
            <h3 className="text-[15px] font-medium">{f.q}</h3>
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border text-muted-foreground transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  )
}
