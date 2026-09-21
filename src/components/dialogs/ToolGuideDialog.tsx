'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { COMMANDS, helpOf, isEnabled, runCommand, shortcutOf, type Category } from '@/features/commands'
import { formatCombo } from '@/features/shortcuts'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell } from './DialogShell'

const ORDER: Category[] = ['PDF', 'Edit', 'Text', 'Annotate', 'Images', 'Pages', 'Forms', 'Sign', 'Security', 'OCR', 'Convert', 'Optimize', 'Watermark', 'Headers', 'Footers', 'View', 'Help']
const TITLES: Partial<Record<Category, string>> = { PDF: 'File', Pages: 'Pages & organising', Security: 'Security & redaction', OCR: 'OCR', Optimize: 'Optimise', Watermark: 'Watermark', Headers: 'Headers & footers', Footers: 'Headers & footers' }

/** Searchable guide to every command with its summary – the touch-friendly counterpart of the hover tooltips. */
export default function ToolGuideDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const map = new Map<string, typeof COMMANDS>()
    for (const cat of ORDER) {
      for (const c of COMMANDS.filter((x) => x.category === cat && x.id !== 'edit.redo2')) {
        if (needle && !`${c.title} ${helpOf(c)} ${(c.keywords ?? []).join(' ')}`.toLowerCase().includes(needle)) continue
        const key = TITLES[cat] ?? cat
        map.set(key, [...(map.get(key) ?? []), c])
      }
    }
    return [...map.entries()]
  }, [q])
  return (
    <DialogShell id="toolGuide" title="Tool guide" description="What every tool does. Tap Use to start one – tools that need a document are greyed out until you open one." size="xl" footer={<Button onClick={close}>Close</Button>}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools, e.g. “blur”, “merge”, “sign”…" className="pl-8" aria-label="Search tools" data-testid="guide-search" />
      </div>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No tool matches “{q}”.</p>}
      {groups.map(([title, cmds]) => (
        <section key={title} aria-label={title} data-testid="guide-section">
          <h3 className="sticky top-0 z-10 bg-popover py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
          <ul className="divide-y">
            {cmds.map((c) => {
              const Icon = c.icon
              const sc = formatCombo(shortcutOf(c))
              return (
                <li key={c.id} className="flex items-start gap-3 py-2.5" data-guide-item={c.id}>
                  {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                      {c.title}
                      {sc && <kbd className="rounded border bg-muted px-1 font-mono text-[10px] font-normal text-muted-foreground">{sc}</kbd>}
                    </div>
                    <p className="text-xs leading-snug text-muted-foreground">{helpOf(c)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" disabled={!isEnabled(c)} onClick={() => { close(); void runCommand(c.id) }}>Use</Button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </DialogShell>
  )
}
