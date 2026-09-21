'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { formatRanges, parseRangeGroups } from '@/utils/pages'
import { planSplit, splitDocument, type SplitMode } from '@/services/pdf/split-service'
import { selectedPageIndices } from '@/services/actions'
import { runTask } from '@/services/tasks'
import { useActivePages } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell, Field } from './DialogShell'

type Kind = 'ranges' | 'every' | 'single' | 'odd' | 'even' | 'selection'

export default function SplitDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const pages = useActivePages()
  const close = useUiStore((s) => s.closeDialog)
  const [kind, setKind] = useState<Kind>('every')
  const [ranges, setRanges] = useState('1-3; 4-')
  const [every, setEvery] = useState(1)
  const [zip, setZip] = useState(true)

  const { groups, error } = useMemo(() => {
    try {
      if (kind === 'selection') {
        const idx = selectedPageIndices(docId)
        if (!idx.length) return { groups: [] as number[][], error: 'Select pages in the thumbnails or organizer first.' }
        return { groups: [idx], error: null }
      }
      const mode: SplitMode = kind === 'ranges' ? { kind: 'ranges', groups: parseRangeGroups(ranges, pages.length) } : kind === 'every' ? { kind: 'every', n: Math.max(1, every) } : { kind }
      return { groups: planSplit(pages.length, mode), error: null }
    } catch (e) {
      return { groups: [] as number[][], error: (e as Error).message }
    }
  }, [kind, ranges, every, pages.length, docId])

  const run = () => {
    close()
    void runTask('Splitting PDF', (ctx) => splitDocument(docId, groups, ctx, { asZip: zip }), { successMessage: 'Split complete' })
  }

  return (
    <DialogShell
      id="split"
      title="Split PDF"
      description={`“${pages.length} pages”. Each part is built locally and includes all your edits.`}
      footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={!groups.length || !!error} onClick={run} data-testid="split-run">Split into {groups.length} file{groups.length === 1 ? '' : 's'}</Button></>}
    >
      <RadioGroup value={kind} onValueChange={(v) => setKind(v as Kind)} className="space-y-2">
        {([['every', 'Every N pages'], ['single', 'Every page as its own file'], ['ranges', 'By page ranges'], ['odd', 'Odd pages only'], ['even', 'Even pages only'], ['selection', 'Selected pages']] as [Kind, string][]).map(([k, label]) => (
          <Label key={k} className="flex items-center gap-2 font-normal"><RadioGroupItem value={k} /> {label}</Label>
        ))}
      </RadioGroup>
      {kind === 'every' && <Field label="Pages per file" htmlFor="split-n"><Input id="split-n" type="number" min={1} max={pages.length} value={every} onChange={(e) => setEvery(parseInt(e.target.value) || 1)} className="w-28" /></Field>}
      {kind === 'ranges' && <Field label="Ranges (separate files with “;”)" hint="Example: 1-3; 4-6; 7-  →  three files. Within a file use commas: 1-2, 5." htmlFor="split-ranges"><Input id="split-ranges" value={ranges} onChange={(e) => setRanges(e.target.value)} aria-invalid={!!error} /></Field>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {!error && groups.length > 0 && <p className="text-xs text-muted-foreground" data-testid="split-preview">Result: {groups.length} file{groups.length === 1 ? '' : 's'} – {groups.slice(0, 6).map((g) => formatRanges(g)).join(' | ')}{groups.length > 6 ? ' | …' : ''}</p>}
      <Label className="flex items-center gap-2 font-normal"><Checkbox checked={zip} onCheckedChange={(v) => setZip(v === true)} /> Bundle into a ZIP file</Label>
    </DialogShell>
  )
}
