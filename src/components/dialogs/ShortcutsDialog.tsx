'use client'

import { useEffect, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { COMMANDS, findConflict, shortcutOf, type Category } from '@/features/commands'
import { comboFromEvent, formatCombo, normalizeCombo } from '@/features/shortcuts'
import { useShortcutStore } from '@/stores/shortcut-store'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell } from './DialogShell'

const DOCUMENTED: [string, string][] = [
  ['mod+o', 'Open'], ['mod+s', 'Save'], ['mod+z', 'Undo'], ['mod+shift+z', 'Redo'], ['mod+f', 'Search'], ['mod+p', 'Print'], ['mod+c', 'Copy'], ['mod+v', 'Paste'], ['mod+x', 'Cut'],
  ['delete', 'Delete selected object'], ['escape', 'Cancel tool'], ['space', 'Pan (hold)'], ['mod+a', 'Select all'], ['mod+plus', 'Zoom in'], ['mod+minus', 'Zoom out'], ['mod+k', 'Command palette'],
]

export default function ShortcutsDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const overrides = useShortcutStore((s) => s.overrides)
  const [capturing, setCapturing] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const rows = useMemo(() => COMMANDS.filter((c) => (c.shortcut || c.id in overrides || c.title.toLowerCase().includes(filter.toLowerCase())) && c.title.toLowerCase().includes(filter.toLowerCase())), [filter, overrides])
  const groups = useMemo(() => {
    const m = new Map<Category, typeof COMMANDS>()
    for (const c of rows) m.set(c.category, [...(m.get(c.category) ?? []), c])
    return [...m.entries()]
  }, [rows])

  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setCapturing(null); setMsg(null); return }
      const combo = normalizeCombo(comboFromEvent(e))
      if (!combo) return
      if (e.key === 'Backspace' || e.key === 'Delete') { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && capturing) { useShortcutStore.getState().setShortcut(capturing, ''); setCapturing(null); return } }
      const conflict = findConflict(combo, capturing)
      if (conflict) return setMsg(`${formatCombo(combo)} is already used by “${conflict.title}”. Press another combination or Esc.`)
      useShortcutStore.getState().setShortcut(capturing, combo)
      setCapturing(null)
      setMsg(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing])

  return (
    <DialogShell id="shortcuts" title="Keyboard shortcuts" description="Click a shortcut to change it. Press Backspace while capturing to unbind. “Mod” is Ctrl on Windows/Linux and ⌘ on macOS." size="lg" footer={<><Button variant="outline" onClick={() => useShortcutStore.getState().reset()}><RotateCcw className="size-4" /> Reset all</Button><Button onClick={close}>Done</Button></>}>
      <div className="grid gap-x-6 gap-y-1 rounded-md border bg-muted/40 p-3 text-xs sm:grid-cols-2" aria-label="Essential shortcuts">
        {DOCUMENTED.map(([k, l]) => <div key={k} className="flex justify-between"><span>{l}</span><kbd className="rounded border bg-background px-1.5">{formatCombo(k)}</kbd></div>)}
      </div>
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter commands…" aria-label="Filter commands" />
      {msg && <p className="text-sm text-destructive" role="alert">{msg}</p>}
      <div className="space-y-3">
        {groups.map(([cat, cmds]) => (
          <section key={cat} aria-label={cat}>
            <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{cat}</h3>
            <ul className="divide-y rounded-md border">
              {cmds.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <Button size="sm" variant={capturing === c.id ? 'default' : 'outline'} className="h-7 min-w-24 font-mono text-xs" onClick={() => { setCapturing(c.id); setMsg(null) }} aria-label={`Change shortcut for ${c.title}`}>
                    {capturing === c.id ? 'Press keys…' : formatCombo(shortcutOf(c)) || '—'}
                  </Button>
                  {c.id in overrides && <Button size="icon-sm" variant="ghost" aria-label="Reset shortcut" onClick={() => useShortcutStore.getState().reset(c.id)}><RotateCcw className="size-3.5" /></Button>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DialogShell>
  )
}
