'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ColorField } from '@/components/editor/controls'
import { findRedactions, markRedactions, type RedactMatch } from '@/services/pdf/redact-service'
import { applyRedactions } from '@/services/actions'
import { useDebounced } from '@/hooks/use-debounced'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell, Field } from './DialogShell'
import { usePageScope } from './PageScope'

const PRESETS: [string, string][] = [['Email addresses', '[\\w.+-]+@[\\w-]+\\.[\\w.-]+'], ['Phone numbers', '\\+?\\d[\\d\\s().-]{7,}\\d'], ['Digit groups (IDs, accounts)', '\\b\\d{3}[-\\s]?\\d{2,3}[-\\s]?\\d{3,4}\\b']]

export default function RedactDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const close = useUiStore((s) => s.closeDialog)
  const [query, setQuery] = useState('')
  const [regex, setRegex] = useState(false)
  const [cs, setCs] = useState(false)
  const [ww, setWw] = useState(false)
  const [color, setColor] = useState('#000000')
  const [reason, setReason] = useState('')
  const [label, setLabel] = useState('')
  const [found, setMatches] = useState<RedactMatch[]>([])
  const [busy, setBusy] = useState(false)
  const scope = usePageScope('all')
  const q = useDebounced(query, 300)
  const matches = q.trim() && !scope.error ? found : []
  useEffect(() => {
    if (!q.trim() || scope.error) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async search lifecycle
    setBusy(true)
    findRedactions(docId, q, { caseSensitive: cs, wholeWord: ww, exactPhrase: true }, scope.ids, regex).then((m) => alive && setMatches(m)).finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [docId, q, cs, ww, regex, scope.ids.join(), scope.error]) // eslint-disable-line react-hooks/exhaustive-deps
  const mark = (apply: boolean) => {
    const n = markRedactions(docId, matches, { color, reason, overlayText: label })
    toast.success(`Marked ${n} area${n === 1 ? '' : 's'} for redaction`)
    close()
    if (apply) setTimeout(() => void applyRedactions(docId), 150)
    else useUiStore.getState().set({ redactPreview: false })
  }
  return (
    <DialogShell id="redact" title="Redact text" description="Find text (including OCR text) and mark every match for redaction. Marks become permanent only when you apply them." size="lg" footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button variant="secondary" disabled={!matches.length} onClick={() => mark(false)} data-testid="redact-mark">Mark {matches.reduce((n, m) => n + m.rects.length, 0)} area(s)</Button><Button variant="destructive" disabled={!matches.length} onClick={() => mark(true)}>Mark &amp; apply…</Button></>}>
      <Field label={regex ? 'Pattern (regular expression)' : 'Text to redact'} htmlFor="red-q"><Input id="red-q" value={query} onChange={(e) => setQuery(e.target.value)} className={regex ? 'font-mono' : ''} autoFocus data-testid="redact-query" /></Field>
      <div className="flex flex-wrap gap-3 text-sm">
        <Label className="flex items-center gap-2 font-normal"><Checkbox checked={regex} onCheckedChange={(v) => setRegex(v === true)} /> Regular expression</Label>
        <Label className="flex items-center gap-2 font-normal"><Checkbox checked={cs} onCheckedChange={(v) => setCs(v === true)} /> Case sensitive</Label>
        {!regex && <Label className="flex items-center gap-2 font-normal"><Checkbox checked={ww} onCheckedChange={(v) => setWw(v === true)} /> Whole word</Label>}
      </div>
      <div className="flex flex-wrap gap-1 text-xs"><span className="text-muted-foreground">Patterns:</span>{PRESETS.map(([n, p]) => <Button key={n} size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => { setRegex(true); setQuery(p) }}>{n}</Button>)}</div>
      <div className="grid grid-cols-3 items-end gap-3">
        <Field label="Colour"><ColorField value={color} onChange={(v) => v && setColor(v)} label="Redaction colour" /></Field>
        <Field label="Reason (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Personal data" /></Field>
        <Field label="Label on box"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="REDACTED" /></Field>
      </div>
      {scope.ui}
      <p className="text-sm" aria-live="polite" data-testid="redact-count">{busy ? <span className="inline-flex items-center gap-1"><Loader2 className="size-4 animate-spin" /> Searching…</span> : q.trim() ? `${matches.length} match${matches.length === 1 ? '' : 'es'} on ${new Set(matches.map((m) => m.pageId)).size} page(s)` : 'Type something to search.'}</p>
      <Alert><AlertDescription className="text-xs">Applying rasterises the affected pages so the original text underneath is removed from the file – not just covered. Visible text elsewhere stays searchable.</AlertDescription></Alert>
    </DialogShell>
  )
}
