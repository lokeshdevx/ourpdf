import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { FEATURE_CATEGORIES } from '@/lib/features'
import { Icon } from './icons'

export function SectionHeading({ eyebrow, title, text, id }: { eyebrow?: string; title: string; text?: string; id?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>}
      <h2 id={id} className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-pretty text-lg text-muted-foreground">{text}</p>}
    </div>
  )
}

export function Stats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="bg-card px-4 py-6 text-center">
          <dd className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-violet-500 to-cyan-500 bg-clip-text text-transparent box-decoration-clone sm:text-4xl">{s.value}</dd>
          <dt className="mt-1 text-sm text-muted-foreground">{s.label}</dt>
        </div>
      ))}
    </dl>
  )
}

/** Feature categories. `limit` shows a preview list per category; omit for the complete list. */
export function FeatureCategories({ limit, headingLevel = 3 }: { limit?: number; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as 'h2' | 'h3'
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {FEATURE_CATEGORIES.map((c) => {
        const shown = limit ? c.items.slice(0, limit) : c.items
        return (
          <section key={c.id} id={limit ? undefined : c.id} aria-labelledby={`cat-${c.id}`} className="card-lift flex flex-col rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name={c.icon} className="size-5" /></span>
              <H id={`cat-${c.id}${limit ? '-p' : ''}`} className="text-lg font-semibold">{c.title}</H>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{c.blurb}</p>
            <ul className="mt-4 grid gap-x-4 gap-y-1.5 text-sm">
              {shown.map((i) => (<li key={i} className="flex items-start gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-green-600" aria-hidden /> <span>{i}</span></li>))}
            </ul>
            {limit && c.items.length > limit && (
              <Link href={`/features#${c.id}`} className="mt-auto pt-4 text-sm font-medium text-primary hover:underline">+ {c.items.length - limit} more in {c.title.toLowerCase()} <ArrowRight className="inline size-3.5" aria-hidden /></Link>
            )}
          </section>
        )
      })}
    </div>
  )
}

export function CtaBand({ title = 'Ready to edit your PDF – privately?', text = 'Open the editor and drop a file. It never leaves your device.', cta = 'Open OurPDF', href = '/editor' }: { title?: string; text?: string; cta?: string; href?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-label="Get started">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-violet-600 px-6 py-14 text-center text-white sm:px-12">
        <div className="absolute -right-10 -top-10 size-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="absolute -bottom-16 -left-10 size-64 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <h2 className="relative text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        <p className="relative mx-auto mt-3 max-w-xl text-white/85">{text}</p>
        <Link href={href} className="relative mt-8 inline-flex h-12 items-center rounded-xl bg-white px-8 font-semibold text-blue-700 shadow-lg transition hover:-translate-y-0.5">{cta}</Link>
      </div>
    </section>
  )
}

/** Every feature as compact chips – used on tool pages so the full capability list is in the HTML for search engines. */
export function FeatureChips() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {FEATURE_CATEGORIES.map((c) => (
        <section key={c.id} aria-labelledby={`chips-${c.id}`}>
          <h3 id={`chips-${c.id}`} className="flex items-center gap-2 text-sm font-semibold"><Icon name={c.icon} className="size-4 text-primary" /> <Link href={`/features#${c.id}`} className="hover:underline">{c.title}</Link></h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {c.items.map((i) => (<li key={i} className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">{i}</li>))}
          </ul>
        </section>
      ))}
    </div>
  )
}
