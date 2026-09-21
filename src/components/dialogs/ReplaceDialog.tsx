'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { findRedactions } from '@/services/pdf/redact-service'
import { replaceHits } from '@/services/pdf/search-service'
import { runTask } from '@/services/tasks'
import { usePdfStore } from '@/stores/pdf-store'
import { useSearchStore } from '@/stores/search-store'
import { useUiStore } from '@/stores/ui-store'
import { useDebounced } from '@/hooks/use-debounced'
import { DialogShell, Field } from './DialogShell'
import type { SearchHit } from '@/stores/search-store'

export default function ReplaceDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const close = useUiStore((s) => s.closeDialog)
  const [find, setFind] = useState(useSearchStore.getState().query)
  const [rep, setRep] = useState('')
  const [cs, setCs] = useState(false)
  const [ww, setWw] = useState(false)
  const [found, setHits] = useState<SearchHit[]>([])
  const q = useDebounced(find, 250)
  const hits = q.trim() ? found : []
  useEffect(() => {
    if (!q.trim()) return
    let alive = true
    findRedactions(docId, q, { caseSensitive: cs, wholeWord: ww, exactPhrase: true }).then((m) => alive && setHits(m.map((x) => ({ pageId: x.pageId, pageIndex: x.pageIndex, rects: x.rects, before: '', match: x.text, after: '', fromOcr: false }))))
    return () => { alive = false }
  }, [docId, q, cs, ww])
  return (
    <DialogShell id="replace" title="Find & replace" description="Replaces text by covering the original and overlaying the new text at the same position." footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={!hits.length || !rep} data-testid="replace-run" onClick={() => { close(); void runTask('Replacing text', async () => { const n = await replaceHits(docId, hits, rep); toast.success(`Replaced ${n} match${n === 1 ? '' : 'es'}`) }, { quiet: true }) }}>Replace {hits.length}</Button></>}>
      <Field label="Find" htmlFor="rp-find"><Input id="rp-find" value={find} onChange={(e) => setFind(e.target.value)} autoFocus data-testid="replace-find" /></Field>
      <Field label="Replace with" htmlFor="rp-with"><Input id="rp-with" value={rep} onChange={(e) => setRep(e.target.value)} data-testid="replace-with" /></Field>
      <div className="flex gap-4"><Label className="flex items-center gap-2 font-normal"><Checkbox checked={cs} onCheckedChange={(v) => setCs(v === true)} /> Case sensitive</Label><Label className="flex items-center gap-2 font-normal"><Checkbox checked={ww} onCheckedChange={(v) => setWw(v === true)} /> Whole word</Label></div>
      <p className="text-sm" aria-live="polite">{q.trim() ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : 'Type something to find.'}</p>
      <Alert><AlertDescription className="text-xs">This is an <strong>overlay</strong> replacement: the original text is hidden but remains in the file. Use Redact to remove it permanently. Longer replacement text may overlap neighbouring words.</AlertDescription></Alert>
    </DialogShell>
  )
}
