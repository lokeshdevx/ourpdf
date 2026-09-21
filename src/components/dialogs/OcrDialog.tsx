'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, Download, Languages, Loader2, ScanText, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { bytesToBlob, saveBlob } from '@/services/download'
import { exportPdfBytes } from '@/services/pdf/export-service'
import { clearOcr, detectLanguage, ocrPages, ocrTextFor, OCR_LANGUAGES, type LangGuess } from '@/services/ocr/ocr-service'
import { useActiveDocInfo } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { isCancelled, toUserError } from '@/lib/errors'
import { stripExtension } from '@/utils/file'
import { DialogShell, Field } from './DialogShell'
import { usePageScope } from './PageScope'
import { useCurrentPageIndex, useActivePages } from '@/stores/page-store'

export default function OcrDialog() {
  const doc = useActiveDocInfo()!
  const pages = useActivePages()
  const current = useCurrentPageIndex()
  const close = useUiStore((s) => s.closeDialog)
  const [langs, setLangs] = useState<string[]>(['eng'])
  const [scale, setScale] = useState('2.5')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('')
  const [ctrl, setCtrl] = useState<AbortController | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guess, setGuess] = useState<LangGuess[] | null>(null)
  const [detecting, setDetecting] = useState(false)
  const scope = usePageScope('current')
  const done = Object.keys(doc.ocr).length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const text = useMemo(() => ocrTextFor(doc.id), [doc.id, doc.ocr])
  useEffect(() => () => ctrl?.abort(), [ctrl])

  const toggle = (c: string) => setLangs((l) => (l.includes(c) ? (l.length > 1 ? l.filter((x) => x !== c) : l) : [...l, c]))
  const run = async () => {
    setError(null)
    if (scope.error || !scope.ids.length) return setError(scope.error ?? 'No pages')
    const c = new AbortController()
    setCtrl(c)
    setBusy(true)
    setProgress(0)
    try {
      await ocrPages(doc.id, scope.ids, { languages: langs, scale: parseFloat(scale), signal: c.signal, onProgress: (f, l) => { setProgress(f); setLabel(l) } })
      toast.success('OCR complete – text is now searchable and copyable')
    } catch (e) {
      if (isCancelled(e)) toast.info('OCR cancelled')
      else setError(toUserError(e).message + (toUserError(e).detail ? ` (${toUserError(e).detail})` : ''))
    } finally {
      setBusy(false)
      setCtrl(null)
    }
  }
  const detect = async () => {
    setDetecting(true)
    setGuess(null)
    try {
      const g = await detectLanguage(doc.id, pages[current].id)
      setGuess(g)
      if (g[0]?.confidence > 0) setLangs([g[0].code])
    } catch (e) {
      if (!isCancelled(e)) setError(toUserError(e).message)
    } finally {
      setDetecting(false)
    }
  }
  const searchable = async () => {
    const bytes = await exportPdfBytes(doc.id, { includeOcr: true })
    await saveBlob(bytesToBlob(bytes), `${stripExtension(doc.name)}-searchable.pdf`)
  }
  return (
    <DialogShell
      id="ocr"
      title="OCR – recognise text"
      description="Runs the Tesseract engine locally in a worker (no upload). Recognised text becomes searchable and copyable, and can be embedded as an invisible text layer."
      size="lg"
      footer={<><Button variant="outline" onClick={close}>Close</Button>{busy ? <Button variant="destructive" onClick={() => ctrl?.abort()} data-testid="ocr-cancel">Cancel OCR</Button> : <Button onClick={() => void run()} data-testid="ocr-run"><ScanText className="size-4" /> Recognise {scope.ids.length} page{scope.ids.length === 1 ? '' : 's'}</Button>}</>}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="text-sm font-medium">Languages</h3><Button size="sm" variant="outline" disabled={detecting || busy} onClick={() => void detect()}>{detecting ? <Loader2 className="size-3.5 animate-spin" /> : <Languages className="size-3.5" />} Detect from current page</Button></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {OCR_LANGUAGES.map((l) => <Label key={l.code} className="flex items-center gap-2 font-normal"><Checkbox checked={langs.includes(l.code)} onCheckedChange={() => toggle(l.code)} data-testid={`lang-${l.code}`} /> {l.label}</Label>)}
        </div>
        {guess && <p className="text-xs text-muted-foreground" data-testid="ocr-guess">Detected: {guess.filter((g) => g.confidence > 0).slice(0, 3).map((g) => `${g.label} (${Math.round(g.confidence)}%)`).join(', ') || 'no text found'}</p>}
        <p className="text-xs text-muted-foreground">Several languages can be combined for mixed-language documents (slower).</p>
      </div>
      {scope.ui}
      <Field label="Quality">
        <Select value={scale} onValueChange={setScale}><SelectTrigger aria-label="OCR resolution"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1.5">Fast (110 dpi)</SelectItem><SelectItem value="2.5">Balanced (180 dpi)</SelectItem><SelectItem value="4">Accurate (290 dpi)</SelectItem></SelectContent></Select>
      </Field>
      {busy && <div className="space-y-1" role="status" aria-live="polite"><Progress value={progress * 100} data-testid="ocr-progress" /><p className="text-xs text-muted-foreground">{label || 'Starting the OCR engine…'}</p></div>}
      {error && <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive" role="alert" data-testid="ocr-error">{error}</p>}
      {done > 0 && (
        <div className="space-y-2 rounded-md border p-3" data-testid="ocr-results">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium">Results ({done} page{done > 1 ? 's' : ''})</h3>
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success('Copied'))}><Copy className="size-3.5" /> Copy</Button>
            <Button size="sm" variant="outline" onClick={() => void saveBlob(new Blob([text], { type: 'text/plain' }), `${stripExtension(doc.name)}-ocr.txt`)}><Download className="size-3.5" /> Export .txt</Button>
            <Button size="sm" variant="outline" onClick={() => void searchable()} data-testid="ocr-searchable">Searchable PDF</Button>
            <Button size="sm" variant="ghost" onClick={() => clearOcr(doc.id)}><Trash2 className="size-3.5" /> Clear</Button>
          </div>
          <Textarea readOnly value={text} className="h-40 font-mono text-xs" aria-label="Recognised text" data-testid="ocr-text" />
        </div>
      )}
    </DialogShell>
  )
}
