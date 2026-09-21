'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { bytesToBlob } from '@/services/download'
import { exportPdfBytes } from '@/services/pdf/export-service'
import { canvasToBlob, renderPageToCanvas } from '@/services/pdf/renderer'
import { destroySource, openSource } from '@/services/pdf/sources'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell, Field } from './DialogShell'
import { usePageScope } from './PageScope'

interface Preview {
  urls: string[]
  count: number
  key: string
}

export default function PrintDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const close = useUiStore((s) => s.closeDialog)
  const [annotations, setAnnotations] = useState(true)
  const [forms, setForms] = useState(true)
  const [dpi, setDpi] = useState('150')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const scope = usePageScope('all')
  const urlsRef = useRef<string[]>([])

  const revoke = () => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
  }
  useEffect(() => () => revoke(), [])
  const optionsKey = `${annotations}|${forms}|${dpi}|${scope.ids.join()}`

  /** Renders the *exported* document (so annotations and form values are exactly what will print). */
  const render = async (limit?: number): Promise<string[]> => {
    const bytes = await exportPdfBytes(docId, { pageIds: scope.ids, annotations, forms })
    const src = await openSource(bytesToBlob(bytes), 'print.pdf')
    const urls: string[] = []
    try {
      const n = limit ? Math.min(limit, src.numPages) : src.numPages
      for (let i = 0; i < n; i++) {
        const p = await src.proxy.getPage(i + 1)
        const vp = p.getViewport({ scale: 1 })
        p.cleanup()
        const canvas = await renderPageToCanvas({ sourceId: src.id, sourceIndex: i, width: vp.width, height: vp.height }, Number(dpi) / 72, { annotationMode: 'storage' })
        const blob = await canvasToBlob(canvas, 'image/png')
        canvas.width = canvas.height = 0
        urls.push(URL.createObjectURL(blob))
      }
    } finally {
      await destroySource(src.id)
    }
    return urls
  }

  const doPreview = async () => {
    if (scope.error || !scope.ids.length) return void toast.error(scope.error ?? 'No pages')
    setBusy(true)
    revoke()
    try {
      const urls = await render(12)
      urlsRef.current = urls
      setPreview({ urls, count: scope.ids.length, key: optionsKey })
    } catch (e) { toast.error('Preview failed', { description: (e as Error).message }) } finally { setBusy(false) }
  }

  const doPrint = async () => {
    if (scope.error || !scope.ids.length) return void toast.error(scope.error ?? 'No pages')
    setBusy(true)
    try {
      const urls = await render()
      let root = document.getElementById('print-root')
      if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root) }
      root.replaceChildren()
      const imgs = urls.map((u) => { const im = new Image(); im.src = u; im.alt = ''; root!.appendChild(im); return im })
      await Promise.all(imgs.map((i) => i.decode().catch(() => {})))
      const cleanup = () => { root?.replaceChildren(); urls.forEach((u) => URL.revokeObjectURL(u)); window.removeEventListener('afterprint', cleanup) }
      window.addEventListener('afterprint', cleanup)
      setTimeout(cleanup, 10 * 60_000)
      close()
      setTimeout(() => window.print(), 100)
    } catch (e) { toast.error('Print failed', { description: (e as Error).message }) } finally { setBusy(false) }
  }

  return (
    <DialogShell id="print" title="Print" description="Pages are rendered locally from your edited document so annotations and form values print exactly as shown." size="lg" footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button variant="outline" disabled={busy} onClick={() => void doPreview()} data-testid="print-preview">{busy && <Loader2 className="size-4 animate-spin" />} Preview</Button><Button disabled={busy} onClick={() => void doPrint()} data-testid="print-run"><Printer className="size-4" /> Print {scope.ids.length} page{scope.ids.length === 1 ? '' : 's'}</Button></>}>
      {scope.ui}
      <div className="grid grid-cols-2 gap-3">
        <Label className="flex items-center gap-2 font-normal"><Checkbox checked={annotations} onCheckedChange={(v) => setAnnotations(v === true)} /> Print annotations &amp; edits</Label>
        <Label className="flex items-center gap-2 font-normal"><Checkbox checked={forms} onCheckedChange={(v) => setForms(v === true)} /> Print form values</Label>
      </div>
      <Field label="Print quality"><Select value={dpi} onValueChange={setDpi}><SelectTrigger className="w-40" aria-label="Print quality"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="96">Draft (96 dpi)</SelectItem><SelectItem value="150">Normal (150 dpi)</SelectItem><SelectItem value="220">High (220 dpi)</SelectItem></SelectContent></Select></Field>
      {preview && preview.key === optionsKey && (
        <div data-testid="print-preview-grid">
          <p className="mb-1 text-xs text-muted-foreground">Preview{preview.count > preview.urls.length ? ` (first ${preview.urls.length} of ${preview.count} pages)` : ''}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{preview.urls.map((u, i) =>   <img key={u} src={u} alt={`Print preview page ${i + 1}`} className="w-full rounded border bg-white shadow-sm" />)}</div>
        </div>
      )}
    </DialogShell>
  )
}
