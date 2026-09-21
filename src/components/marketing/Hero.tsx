import { CheckCircle2, Lock, ShieldCheck, WifiOff, Zap } from 'lucide-react'
import Link from 'next/link'

/** Decorative editor window (pure markup – no images, no client JS). */
export function EditorMock() {
  return (
    <div className="relative mx-auto w-full max-w-3xl" aria-hidden>
      <div className="blob absolute -left-10 top-10 size-56 rounded-full bg-primary/30" />
      <div className="blob absolute -right-8 bottom-4 size-56 rounded-full bg-violet-500/25 [animation-delay:-6s]" />
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10 ring-1 ring-black/5">
        <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2.5">
          <span className="size-3 rounded-full bg-red-400" /><span className="size-3 rounded-full bg-amber-400" /><span className="size-3 rounded-full bg-green-400" />
          <div className="mx-auto hidden h-5 w-56 rounded-md bg-background/80 text-center text-[10px] leading-5 text-muted-foreground sm:block">ourpdf.space/editor</div>
        </div>
        <div className="flex items-center gap-1.5 border-b px-3 py-2">
          {['bg-primary/15', 'bg-muted', 'bg-muted', 'bg-muted', 'bg-muted', 'bg-muted'].map((c, i) => (<span key={i} className={`h-6 w-6 rounded-md ${c}`} />))}
          <span className="mx-1 h-5 w-px bg-border" />
          <span className="h-6 w-16 rounded-md bg-muted" /><span className="ml-auto h-6 w-24 rounded-md bg-muted" />
        </div>
        <div className="grid grid-cols-[64px_1fr] sm:grid-cols-[84px_1fr_120px]">
          <div className="space-y-2 border-r bg-muted/30 p-2">
            {[0, 1, 2].map((i) => (<div key={i} className={`aspect-[3/4] rounded border bg-white p-1 dark:bg-zinc-200 ${i === 0 ? 'ring-2 ring-primary' : ''}`}><div className="h-1 w-3/4 rounded bg-zinc-300" /><div className="mt-1 h-1 w-full rounded bg-zinc-200" /><div className="mt-1 h-1 w-2/3 rounded bg-zinc-200" /></div>))}
          </div>
          <div className="relative bg-muted/40 p-4 sm:p-6">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-[300px] rounded-md bg-white p-5 text-zinc-800 shadow-lg">
              <div className="h-3 w-2/3 rounded bg-zinc-800" />
              <div className="mt-4 space-y-2">
                <div className="relative h-2 w-full rounded bg-zinc-300"><span className="absolute inset-y-[-3px] left-0 w-3/5 rounded-sm bg-yellow-300/70 mix-blend-multiply" /></div>
                <div className="h-2 w-11/12 rounded bg-zinc-300" /><div className="h-2 w-full rounded bg-zinc-300" /><div className="h-2 w-4/5 rounded bg-zinc-300" />
              </div>
              <div className="mt-5 flex h-14 items-center justify-center rounded border-2 border-dashed border-blue-700/50 bg-blue-50 text-[10px] font-medium text-blue-700">Insert text, images, shapes</div>
              <div className="mt-4 space-y-2"><div className="h-2 w-full rounded bg-zinc-300" /><div className="h-2 w-3/4 rounded bg-zinc-300" /></div>
              <svg className="absolute bottom-5 left-5 w-28 text-blue-700" viewBox="0 0 120 40" fill="none"><path d="M4 30c8-22 14-24 16-12s4 14 12-6c4-10 10-8 8 4s6 10 14-2 12 2 18 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              <span className="absolute right-4 top-4 rotate-12 rounded-md border-2 border-green-700 px-2 py-0.5 text-[10px] font-bold tracking-wider text-green-700">APPROVED</span>
              <span className="absolute -right-2 top-1/2 grid size-6 place-items-center rounded bg-yellow-300 text-[10px] shadow">✎</span>
            </div>
            <div className="float-slow absolute left-2 top-6 hidden items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-lg sm:flex"><ShieldCheck className="size-3.5 text-green-600" /> 100% local</div>
            <div className="float-slower absolute bottom-8 right-2 hidden items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-lg sm:flex"><Zap className="size-3.5 text-amber-500" /> OCR in a worker</div>
          </div>
          <div className="hidden space-y-3 border-l bg-muted/30 p-3 sm:block">
            <div className="h-2 w-12 rounded bg-muted-foreground/30" />
            {[0, 1, 2, 3].map((i) => (<div key={i} className="flex items-center justify-between"><span className="h-2 w-10 rounded bg-muted-foreground/20" /><span className={`h-5 w-9 rounded ${i === 1 ? 'bg-primary/30' : 'bg-muted'}`} /></div>))}
            <div className="mt-4 h-2 w-16 rounded bg-muted-foreground/30" />
            <div className="h-2 rounded-full bg-primary/60" /><div className="h-2 w-2/3 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function Hero({ features }: { features: number }) {
  return (
    <section className="relative overflow-hidden border-b">
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden />
      <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-primary/10 via-violet-500/5 to-transparent" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:pb-24">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Lock className="size-3.5 text-primary" /> No uploads · No accounts · Works offline
          </p>
          <h1 className="mt-6 text-balance text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">Powerful PDF editing. <span className="bg-gradient-to-r from-primary via-violet-500 to-cyan-500 bg-clip-text text-transparent box-decoration-clone">Completely private.</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">Edit, organize, annotate, sign and transform PDFs directly in your browser.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/editor" className="inline-flex h-13 items-center rounded-xl bg-primary px-9 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:-translate-y-0.5 hover:bg-primary/90" data-testid="hero-cta">Open PDF</Link>
            <Link href="/features" className="inline-flex items-center rounded-xl border bg-background px-7 py-3.5 text-base font-medium transition hover:bg-accent">Explore {features}+ features</Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">All processing happens locally in your browser.</p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {['Free to use', 'No watermark', 'Any file size your device can handle'].map((t) => (<li key={t} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-green-600" /> {t}</li>))}
            <li className="flex items-center gap-1.5"><WifiOff className="size-4 text-primary" /> Installable &amp; offline</li>
          </ul>
        </div>
        <div className="mt-14 lg:mt-20"><EditorMock /></div>
      </div>
    </section>
  )
}
