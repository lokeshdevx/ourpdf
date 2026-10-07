import Link from 'next/link'
import type { ReactNode } from 'react'

/** Full-width hero band shared by the content pages (matches the home page). */
export function PageHero({ crumb, eyebrow, title, text, stats, children }: { crumb: string; eyebrow?: ReactNode; title: ReactNode; text: ReactNode; stats?: { value: string; label: string }[]; children?: ReactNode }) {
  return (
    <header className="relative isolate overflow-hidden border-b bg-gradient-to-br from-primary/[0.07] via-background to-violet-500/[0.07]">
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-60" aria-hidden />
      <div className="pointer-events-none absolute -right-32 -top-32 -z-10 size-[28rem] rounded-full bg-primary/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 left-1/4 -z-10 size-96 rounded-full bg-violet-500/10 blur-3xl" aria-hidden />
      <div className="px-4 pb-12 pt-8 sm:px-8 sm:pt-10 xl:px-12">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground"><ol className="flex flex-wrap items-center gap-1.5"><li><Link href="/" className="hover:text-foreground">All tools</Link></li><li aria-hidden>/</li><li aria-current="page" className="text-foreground">{crumb}</li></ol></nav>
        {eyebrow && <p className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-semibold text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-4 max-w-4xl text-balance text-4xl font-extrabold tracking-tight sm:text-5xl xl:text-6xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-pretty text-lg text-muted-foreground">{text}</p>
        {stats && (
          <dl className="mt-8 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border bg-background/70 px-4 py-3 backdrop-blur">
                <dd className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl">{s.value}</dd>
                <dt className="text-xs font-medium text-muted-foreground sm:text-sm">{s.label}</dt>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </header>
  )
}

/** Full-width call-to-action band. */
export function CtaBand({ title, text, cta, href }: { title: string; text: string; cta: string; href: string }) {
  return (
    <section className="px-4 pt-16 sm:px-8 xl:px-12" aria-label="Get started">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-violet-600 px-6 py-12 text-white sm:px-12">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-2 max-w-2xl text-white/85">{text}</p>
          </div>
          <Link href={href} className="inline-flex h-12 shrink-0 items-center rounded-xl bg-white px-7 font-semibold text-blue-700 shadow-lg transition hover:-translate-y-0.5">{cta}</Link>
        </div>
      </div>
    </section>
  )
}
