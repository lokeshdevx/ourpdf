'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { evenIndices, formatRanges, oddIndices, parsePageRanges } from '@/utils/pages'
import { extractPages } from '@/services/pdf/split-service'
import { selectedPageIndices } from '@/services/actions'
import { runTask } from '@/services/tasks'
import { useActivePages, useCurrentPageIndex } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell, Field } from './DialogShell'

type Kind = 'selection' | 'range' | 'odd' | 'even' | 'current'

export default function ExtractDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const pages = useActivePages()
  const current = useCurrentPageIndex()
  const close = useUiStore((s) => s.closeDialog)
  const hasSel = selectedPageIndices(docId).length > 0
  const [kind, setKind] = useState<Kind>(hasSel ? 'selection' : 'range')
  const [range, setRange] = useState('1')

  const { indices, error } = useMemo(() => {
    try {
      if (kind === 'selection') return { indices: selectedPageIndices(docId), error: null }
      if (kind === 'odd') return { indices: oddIndices(pages.length), error: null }
      if (kind === 'even') return { indices: evenIndices(pages.length), error: null }
      if (kind === 'current') return { indices: [current], error: null }
      return { indices: parsePageRanges(range, pages.length), error: null }
    } catch (e) {
      return { indices: [] as number[], error: (e as Error).message }
    }
  }, [kind, range, pages.length, docId, current])

  return (
    <DialogShell
      id="extract"
      title="Extract pages"
      description="Save the chosen pages as a new PDF (your original stays open and unchanged)."
      footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={!indices.length || !!error} data-testid="extract-run" onClick={() => { close(); void runTask('Extracting pages', (ctx) => extractPages(docId, indices, ctx)) }}>Extract {indices.length} page{indices.length === 1 ? '' : 's'}</Button></>}
    >
      <RadioGroup value={kind} onValueChange={(v) => setKind(v as Kind)} className="space-y-2">
        <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="selection" disabled={!hasSel} /> Selected pages {hasSel ? `(${selectedPageIndices(docId).length})` : '(none selected)'}</Label>
        <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="current" /> Current page ({current + 1})</Label>
        <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="range" /> Page range</Label>
        <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="odd" /> Odd pages</Label>
        <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="even" /> Even pages</Label>
      </RadioGroup>
      {kind === 'range' && <Field label="Pages" hint={`1–${pages.length}. Example: 1-3, 7, 10-` } htmlFor="extract-range"><Input id="extract-range" value={range} onChange={(e) => setRange(e.target.value)} aria-invalid={!!error} data-testid="extract-range" /></Field>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {!error && indices.length > 0 && <p className="text-xs text-muted-foreground">Pages: {formatRanges(indices)}</p>}
    </DialogShell>
  )
}
