'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Menu, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { getCommand, helpOf, isEnabled, runCommand, shortcutOf, type Command } from '@/features/commands'
import { formatCombo } from '@/features/shortcuts'
import { cn } from '@/lib/utils'
import type { MenuEntry } from './CommandItems'
import { MENUS } from './menus'

interface Group {
  title?: string
  cmds: Command[]
}

/** Flattens a menu definition into titled groups (sub-menus become headings) – no fly-outs, so nothing runs off-screen. */
function groupsOf(items: MenuEntry[]): Group[] {
  const out: Group[] = [{ cmds: [] }]
  for (const e of items) {
    if (e === '-') continue
    if (typeof e === 'object') {
      out.push({ title: e.sub, cmds: groupsOf(e.items).flatMap((g) => g.cmds) })
      out.push({ cmds: [] })
      continue
    }
    const c = getCommand(e)
    if (c) out[out.length - 1].cmds.push(c)
  }
  return out.filter((g) => g.cmds.length)
}

function Item({ c, onRun }: { c: Command; onRun: () => void }) {
  const Icon = c.icon
  const sc = formatCombo(shortcutOf(c))
  const disabled = !isEnabled(c)
  const help = helpOf(c)
  return (
    <button
      type="button"
      disabled={disabled}
      data-command={c.id}
      onClick={() => { onRun(); void runCommand(c.id) }}
      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
    >
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <span className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2 text-sm font-medium">
          <span className="truncate">{c.title}</span>
          {c.checked?.() && <Check className="size-3.5 shrink-0 text-primary" aria-label="on" />}
          {sc && <span className="ml-auto hidden shrink-0 text-[10px] font-normal text-muted-foreground sm:inline">{sc}</span>}
        </span>
        {help && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{help}</span>}
      </span>
    </button>
  )
}

/**
 * Menu for phones and tablets: a full-height sheet with search and collapsible sections. Every entry shows its
 * summary (there is no hover on touch screens). Replaces nested fly-out menus that overflowed narrow screens.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<string | null>('File')
  const needle = q.trim().toLowerCase()
  const searchHits = useMemo(() => {
    if (!needle) return null
    const seen = new Set<string>()
    const hits: Command[] = []
    for (const m of MENUS) for (const g of groupsOf(m.items)) for (const c of g.cmds) {
      if (seen.has(c.id)) continue
      if (`${c.title} ${helpOf(c)} ${(c.keywords ?? []).join(' ')}`.toLowerCase().includes(needle)) { seen.add(c.id); hits.push(c) }
    }
    return hits
  }, [needle])
  const close = () => { setOpen(false); setQ('') }
  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ('') }}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Menu" data-testid="mobile-menu-trigger">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[90vw] max-w-md gap-0 p-0" data-testid="mobile-menu">
        <SheetHeader className="border-b p-3 pr-12">
          <SheetTitle className="text-sm">Menu</SheetTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools…" aria-label="Search tools" className="h-9 pl-8" />
          </div>
        </SheetHeader>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {searchHits ? (
            searchHits.length ? searchHits.map((c) => <Item key={c.id} c={c} onRun={close} />) : <p className="p-4 text-sm text-muted-foreground">No tool matches “{q}”.</p>
          ) : (
            MENUS.map((m) => {
              const isOpen = expanded === m.label
              return (
                <section key={m.label} className="border-b last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : m.label)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {m.label}
                    <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden />
                  </button>
                  {isOpen && (
                    <div className="pb-2">
                      {groupsOf(m.items).map((g, i) => (
                        <div key={g.title ?? i}>
                          {g.title && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.title}</div>}
                          {g.cmds.map((c) => <Item key={c.id} c={c} onRun={close} />)}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
