'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { pdfToDocx } from '@/tools/lib/docx'
import { pdfToEpub } from '@/tools/lib/epub'
import { extractImages, extractTables, pdfToHtmlSemantic, pdfToHtmlVisual } from '@/tools/lib/extract'
import { allPageText, baseName, canvasBlob, closePdf, openPdfjs, parseRanges, renderPage } from '@/tools/lib/pdf'
import { buildPptx, pdfToSlides } from '@/tools/lib/pptx'
import { EMPTY_META, readMetadata, writeMetadata, type Metadata } from '@/tools/lib/security'
import { Grid, NumberInput, Note, Panel, PdfPicker, Range, Results, RunBar, Segmented, TextInput, Toggle, pdfOut, usePdfInput, useTask, type OutFile } from '../kit'

/* ----------------------------------------------------------- PDF → Word */

export function PdfToWord() {
  const pdf = usePdfInput()
  const [tables, setTables] = useState(true)
  const [scans, setScans] = useState(true)
  const [breaks, setBreaks] = useState(true)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Options">
        <Grid>
          <Toggle label="Rebuild tables" hint="Columns of text become real Word tables" checked={tables} onChange={setTables} />
          <Toggle label="Keep scanned pages as pictures" hint="Pages without text are inserted as images" checked={scans} onChange={setScans} />
          <Toggle label="Page break after each PDF page" checked={breaks} onChange={setBreaks} />
        </Grid>
        <div className="mt-4"><Note>Headings, paragraphs, bold text and tables are recreated as editable Word content. For scanned PDFs, run <Link className="underline" href="/editor?tool=ocr">OCR</Link> first to get editable text.</Note></div>
      </Panel>
      <RunBar task={task} label="Convert to Word" disabled={!pdf.input} onRun={async () => {
        const name = baseName(pdf.input!.file.name)
        const r = await task.run((p) => pdfToDocx(pdf.input!.bytes, { title: name, tables, scannedAsImages: scans, pageBreaks: breaks, onProgress: p }), 'Converting')
        if (r) setOut([{ name: `${name}.docx`, blob: r }])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ------------------------------------------------------------ PDF → JPG */

export function PdfToImages() {
  const pdf = usePdfInput()
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg')
  const [dpi, setDpi] = useState(150)
  const [quality, setQuality] = useState(0.9)
  const [pages, setPages] = useState('')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp'
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Image settings">
        <div className="space-y-4">
          <Segmented label="Format" value={format} onChange={setFormat} options={[['image/jpeg', 'JPG'], ['image/png', 'PNG (lossless)'], ['image/webp', 'WebP']]} />
          <Segmented label="Resolution" value={dpi} onChange={setDpi} options={[[72, '72 dpi'], [150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi'], [450, '450 dpi'], [600, '600 dpi']]} />
          {format !== 'image/png' && <Range label="Quality" value={quality} min={0.4} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setQuality} />}
          <TextInput label="Pages (blank = all)" value={pages} onChange={setPages} placeholder="e.g. 1-3, 7" />
          {dpi >= 450 && <Note tone="warn">Very high resolutions need a lot of memory. On phones, convert a few pages at a time.</Note>}
        </div>
      </Panel>
      <RunBar task={task} label="Convert pages" disabled={!pdf.input} onRun={async () => {
        const inp = pdf.input!
        const name = baseName(inp.file.name)
        const r = await task.run(async (p) => {
          const idx = parseRanges(pages, inp.pages)
          const doc = await openPdfjs(inp.bytes)
          const res: OutFile[] = []
          for (let k = 0; k < idx.length; k++) {
            const page = await doc.getPage(idx[k] + 1)
            let scale = dpi / 72
            const vp = page.getViewport({ scale })
            // keep under ~180 MP canvas limits
            const maxPx = 180e6
            if (vp.width * vp.height > maxPx) scale *= Math.sqrt(maxPx / (vp.width * vp.height))
            const c = await renderPage(page, scale)
            res.push({ name: `${name}-page${String(idx[k] + 1).padStart(String(inp.pages).length, '0')}.${ext}`, blob: await canvasBlob(c, format, quality), note: `${c.width} × ${c.height}px` })
            c.width = c.height = 0
            page.cleanup()
            p((k + 1) / idx.length, `Page ${idx[k] + 1}`)
          }
          await closePdf(doc)
          return res
        }, 'Rendering')
        if (r) setOut(r)
      }} />
      <Results files={out} zipName={`${pdf.input ? baseName(pdf.input.file.name) : 'pages'}-images.zip`} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* -------------------------------------------------------------- metadata */

export function EditMetadata() {
  const pdf = usePdfInput()
  const [meta, setMeta] = useState<Metadata | null>(null)
  const [info, setInfo] = useState<{ pages: number; xmp: boolean; version: string } | null>(null)
  const [stripXmp, setStripXmp] = useState(false)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const field = (k: keyof Metadata, label: string, type = 'text') => <TextInput label={label} type={type} value={meta?.[k] ?? ''} onChange={(v) => setMeta({ ...(meta ?? EMPTY_META), [k]: v })} />
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setMeta(null); pdf.reset() } }} /></Panel>
      {pdf.input && !meta && <Button onClick={async () => {
        const r = await task.run(() => readMetadata(pdf.input!.bytes), 'Reading')
        if (r) {
          const { pages, xmp, version, ...m } = r
          setMeta(m)
          setInfo({ pages, xmp, version })
        }
      }}>Read metadata</Button>}
      {meta && (
        <Panel title="Document properties" actions={<Button variant="outline" size="sm" onClick={() => { setMeta({ ...EMPTY_META }); setStripXmp(true) }}>Clear all</Button>}>
          <Grid>
            {field('title', 'Title')}{field('author', 'Author')}{field('subject', 'Subject')}{field('keywords', 'Keywords (comma-separated)')}
            {field('creator', 'Creator (application)')}{field('producer', 'Producer')}{field('creationDate', 'Created', 'datetime-local')}{field('modificationDate', 'Modified', 'datetime-local')}
          </Grid>
          <div className="mt-4 space-y-3">
            {info && <p className="text-xs text-muted-foreground">PDF {info.version} · {info.pages} pages · {info.xmp ? 'contains an XMP metadata stream' : 'no XMP metadata'}</p>}
            <Toggle label="Remove the XMP metadata stream" hint="XMP can hold editing history, software and author details hidden from the properties above" checked={stripXmp} onChange={setStripXmp} />
          </div>
        </Panel>
      )}
      <RunBar task={task} label="Save metadata" disabled={!meta} onRun={async () => {
        const r = await task.run(() => writeMetadata(pdf.input!.bytes, meta!, { stripXmp }), 'Saving')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}.pdf`, 'metadata updated')])
      }} />
      <Results files={out} onReset={() => { setOut([]); setMeta(null); pdf.reset() }} />
    </div>
  )
}

/* -------------------------------------------------------- extract images */

export function ExtractImages() {
  const pdf = usePdfInput()
  const [min, setMin] = useState(32)
  const [out, setOut] = useState<OutFile[]>([])
  const [skipped, setSkipped] = useState(0)
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Options">
        <NumberInput label="Ignore images smaller than" value={min} min={1} suffix="px" onChange={setMin} hint="Skips icons, bullets and spacer images" />
        <p className="mt-3 text-xs text-muted-foreground">JPEG photos are saved byte-for-byte – exactly the quality stored in the PDF. Other images are decoded and saved as lossless PNG (with transparency).</p>
      </Panel>
      <RunBar task={task} label="Extract images" disabled={!pdf.input} onRun={async () => {
        const r = await task.run((p) => extractImages(pdf.input!.bytes, { minSize: min || 1, onProgress: p }), 'Scanning')
        if (!r) return
        if (!r.images.length) task.setError(r.skipped ? `Found ${r.skipped} image(s) in formats that can’t be extracted directly (fax/JBIG2). Use PDF to JPG instead.` : 'This PDF contains no embedded images.')
        setSkipped(r.skipped)
        setOut(r.images.map((im) => ({ name: im.name, blob: im.blob, note: `${im.width} × ${im.height} · ${im.format}${im.page ? ` · page ${im.page}` : ''}` })))
      }} />
      <Results files={out} zipName={`${pdf.input ? baseName(pdf.input.file.name) : 'pdf'}-images.zip`} summary={skipped > 0 && <Note tone="warn">{skipped} image(s) used formats that can’t be extracted directly.</Note>} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ---------------------------------------------------------- PDF → Excel */

export function PdfToExcel() {
  const pdf = usePdfInput()
  const [layout, setLayout] = useState<'sheet-per-page' | 'single'>('sheet-per-page')
  const [numbers, setNumbers] = useState(true)
  const [onlyTables, setOnlyTables] = useState(false)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Options">
        <div className="space-y-4">
          <Segmented value={layout} onChange={setLayout} options={[['sheet-per-page', 'One sheet per page'], ['single', 'Everything on one sheet']]} />
          <Grid>
            <Toggle label="Convert numbers" hint="“1,234.50” and “₹500” become real numbers you can sum" checked={numbers} onChange={setNumbers} />
            <Toggle label="Only table rows" hint="Skip titles and paragraphs" checked={onlyTables} onChange={setOnlyTables} />
          </Grid>
          <Note>Columns are detected from how the text lines up. For scanned statements, run <Link className="underline" href="/editor?tool=ocr">OCR</Link> first.</Note>
        </div>
      </Panel>
      <RunBar task={task} label="Convert to Excel" disabled={!pdf.input} onRun={async () => {
        const name = baseName(pdf.input!.file.name)
        const r = await task.run(async (p) => {
          const tables = await extractTables(pdf.input!.bytes, { numbers, onlyTables, onProgress: (f) => p(f * 0.9, 'Detecting tables') })
          const XLSX = await import('xlsx')
          const wb = XLSX.utils.book_new()
          if (layout === 'single') XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tables.flatMap((t) => t.rows)), 'Data')
          else for (const t of tables) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.rows.length ? t.rows : [['(no text on this page)']]), `Page ${t.page}`)
          for (const n of wb.SheetNames) {
            const ws = wb.Sheets[n]
            const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]
            const widths = Array.from({ length: Math.max(0, ...rows.map((r) => r.length)) }, (_, c) => ({ wch: Math.min(60, Math.max(8, ...rows.map((r) => String(r[c] ?? '').length))) }))
            ws['!cols'] = widths
          }
          const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
          return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        }, 'Converting')
        if (r) setOut([{ name: `${name}.xlsx`, blob: r }])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ------------------------------------------------------ PDF → PowerPoint */

export function PdfToPowerPoint() {
  const pdf = usePdfInput()
  const [editable, setEditable] = useState(true)
  const [quality, setQuality] = useState(2)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Options">
        <div className="space-y-4">
          <Segmented value={editable ? 'edit' : 'image'} onChange={(v) => setEditable(v === 'edit')} options={[['edit', 'Editable text boxes'], ['image', 'Picture slides (exact)']]} />
          <p className="text-xs text-muted-foreground">{editable ? 'Graphics and images become the slide background; every line of text is a separate, editable text box with its size, weight and colour.' : 'Each page becomes one full-slide picture – it looks exactly like the PDF but the text cannot be edited.'}</p>
          <Segmented label="Image quality" value={quality} onChange={setQuality} options={[[1.5, 'Standard'], [2, 'High'], [3, 'Very high']]} />
        </div>
      </Panel>
      <RunBar task={task} label="Convert to PowerPoint" disabled={!pdf.input} onRun={async () => {
        const name = baseName(pdf.input!.file.name)
        const r = await task.run(async (p) => buildPptx(await pdfToSlides(pdf.input!.bytes, { editable, scale: quality, onProgress: (f) => p(f * 0.9, 'Building slides') }), name), 'Converting')
        if (r) setOut([{ name: `${name}.pptx`, blob: r }])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ---------------------------------------------------------- Extract text */

export function ExtractText() {
  const pdf = usePdfInput()
  const [pages, setPages] = useState('')
  const [markers, setMarkers] = useState(true)
  const [joinLines, setJoinLines] = useState(false)
  const [text, setText] = useState('')
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setText(''); pdf.reset() } }} /></Panel>
      <Panel title="Options">
        <Grid cols={3}>
          <TextInput label="Pages (blank = all)" value={pages} onChange={setPages} />
          <Toggle label="Page separators" checked={markers} onChange={setMarkers} />
          <Toggle label="Join wrapped lines into paragraphs" checked={joinLines} onChange={setJoinLines} />
        </Grid>
      </Panel>
      <RunBar task={task} label="Extract text" disabled={!pdf.input} onRun={async () => {
        const r = await task.run(async (p) => {
          const doc = await openPdfjs(pdf.input!.bytes)
          const all = await allPageText(doc, p)
          await closePdf(doc)
          const idx = parseRanges(pages, all.length)
          const parts = idx.map((i) => {
            let t = all[i].text
            if (joinLines) t = t.replace(/-\n(?=[a-z])/g, '').replace(/([^\n.!?:])\n(?=[a-z0-9(])/g, '$1 ')
            return markers ? `──── Page ${i + 1} ────\n${t}` : t
          })
          const res = parts.join('\n\n')
          if (!res.replace(/──── Page \d+ ────/g, '').trim()) throw new Error('No text found – this looks like a scanned PDF. Run OCR first to make its text extractable.')
          return res
        }, 'Reading text')
        if (r) setText(r)
      }} />
      {text && (
        <Panel title={`${text.length.toLocaleString()} characters`} actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(text); toast.success('Copied to clipboard') }}><Copy className="mr-1.5 size-4" aria-hidden /> Copy</Button></div>}>
          <textarea readOnly aria-label="Extracted text" className="h-96 w-full rounded-lg border bg-background p-3 font-mono text-xs" value={text} />
        </Panel>
      )}
      <Results files={text ? [{ name: `${pdf.input ? baseName(pdf.input.file.name) : 'text'}.txt`, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }] : []} />
    </div>
  )
}

/* ----------------------------------------------------------- PDF → HTML */

export function PdfToHtml() {
  const pdf = usePdfInput()
  const [mode, setMode] = useState<'visual' | 'semantic'>('visual')
  const [scale, setScale] = useState(1.5)
  const [tables, setTables] = useState(true)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Output style">
        <div className="space-y-4">
          <Segmented value={mode} onChange={setMode} options={[['visual', 'Pixel-accurate'], ['semantic', 'Semantic (reflowing)']]} />
          <p className="text-xs text-muted-foreground">{mode === 'visual' ? 'Looks exactly like the PDF – colours, fonts and layout – with selectable, searchable text and working links. One self-contained .html file.' : 'Clean HTML with real headings, paragraphs, tables and links that adapts to any screen and is easy to edit or publish.'}</p>
          {mode === 'visual' ? <Segmented label="Image sharpness" value={scale} onChange={setScale} options={[[1, 'Standard'], [1.5, 'Sharp'], [2, 'Retina']]} /> : <Toggle label="Detect tables" checked={tables} onChange={setTables} />}
        </div>
      </Panel>
      <RunBar task={task} label="Convert to HTML" disabled={!pdf.input} onRun={async () => {
        const name = baseName(pdf.input!.file.name)
        const r = await task.run((p) => (mode === 'visual' ? pdfToHtmlVisual(pdf.input!.bytes, { scale, title: name, onProgress: p }) : pdfToHtmlSemantic(pdf.input!.bytes, { title: name, tables, onProgress: p })), 'Converting')
        if (r) setOut([{ name: `${name}.html`, blob: new Blob([r], { type: 'text/html;charset=utf-8' }) }])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ----------------------------------------------------------- PDF → EPUB */

export function PdfToEpub() {
  const pdf = usePdfInput()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [scans, setScans] = useState(true)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Book details">
        <Grid>
          <TextInput label="Title" value={title} onChange={setTitle} placeholder={pdf.input ? baseName(pdf.input.file.name) : ''} />
          <TextInput label="Author" value={author} onChange={setAuthor} />
        </Grid>
        <div className="mt-4"><Toggle label="Include pages without text as images" checked={scans} onChange={setScans} /></div>
        <p className="mt-3 text-xs text-muted-foreground">Chapters follow the PDF’s bookmarks when it has them. The EPUB 3 file reflows on Kindle (via Send to Kindle), Kobo, Apple Books, Google Play Books and others.</p>
      </Panel>
      <RunBar task={task} label="Create EPUB" disabled={!pdf.input} onRun={async () => {
        const t = title.trim() || baseName(pdf.input!.file.name)
        const r = await task.run((p) => pdfToEpub(pdf.input!.bytes, { title: t, author, scansAsImages: scans, onProgress: p }), 'Converting')
        if (r) setOut([{ name: `${t}.epub`, blob: r }])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}
