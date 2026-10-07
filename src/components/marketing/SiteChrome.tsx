import { BrandMark, Wordmark } from '@/components/brand'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <BrandMark size={34} priority />
      <Wordmark className="text-xl" />
    </span>
  )
}

/** Accessible FAQ list (native <details>, no JavaScript needed – fully crawlable). */
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
