import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, EyeOff, FileKey, Info, Lock, ServerOff, ShieldCheck, Tags, WifiOff, Code2 } from 'lucide-react'
import { CtaBand, PageHero } from '@/components/site/PageHero'
import { Faq } from '@/components/marketing/SiteChrome'
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
  { q: 'What data does OurPDF collect?', a: 'Never your documents. On the public website pages we use Microsoft Clarity for anonymous usage analytics (pages visited, clicks, scrolling) to improve the site; the area where you work with files is masked and Clarity is never loaded in the editor. There are no accounts. Preferences (theme, layout) and autosaved projects are stored only in your browser.' },
  { q: 'Where are my autosaved projects stored?', a: 'In your browser’s IndexedDB on your device. You can rename, duplicate, export or delete them from the Projects dialog, or erase everything in Settings.' },
  { q: 'How do I know nothing is uploaded?', a: 'The editor sends a Content-Security-Policy that only allows connections to its own origin, so the browser blocks requests elsewhere (website pages additionally allow Microsoft Clarity analytics, which never sees your files). You can also open your browser’s network panel or work with the network switched off.' },
  { q: 'Are passwords stored?', a: 'No. Passwords used to open or encrypt a PDF exist only in memory for the operation and are never saved or transmitted.' },
  { q: 'Is the redaction safe?', a: 'Yes. Redacted pages are re-rendered with the marked areas burned in and the original content is dropped from the file. Deleted pages are also purged from saved output.' },
]

const PILLARS = [
  { icon: ServerOff, title: 'No backend', text: 'The app is static files. Rendering, editing, OCR, compression, encryption and export all run in your browser.' },
  { icon: ShieldCheck, title: 'Enforced by the browser', text: 'In the editor a strict Content-Security-Policy allows network connections only to this site, blocks eval and object embeds.' },
  { icon: WifiOff, title: 'Self-hosted engines', text: 'The PDF engine, OCR and AI models are served with the app – no third-party CDN ever sees you or your files.' },
  { icon: Code2, title: 'Safe imports', text: 'File types are detected from content, HTML is sanitised and PDF JavaScript is never executed.' },
]

const STORED = [
  ['Your PDFs and edits (autosaved projects)', 'Browser IndexedDB', 'No'],
  ['Saved signatures and custom fonts', 'Browser IndexedDB', 'No'],
  ['Theme, layout, shortcuts, settings', 'Browser localStorage', 'No'],
  ['App files for offline use', 'Browser cache (service worker)', 'No – only the app’s own code'],
  ['Passwords you type', 'Memory only, for one operation', 'No'],
]

const SECURITY = [
  { icon: Lock, title: 'AES-256 encryption', text: 'Password-protect PDFs with owner and user passwords.', href: '/encrypt-pdf' },
  { icon: EyeOff, title: 'Permanent redaction', text: 'Remove content by area, search or patterns like Aadhaar and PAN.', href: '/auto-redact-pii' },
  { icon: Tags, title: 'Metadata control', text: 'View, edit or strip author, title and hidden XMP data.', href: '/edit-pdf-metadata' },
  { icon: FileKey, title: 'Privacy risk scan', text: 'Find personal data and hidden information before you share.', href: '/privacy-risk-scanner' },
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
      <main className="overflow-x-clip pb-8">
        <PageHero
          crumb="Privacy"
          eyebrow={<><ShieldCheck className="size-3.5 text-primary" aria-hidden /> Privacy by architecture</>}
          title={<>Your PDFs <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">never leave your device</span></>}
          text="Privacy is not a policy here – it is how the software is built. There is no server to upload to, no account to create, and your documents are never recorded."
          stats={[{ value: '0', label: 'bytes uploaded' }, { value: '0', label: 'accounts or cookies' }, { value: '0', label: 'documents recorded' }, { value: '100%', label: 'runs in your browser' }]}
        />

        <section aria-labelledby="how" className="px-4 pt-14 sm:px-8 xl:px-12">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">How it works</p>
          <h2 id="how" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Four layers that keep your files private</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {PILLARS.map((p) => (
              <li key={p.title} className="tool-card rounded-2xl border bg-card p-6">
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/20"><p.icon className="size-6" aria-hidden /></span>
                <h3 className="mt-4 font-bold">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="stored" className="px-4 pt-14 sm:px-8 xl:px-12">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Transparency</p>
          <h2 id="stored" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">What is stored, and where</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">Data stored by OurPDF</caption>
              <thead className="bg-muted/50"><tr><th scope="col" className="p-4 font-semibold">Data</th><th scope="col" className="p-4 font-semibold">Where it lives</th><th scope="col" className="p-4 font-semibold">Leaves your device?</th></tr></thead>
              <tbody>
                {STORED.map((r) => (<tr key={r[0]} className="border-t"><td className="p-4 font-medium">{r[0]}</td><td className="p-4 text-muted-foreground">{r[1]}</td><td className="p-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-green-600/10 px-2.5 py-1 text-xs font-semibold text-green-800 dark:text-green-300"><Check className="size-3.5" aria-hidden />{r[2]}</span></td></tr>))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="security" className="px-4 pt-14 sm:px-8 xl:px-12">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">You are in control</p>
          <h2 id="security" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Security features you control</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {SECURITY.map((x) => (
              <li key={x.title}>
                <Link href={x.href} className="tool-card group flex h-full flex-col rounded-2xl border bg-card p-5">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><x.icon className="size-5" aria-hidden /></span>
                  <h3 className="mt-3 font-semibold">{x.title}</h3>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">{x.text}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open tool <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden /><span><strong>Honest limits:</strong> permission flags (print/copy/edit) are honoured only by compliant viewers, and signatures are visual images rather than certificate-based digital signatures.</span></p>
        </section>

        <section id="faq" aria-labelledby="pfaq" className="scroll-mt-24 px-4 pt-14 sm:px-8 xl:px-12">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">FAQ</p>
          <h2 id="pfaq" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Privacy questions, answered</h2>
          <div className="mt-6"><Faq items={PRIVACY_FAQ} /></div>
        </section>
        <CtaBand title="Ready to work privately?" text="Pick any tool – your files are processed right here in your browser." cta="Browse all tools" href="/" />
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </>
  )
}
