import type { Metadata } from 'next'
import Link from 'next/link'
import { CtaBand, SectionHeading } from '@/components/marketing/Sections'
import { Faq, SiteFooter, SiteHeader } from '@/components/marketing/SiteChrome'
import { SITE, SOCIAL_IMAGE } from '@/lib/site'

const TITLE = 'Privacy & Security – Your PDFs Never Leave Your Device'
const DESC = 'How OurPDF keeps your documents private: no backend, no uploads, no accounts, a strict Content-Security-Policy, local-only storage, real redaction and AES-256 encryption.'

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ${SITE.name}` },
  description: DESC,
  alternates: { canonical: '/privacy' },
  openGraph: { title: TITLE, description: DESC, url: '/privacy', type: 'website', siteName: SITE.name, images: [SOCIAL_IMAGE] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: [SOCIAL_IMAGE.url] },
}

const PRIVACY_FAQ = [
  { q: 'What data does OurPDF collect?', a: 'None. There are no accounts, cookies for tracking, analytics or telemetry. Preferences (theme, layout) and autosaved projects are stored only in your browser.' },
  { q: 'Where are my autosaved projects stored?', a: 'In your browser’s IndexedDB on your device. You can rename, duplicate, export or delete them from the Projects dialog, or erase everything in Settings.' },
  { q: 'How do I know nothing is uploaded?', a: 'The site sends a Content-Security-Policy that only allows connections to its own origin, so the browser blocks requests elsewhere. You can also open your browser’s network panel or work with the network switched off.' },
  { q: 'Are passwords stored?', a: 'No. Passwords used to open or encrypt a PDF exist only in memory for the operation and are never saved or transmitted.' },
  { q: 'Is the redaction safe?', a: 'Yes. Redacted pages are re-rendered with the marked areas burned in and the original content is dropped from the file. Deleted pages are also purged from saved output.' },
]

export default function PrivacyPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: TITLE, url: `${SITE.url}/privacy`, description: DESC },
      { '@type': 'FAQPage', mainEntity: PRIVACY_FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE.name, item: SITE.url }, { '@type': 'ListItem', position: 2, name: 'Privacy', item: `${SITE.url}/privacy` }] },
    ],
  }
  return (
    <>
      <SiteHeader />
      <main>
        <header className="border-b bg-gradient-to-b from-primary/10 to-transparent">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
            <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground"><ol className="flex justify-center gap-2"><li><Link href="/" className="hover:underline">Home</Link></li><li aria-hidden>/</li><li aria-current="page">Privacy</li></ol></nav>
            <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">Your PDFs <span className="bg-gradient-to-r from-primary via-violet-500 to-cyan-500 bg-clip-text text-transparent box-decoration-clone">never leave your device</span></h1>
            <p className="mt-5 text-lg text-muted-foreground">Privacy is not a policy here – it is how the software is built.</p>
          </div>
        </header>
        <div className="mx-auto max-w-3xl space-y-14 px-4 py-16">
          <section aria-labelledby="how"><h2 id="how" className="text-2xl font-bold">How it works</h2>
            <ul className="mt-4 space-y-3 text-muted-foreground">
              <li><strong className="text-foreground">No backend.</strong> The app is static files. Rendering, editing, OCR, compression, encryption and export all run in your browser (PDF.js, pdf-lib, Tesseract.js, Web Workers).</li>
              <li><strong className="text-foreground">Enforced by the browser.</strong> A strict Content-Security-Policy allows network connections only to the site’s own origin, blocks <code>eval</code> and object embeds, and restricts workers to the same origin.</li>
              <li><strong className="text-foreground">Self-hosted engines.</strong> The PDF engine, OCR engine and language data are served with the app – no third-party CDN sees you or your files.</li>
              <li><strong className="text-foreground">Safe imports.</strong> File types are detected from content, HTML is sanitised, link targets are restricted to http(s), mailto and tel, and PDF JavaScript is never executed.</li>
            </ul></section>
          <section aria-labelledby="stored"><h2 id="stored" className="text-2xl font-bold">What is stored, and where</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Data stored by OurPDF</caption>
                <thead className="bg-muted/50"><tr><th scope="col" className="p-3">Data</th><th scope="col" className="p-3">Where</th><th scope="col" className="p-3">Leaves your device?</th></tr></thead>
                <tbody>
                  {[['Your PDFs and edits (autosaved projects)', 'Browser IndexedDB', 'No'], ['Saved signatures and custom fonts', 'Browser IndexedDB', 'No'], ['Theme, layout, shortcuts, settings', 'Browser localStorage', 'No'], ['App files for offline use', 'Browser cache (service worker)', 'No – only the app’s own code'], ['Passwords you type', 'Memory only, for one operation', 'No']].map((r) => (<tr key={r[0]} className="border-t"><td className="p-3">{r[0]}</td><td className="p-3 text-muted-foreground">{r[1]}</td><td className="p-3 font-medium text-green-700 dark:text-green-400">{r[2]}</td></tr>))}
                </tbody>
              </table>
            </div></section>
          <section aria-labelledby="security"><h2 id="security" className="text-2xl font-bold">Security features you control</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>AES-256 password protection with owner and user passwords.</li>
              <li>Permanent redaction by rectangle, text search or patterns such as emails and phone numbers.</li>
              <li>Metadata viewer, editor and one-click removal.</li>
              <li>Deleted pages are purged from saved files instead of merely hidden.</li>
            </ul>
            <p className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground"><strong className="text-foreground">Honest limits:</strong> permission flags (print/copy/edit) are honoured only by compliant viewers, and signatures are visual images rather than certificate-based digital signatures.</p></section>
          <section aria-labelledby="pfaq"><SectionHeading id="pfaq" title="Privacy FAQ" /><div className="mt-8"><Faq items={PRIVACY_FAQ} /></div></section>
        </div>
        <CtaBand />
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </>
  )
}
