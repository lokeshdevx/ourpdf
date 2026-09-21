import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Download, Eye, ShieldCheck, Upload, Wand2 } from 'lucide-react'
import { Hero } from '@/components/marketing/Hero'
import { Icon } from '@/components/marketing/icons'
import { CtaBand, FeatureCategories, SectionHeading, Stats } from '@/components/marketing/Sections'
import { Faq, SiteFooter, SiteHeader } from '@/components/marketing/SiteChrome'
import { FEATURE_LIST, TOTAL_FEATURES } from '@/lib/features'
import { SEO_PAGES } from '@/lib/seo-pages'
import { SEO_EXTRA } from '@/lib/seo-extra'
import { SITE } from '@/lib/site'

const TITLE = `${SITE.name} – Free Private PDF Editor Online (No Upload)`
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: 'Edit, merge, split, compress, sign, annotate, OCR and convert PDFs in your browser. 300+ features, no upload, no account, works offline. Files never leave your device.',
  keywords: ['pdf editor', 'online pdf editor', 'free pdf editor', 'private pdf editor', 'edit pdf without upload', 'merge pdf', 'split pdf', 'compress pdf', 'sign pdf', 'ocr pdf', 'offline pdf editor'],
  alternates: { canonical: '/' },
  openGraph: { title: TITLE, description: SITE.description, url: '/', type: 'website', siteName: SITE.name },
  twitter: { card: 'summary_large_image', title: TITLE, description: SITE.description },
}

export const FAQ = [
  { q: 'Are my PDFs uploaded to a server?', a: 'Never. There is no backend. Files are opened and processed entirely in your browser, and the site’s Content-Security-Policy blocks requests to other origins so the browser itself prevents leaks.' },
  { q: 'Is OurPDF really free?', a: 'Yes. There are no accounts, no watermarks and no per-file limits imposed by us – only the memory of your own device applies.' },
  { q: 'Can I really edit existing text in a PDF?', a: 'You can replace text by covering the original and typing over it. PDFs do not store editable paragraphs, so perfect native editing is not always possible – and the app tells you so. To delete content permanently, use Redact.' },
  { q: 'Is redaction real or just a black box?', a: 'Real. Pages with redactions are re-rendered with the boxes burned into the pixels and the original content underneath is discarded from the file. The text layer is rebuilt without the redacted text.' },
  { q: 'Are the signatures legally binding?', a: 'OurPDF adds visual e-signatures (drawn, typed or uploaded images). They are not certificate-based digital signatures, and the interface says so.' },
  { q: 'Does it work offline?', a: 'Yes. After your first visit the app shell, PDF engine and OCR data are cached, so you can keep working without a connection and even install it as an app.' },
  { q: 'Which file types can I open?', a: 'PDF, PNG, JPG, WEBP, TIFF (where your browser supports it), TXT, HTML, DOCX and XLSX. Non-PDF files are converted to PDF locally.' },
  { q: 'How does OCR work without a server?', a: 'The Tesseract OCR engine and its language data ship with the app and run in a Web Worker on your device. English, Spanish, French, German, Italian and Portuguese are included.' },
  { q: 'Can it handle very large PDFs?', a: 'Yes. Pages are streamed and rendered on demand (a 500-page file opens instantly). Exporting needs the whole file in memory, and the status bar warns you when memory gets risky.' },
  { q: 'What can OurPDF not do?', a: 'It cannot create certificate-based digital signatures or convert PDF to Word, Excel or PowerPoint reliably without a server, so those are intentionally not offered.' },
]

const STEPS = [
  { icon: Upload, title: 'Open a file', text: 'Drop a PDF, image, TXT, HTML, DOCX or spreadsheet. Nothing is uploaded – it is read locally.' },
  { icon: Wand2, title: 'Edit with real tools', text: 'Type, draw, highlight, sign, fill forms, reorder pages, OCR, redact, watermark and more.' },
  { icon: Download, title: 'Download instantly', text: 'Your edited PDF is built in a Web Worker and saved straight to your device. Work is autosaved locally.' },
]

const COMPARE: [string, string, string][] = [
  ['Your files are uploaded to a server', 'Never', 'Usually'],
  ['Account or sign-up required', 'No', 'Often'],
  ['Works offline', 'Yes (installable)', 'Rarely'],
  ['Watermark on output', 'No', 'On free plans'],
  ['File-size and page limits', 'Only your device’s memory', 'Common on free plans'],
  ['Permanent redaction', 'Yes – content removed', 'Varies'],
  ['OCR without sending scans away', 'Yes', 'Rarely'],
]

export default function Home() {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: SITE.name, url: SITE.url, description: SITE.description, inLanguage: 'en' },
      { '@type': 'Organization', name: SITE.name, url: SITE.url, logo: `${SITE.url}/logo.png` },
      { '@type': 'SoftwareApplication', name: SITE.name, url: SITE.url, applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', description: SITE.description, image: `${SITE.url}/logo.png`, isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, featureList: FEATURE_LIST },
      { '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      { '@type': 'ItemList', name: 'PDF tools', itemListElement: SEO_PAGES.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE.url}/${p.slug}`, name: p.h1 })) },
    ],
  }
  return (
    <>
      <SiteHeader />
      <main>
        <Hero features={TOTAL_FEATURES - (TOTAL_FEATURES % 10)} />

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-label="At a glance">
          <Stats items={[{ value: '0', label: 'bytes uploaded' }, { value: `${TOTAL_FEATURES - (TOTAL_FEATURES % 10)}+`, label: 'features' }, { value: `${SEO_PAGES.length}`, label: 'focused PDF tools' }, { value: '100%', label: 'works offline' }]} />
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6" aria-labelledby="how-h">
          <SectionHeading eyebrow="How it works" id="how-h" title="From file to finished PDF in three steps" />
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card-lift relative rounded-2xl border bg-card p-7">
                <span className="absolute right-5 top-4 text-5xl font-black text-muted/70" aria-hidden>{i + 1}</span>
                <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white"><s.icon className="size-6" aria-hidden /></span>
                <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="tools" className="border-y bg-muted/30" aria-labelledby="tools-h">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <SectionHeading eyebrow="PDF tools" id="tools-h" title="Every PDF job, one private workspace" text="Each tool opens the real editor feature – no fake demos, no upload step." />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SEO_PAGES.map((p) => (
                <li key={p.slug}>
                  <Link href={`/${p.slug}`} className="card-lift group flex h-full flex-col rounded-2xl border bg-card p-5">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name={SEO_EXTRA[p.slug]?.icon ?? 'Layers'} className="size-5" /></span>
                    <h3 className="mt-4 font-semibold leading-snug">{p.h1}</h3>
                    <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>
                    <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-primary">Open tool <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="features-h">
          <SectionHeading eyebrow={`${TOTAL_FEATURES - (TOTAL_FEATURES % 10)}+ features`} id="features-h" title="Everything you expect from a professional PDF editor" text="Viewing, editing, annotation, forms, signatures, OCR, security, conversion and optimization – all running locally." />
          <div className="mt-12"><FeatureCategories limit={6} /></div>
          <div className="mt-10 text-center"><Link href="/features" className="inline-flex h-12 items-center rounded-xl border bg-background px-7 font-medium shadow-sm transition hover:bg-accent">See the complete feature list <ArrowRight className="ml-2 size-4" aria-hidden /></Link></div>
        </section>

        <section id="privacy" className="border-y bg-muted/30" aria-labelledby="privacy-h">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary"><ShieldCheck className="size-4" aria-hidden /> Privacy by architecture</p>
              <h2 id="privacy-h" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Your documents are never our business</h2>
              <p className="mt-4 text-lg text-muted-foreground">There is no server to send files to. OurPDF is static code that runs on your device, and a strict security policy makes the browser itself refuse connections to other websites.</p>
              <ul className="mt-6 space-y-3">
                {[['No backend', 'Nothing to hack, log or leak.'], ['Enforced by the browser', 'Content-Security-Policy blocks foreign requests.'], ['Local storage only', 'Autosaved projects live in your browser’s IndexedDB.'], ['Real deletion & redaction', 'Deleted pages are purged; redaction removes the content.']].map(([t, d]) => (
                  <li key={t} className="flex gap-3"><Eye className="mt-1 size-5 shrink-0 text-primary" aria-hidden /><span><strong>{t}.</strong> <span className="text-muted-foreground">{d}</span></span></li>
                ))}
              </ul>
              <Link href="/privacy" className="mt-7 inline-flex items-center gap-1 font-medium text-primary hover:underline">How privacy works in detail <ArrowRight className="size-4" aria-hidden /></Link>
            </div>
            <div className="overflow-hidden rounded-2xl border bg-card">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">OurPDF compared with typical cloud PDF tools</caption>
                <thead><tr className="border-b bg-muted/50"><th scope="col" className="p-3 font-medium"> </th><th scope="col" className="p-3 font-semibold text-primary">OurPDF</th><th scope="col" className="p-3 font-medium text-muted-foreground">Typical cloud tools</th></tr></thead>
                <tbody>
                  {COMPARE.map(([a, b, c]) => (<tr key={a} className="border-b last:border-0"><th scope="row" className="p-3 font-normal">{a}</th><td className="p-3 font-medium text-green-700 dark:text-green-400">{b}</td><td className="p-3 text-muted-foreground">{c}</td></tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="formats-h">
          <SectionHeading eyebrow="Formats" id="formats-h" title="Supported formats" />
          <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6"><h3 className="font-semibold">Open &amp; import</h3><p className="mt-2 flex flex-wrap gap-2 text-sm">{['PDF', 'PNG', 'JPG / JPEG', 'WEBP', 'TIFF*', 'TXT', 'HTML', 'DOCX', 'XLSX'].map((f) => (<span key={f} className="rounded-full border bg-muted px-3 py-1">{f}</span>))}</p><p className="mt-3 text-xs text-muted-foreground">*TIFF where your browser supports it. DOCX/XLSX are converted best-effort.</p></div>
            <div className="rounded-2xl border bg-card p-6"><h3 className="font-semibold">Export</h3><p className="mt-2 flex flex-wrap gap-2 text-sm">{['PDF', 'PNG', 'JPG', 'TXT', 'HTML', 'JSON (annotations, form data)', 'CSV (form data)', 'ZIP'].map((f) => (<span key={f} className="rounded-full border bg-muted px-3 py-1">{f}</span>))}</p></div>
          </div>
        </section>

        <section id="shortcuts" className="border-y bg-muted/30" aria-labelledby="shortcuts-h">
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
            <SectionHeading eyebrow="Keyboard friendly" id="shortcuts-h" title="Fast for keyboards, friendly to screen readers" text="Every shortcut is customisable in the editor." />
            <dl className="mt-10 grid gap-x-10 gap-y-1 text-sm sm:grid-cols-2">
              {[['Open', 'Ctrl/⌘ + O'], ['Save', 'Ctrl/⌘ + S'], ['Undo', 'Ctrl/⌘ + Z'], ['Redo', 'Ctrl/⌘ + Shift + Z'], ['Search', 'Ctrl/⌘ + F'], ['Print', 'Ctrl/⌘ + P'], ['Copy / Cut / Paste', 'Ctrl/⌘ + C / X / V'], ['Command palette', 'Ctrl/⌘ + K'], ['Delete selection', 'Delete'], ['Cancel tool', 'Esc'], ['Pan', 'Hold Space'], ['Select all', 'Ctrl/⌘ + A'], ['Zoom in / out', 'Ctrl/⌘ + + / −']].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b py-2.5"><dt className="text-muted-foreground">{k}</dt><dd><kbd className="rounded-md border bg-background px-2 py-1 font-mono text-xs shadow-sm">{v}</kbd></dd></div>
              ))}
            </dl>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6" aria-labelledby="faq-h">
          <SectionHeading eyebrow="FAQ" id="faq-h" title="Frequently asked questions" />
          <div className="mt-10"><Faq items={FAQ} /></div>
        </section>

        <CtaBand />
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </>
  )
}
