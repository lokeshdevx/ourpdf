'use client'

import { useEffect, useMemo, useState } from 'react'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { COMMANDS, isEnabled, runCommand, shortcutOf, type Category } from '@/features/commands'
import { formatCombo } from '@/features/shortcuts'
import { usePdfStore } from '@/stores/pdf-store'

const ORDER: Category[] = ['PDF', 'Pages', 'Edit', 'Annotate', 'Images', 'Text', 'Forms', 'Sign', 'Security', 'OCR', 'Convert', 'Optimize', 'Watermark', 'Headers', 'Footers', 'View', 'Help']

/** Searchable launcher for every tool (Ctrl/Cmd+K). Try "crop", "merge", "ocr", "signature", "watermark", "compress". */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  usePdfStore((s) => s.activeId)
  useEffect(() => {
    const h = () => setOpen(true)
    document.addEventListener('pdfstudio:palette', h)
    return () => document.removeEventListener('pdfstudio:palette', h)
  }, [])
  const groups = useMemo(() => ORDER.map((cat) => ({ cat, items: COMMANDS.filter((c) => c.category === cat) })).filter((g) => g.items.length), [])
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Search for a tool or action and press Enter">
      <Command>
      <CommandInput placeholder="Search tools: crop, merge, ocr, signature, watermark, compress…" aria-label="Search tools" data-testid="palette-input" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No matching tools.</CommandEmpty>
        {groups.map(({ cat, items }) => (
          <CommandGroup key={cat} heading={cat}>
            {items.map((c) => {
              const Icon = c.icon
              const sc = formatCombo(shortcutOf(c))
              const enabled = isEnabled(c)
              return (
                <CommandItem
                  key={c.id}
                  value={`${c.title} ${cat} ${(c.keywords ?? []).join(' ')} ${c.id}`}
                  disabled={!enabled}
                  data-command={c.id}
                  onSelect={() => {
                    setOpen(false)
                    setTimeout(() => void runCommand(c.id), 60)
                  }}
                >
                  {Icon && <Icon className="size-4" aria-hidden />}
                  <div className="min-w-0">
                    <div className="truncate">{c.title}</div>
                    {c.note && <div className="truncate text-[11px] text-muted-foreground">{c.note}</div>}
                  </div>
                  {sc && <CommandShortcut>{sc}</CommandShortcut>}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
