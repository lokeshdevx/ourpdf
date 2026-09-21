'use client'

import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getDb } from '@/services/storage/db'
import { listProjects } from '@/services/storage/projects'
import { confirmAction } from '@/stores/confirm-store'
import { useHistoryStore } from '@/stores/history-store'
import { useUiStore } from '@/stores/ui-store'
import type { RenderQuality } from '@/types'
import { DialogShell, Field } from './DialogShell'

export default function SettingsDialog() {
  const ui = useUiStore()
  const { theme, setTheme } = useTheme()
  const historyLimit = useHistoryStore((s) => s.limit)
  return (
    <DialogShell id="settings" title="Settings" size="md" footer={<Button onClick={ui.closeDialog}>Done</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Theme">
          <Select value={theme ?? 'system'} onValueChange={setTheme}><SelectTrigger aria-label="Theme"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent></Select>
        </Field>
        <Field label="Render quality" hint="Higher = sharper but uses more memory.">
          <Select value={ui.quality} onValueChange={(v) => ui.set({ quality: v as RenderQuality })}><SelectTrigger aria-label="Render quality" data-testid="quality-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low (0.75×)</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="high">High (1.5×)</SelectItem><SelectItem value="ultra">Ultra (2×)</SelectItem></SelectContent></Select>
        </Field>
        <Field label="Author name" hint="Used for notes and the “Insert name” action." htmlFor="set-author"><Input id="set-author" value={ui.author} onChange={(e) => ui.set({ author: e.target.value })} /></Field>
        <Field label="Undo history limit" hint="Older steps are dropped." htmlFor="set-hist"><Input id="set-hist" type="number" min={10} max={2000} value={historyLimit} onChange={(e) => { const n = parseInt(e.target.value) || 200; useHistoryStore.getState().setLimit(n); ui.set({ historyLimit: n }) }} /></Field>
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2 font-normal"><Checkbox checked={ui.lowMemory} onCheckedChange={(v) => ui.set({ lowMemory: v === true })} /> Low-memory mode (smaller caches, 1× rendering, fewer pre-rendered pages)</Label>
        <Label className="flex items-center gap-2 font-normal"><Checkbox checked={ui.highContrast} onCheckedChange={(v) => ui.set({ highContrast: v === true })} /> High-contrast interface</Label>
        <Label className="flex items-center gap-2 font-normal"><Checkbox checked={ui.reduceMotion} onCheckedChange={(v) => ui.set({ reduceMotion: v === true })} /> Reduce motion</Label>
      </div>
      <div className="rounded-md border p-3">
        <h3 className="text-sm font-medium">Local data</h3>
        <p className="mb-2 text-xs text-muted-foreground">Projects, versions and saved signatures live only in this browser.</p>
        <Button size="sm" variant="destructive" onClick={async () => {
          if (!(await confirmAction({ title: 'Erase all local data?', description: 'Deletes every saved project, version snapshot and saved signature from this browser. Open tabs stay open.', confirmLabel: 'Erase everything', destructive: true }))) return
          const db = await getDb()
          for (const s of ['projects', 'blobs', 'assets', 'fonts', 'snapshots', 'signatures'] as const) await db.clear(s)
          await listProjects()
          toast.success('Local data erased')
        }}>Erase local data…</Button>
      </div>
    </DialogShell>
  )
}
