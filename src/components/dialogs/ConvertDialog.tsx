'use client'

import { useState } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { SliderField } from '@/components/editor/controls'
import { exportAnnotationsJson } from '@/services/pdf/annotation-export'
import { exportHtml, exportPagesAsImages, exportText } from '@/services/pdf/convert-service'
import { htmlToPdfBlob, htmlToPdfVisual, textToPdfBlob } from '@/services/convert/to-pdf'
import { openPdfWithPassword, pickFiles } from '@/services/import'
import { saveBlob } from '@/services/download'
import { runTask } from '@/services/tasks'
import { getPages } from '@/stores/page-store'
import { useActiveDocInfo, usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { stripExtension, withExtension } from '@/utils/file'
import { DialogShell, Field, useDialogData } from './DialogShell'
import { usePageScope } from './PageScope'

export default function ConvertDialog() {
  const data = useDialogData<{ tab?: string; format?: 'png' | 'jpeg' }>()
  const docId = usePdfStore((s) => s.activeId)
  const doc = useActiveDocInfo()
  const close = useUiStore((s) => s.closeDialog)
  const hasDoc = !!doc
  const [tabState, setTab] = useState(data?.tab ?? (hasDoc ? 'images' : 'topdf'))
  const tab = hasDoc ? tabState : 'topdf'
  const [format, setFormat] = useState<'png' | 'jpeg'>(data?.format ?? 'png')
  const [dpi, setDpi] = useState(150)
  const [quality, setQuality] = useState(0.9)
  const [edits, setEdits] = useState(true)
  const scope = usePageScope('all')
  const [source, setSource] = useState('')
  const [mode, setMode] = useState<'html' | 'text'>('html')
  const [visual, setVisual] = useState(false)
  const pageIdx = () => {
    const all = docId ? getPages(docId) : []
    return scope.ids.map((id) => all.findIndex((p) => p.id === id)).filter((i) => i >= 0)
  }

  return (
    <DialogShell id="convert" title="Convert" description="All conversions run in your browser. Where a conversion cannot be done reliably without a server, it is listed as unsupported below." size="lg" footer={<Button variant="outline" onClick={close}>Close</Button>}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {hasDoc && <><TabsTrigger value="images">PDF → Images</TabsTrigger><TabsTrigger value="text">PDF → Text</TabsTrigger><TabsTrigger value="html">PDF → HTML</TabsTrigger><TabsTrigger value="annotations">Annotations</TabsTrigger></>}
          <TabsTrigger value="topdf" data-testid="tab-topdf">To PDF</TabsTrigger>
          <TabsTrigger value="limits">Not supported</TabsTrigger>
        </TabsList>

        {hasDoc && (
          <TabsContent value="images" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Format"><Select value={format} onValueChange={(v) => setFormat(v as 'png' | 'jpeg')}><SelectTrigger aria-label="Image format" data-testid="convert-format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="png">PNG (lossless)</SelectItem><SelectItem value="jpeg">JPG</SelectItem></SelectContent></Select></Field>
              <Field label="Resolution"><Select value={String(dpi)} onValueChange={(v) => setDpi(Number(v))}><SelectTrigger aria-label="Resolution"><SelectValue /></SelectTrigger><SelectContent>{[72, 96, 150, 200, 300].map((d) => <SelectItem key={d} value={String(d)}>{d} dpi</SelectItem>)}</SelectContent></Select></Field>
            </div>
            {format === 'jpeg' && <SliderField label="JPG quality" value={Math.round(quality * 100)} min={30} max={100} step={1} onChange={(v) => setQuality(v / 100)} format={(v) => `${v}%`} />}
            <Label className="flex items-center gap-2 font-normal"><Checkbox checked={edits} onCheckedChange={(v) => setEdits(v === true)} /> Include my annotations, text edits and form values</Label>
            {scope.ui}
            <Button disabled={!!scope.error} data-testid="convert-images-run" onClick={() => { close(); void runTask('Exporting images', (ctx) => exportPagesAsImages(docId!, pageIdx(), { format, dpi, quality, includeEdits: edits }, ctx), { successMessage: 'Images exported' }) }}><Download className="size-4" /> Export {scope.ids.length} page{scope.ids.length === 1 ? '' : 's'} as {format === 'png' ? 'PNG' : 'JPG'}</Button>
          </TabsContent>
        )}
        {hasDoc && (
          <TabsContent value="text" className="space-y-3 pt-3">
            {scope.ui}
            <p className="text-xs text-muted-foreground">Extracts the text layer (plus text you added and any OCR results for scanned pages).</p>
            <Button disabled={!!scope.error} data-testid="convert-text-run" onClick={() => { close(); void runTask('Extracting text', async (ctx) => { const t = await exportText(docId!, pageIdx(), ctx); await saveBlob(new Blob([t], { type: 'text/plain;charset=utf-8' }), `${stripExtension(doc!.name)}.txt`) }) }}><Download className="size-4" /> Export text (.txt)</Button>
          </TabsContent>
        )}
        {hasDoc && (
          <TabsContent value="html" className="space-y-3 pt-3">
            {scope.ui}
            <p className="text-xs text-muted-foreground">Produces a clean, reflowable HTML file (paragraphs per page). Complex layout, fonts and images are not reproduced.</p>
            <Button disabled={!!scope.error} data-testid="convert-html-run" onClick={() => { close(); void runTask('Converting to HTML', async (ctx) => { const h = await exportHtml(docId!, pageIdx(), ctx); await saveBlob(new Blob([h], { type: 'text/html;charset=utf-8' }), `${stripExtension(doc!.name)}.html`) }) }}><Download className="size-4" /> Export HTML</Button>
          </TabsContent>
        )}
        {hasDoc && (
          <TabsContent value="annotations" className="space-y-3 pt-3">
            <p className="text-sm">Exports every annotation and edit as JSON in an Instant-JSON-style structure (positions in PDF points, top-left origin).</p>
            <Button data-testid="convert-annotations-run" onClick={() => { const json = exportAnnotationsJson(docId!); void saveBlob(new Blob([json], { type: 'application/json' }), `${stripExtension(doc!.name)}-annotations.json`); toast.success('Annotations exported') }}><Download className="size-4" /> Export annotations (JSON)</Button>
          </TabsContent>
        )}
        <TabsContent value="topdf" className="space-y-3 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={async () => { const f = (await pickFiles({ accept: '.txt,.html,.htm,.docx,.xlsx,text/plain,text/html', multiple: false }))[0]; if (!f) return; close(); const { importFiles } = await import('@/services/import'); await importFiles([f]) }} data-testid="convert-file-to-pdf">Choose TXT / HTML / DOCX / XLSX file…</Button>
            <Button variant="outline" size="sm" onClick={() => { close(); useUiStore.getState().openDialog('imagesToPdf') }}>Images → PDF…</Button>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Select value={mode} onValueChange={(v) => setMode(v as 'html' | 'text')}><SelectTrigger className="w-40" aria-label="Source type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="html">Paste HTML</SelectItem><SelectItem value="text">Paste text</SelectItem></SelectContent></Select>
              {mode === 'html' && <Label className="flex items-center gap-2 text-xs font-normal"><Checkbox checked={visual} onCheckedChange={(v) => setVisual(v === true)} /> Visual snapshot (image pages)</Label>}
            </div>
            <Textarea value={source} onChange={(e) => setSource(e.target.value)} placeholder={mode === 'html' ? '<h1>Title</h1><p>Paste or type HTML…</p>' : 'Paste or type plain text…'} className="h-36 font-mono text-xs" aria-label="Source" data-testid="convert-source" />
            <p className="text-xs text-muted-foreground">HTML is sanitised (scripts, styles, forms and remote resources are removed). The text layout mode keeps text selectable; the visual snapshot keeps appearance but rasterises pages.</p>
            <Button disabled={!source.trim()} data-testid="convert-source-run" onClick={() => { const src = source; close(); void runTask('Creating PDF', async () => { const blob = mode === 'text' ? await textToPdfBlob(src) : visual ? await htmlToPdfVisual(src) : await htmlToPdfBlob(src); await openPdfWithPassword(blob, withExtension('Converted', 'pdf')) }) }}>Create PDF</Button>
          </div>
          <Alert><AlertTitle>DOCX &amp; XLSX</AlertTitle><AlertDescription className="text-xs">DOCX is converted through HTML (headings, paragraphs, lists, tables, inline images). Complex Word layout – columns, text boxes, headers/footers, tracked changes – is simplified. XLSX sheets are rendered as tables (values only; formulas show their cached results, charts are omitted).</AlertDescription></Alert>
        </TabsContent>
        <TabsContent value="limits" className="pt-3">
          <Alert variant="destructive"><AlertTriangle className="size-4" /><AlertTitle>Not available in a browser-only app</AlertTitle>
            <AlertDescription className="space-y-1 text-xs">
              <p><strong>PDF → Word (DOCX)</strong> and <strong>PDF → Excel (XLSX)</strong> need layout analysis and a document model that cannot be done reliably without a server. They are intentionally not offered rather than faked. Use “PDF → Text” or “PDF → HTML” for reflowable content.</p>
              <p><strong>PDF → PowerPoint</strong> is likewise unsupported.</p>
              <p>Conversions <em>to</em> PDF from DOCX/XLSX are best-effort (see “To PDF”).</p>
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>
      <Input className="sr-only" tabIndex={-1} aria-hidden readOnly value="" />
    </DialogShell>
  )
}
