'use client'

import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { blocksToPdfBlob, docxToPdfBlob, htmlToPdfBlob, htmlToPdfVisual, imagesToPdfBlob, type PageSizeName } from '@/services/convert/to-pdf'
import { epubToHtml, textBookToHtml } from '@/tools/lib/epub'
import { extractTables, parseCsv, toCsv } from '@/tools/lib/extract'
import { markdownToHtml } from '@/tools/lib/markdown'
import { baseName } from '@/tools/lib/pdf'
import { pptxToPdf } from '@/tools/lib/pptx'
import { xlsxToPdf } from '@/tools/lib/xlsx-render'
import { FileChip, FileDrop, FileOrderList, Grid, NumberInput, Note, Panel, PdfPicker, Results, RunBar, Segmented, Select, TextArea, TextInput, Toggle, pdfOut, usePdfInput, useTask, type OutFile } from '../kit'

const SIZES: readonly (readonly [PageSizeName, string])[] = [['A4', 'A4'], ['Letter', 'US Letter'], ['Legal', 'US Legal'], ['A3', 'A3']]

function SingleFile({ accept, file, setFile, label }: { accept: string; file: File | null; setFile: (f: File | null) => void; label: string }) {
  return file ? <FileChip file={file} onRemove={() => setFile(null)} /> : <FileDrop accept={accept} label={label} onFiles={(f) => setFile(f[0])} />
}

/* ----------------------------------------------------------------- Word */

export function WordToPdf() {
  const [files, setFiles] = useState<File[]>([])
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const legacy = files.filter((f) => /\.doc$/i.test(f.name))
  return (
    <div className="space-y-6">
      <Panel title="Word documents">
        <div className="space-y-4">
          {files.length > 0 && <FileOrderList files={files} onChange={setFiles} />}
          <FileDrop accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" multiple compact={files.length > 0} label={files.length ? 'Add more' : 'Choose .docx files'} onFiles={(f) => setFiles([...files, ...f])} />
          {legacy.length > 0 && <Note tone="warn">Old binary .doc files ({legacy.map((f) => f.name).join(', ')}) can’t be read in the browser. Open them in Word, LibreOffice or Google Docs and save as .docx first.</Note>}
        </div>
      </Panel>
      <RunBar task={task} label="Convert to PDF" disabled={!files.some((f) => /\.docx$/i.test(f.name))} onRun={async () => {
        const r = await task.run(async (p) => {
          const res: OutFile[] = []
          const docs = files.filter((f) => /\.docx$/i.test(f.name))
          for (let i = 0; i < docs.length; i++) {
            res.push({ name: `${baseName(docs[i].name)}.pdf`, blob: await docxToPdfBlob(docs[i], docs[i].name) })
            p((i + 1) / docs.length, `Converting ${docs[i].name}`)
          }
          return res
        }, 'Converting')
        if (r) setOut(r)
      }} />
      <Results files={out} onReset={() => { setOut([]); setFiles([]) }} />
    </div>
  )
}

/* --------------------------------------------------------------- images */

export function ImagesToPdf() {
  const [files, setFiles] = useState<File[]>([])
  const [size, setSize] = useState<'fit' | PageSizeName>('A4')
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto')
  const [margin, setMargin] = useState(24)
  const [separate, setSeparate] = useState(false)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const thumbs = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  return (
    <div className="space-y-6">
      <Panel title="Images">
        <div className="space-y-4">
          {files.length > 0 && (
            <>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                { }
                {thumbs.map((u, i) => <li key={u} className="relative aspect-square overflow-hidden rounded-lg border bg-muted"><img src={u} alt={files[i].name} className="size-full object-cover" /><span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">{i + 1}</span></li>)}
              </ul>
              <FileOrderList files={files} onChange={setFiles} />
            </>
          )}
          <FileDrop accept="image/*" multiple compact={files.length > 0} label={files.length ? 'Add more images' : 'Choose images'} onFiles={(f) => setFiles([...files, ...f.filter((x) => x.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|tiff?|heic)$/i.test(x.name))])} />
        </div>
      </Panel>
      <Panel title="Page setup">
        <Grid cols={3}>
          <Select label="Page size" value={size} onChange={setSize} options={[['fit', 'Same as image'], ...SIZES]} />
          <Select label="Orientation" value={orientation} onChange={setOrientation} options={[['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]} />
          <NumberInput label="Margin" value={margin} min={0} max={144} suffix="pt" onChange={setMargin} />
        </Grid>
        <div className="mt-4"><Toggle label="One PDF per image" checked={separate} onChange={setSeparate} /></div>
      </Panel>
      <RunBar task={task} label={`Convert ${files.length || ''} image${files.length === 1 ? '' : 's'}`} disabled={!files.length} onRun={async () => {
        const opts = { pageSize: size, orientation, margin: size === 'fit' ? 0 : margin, dpi: 96 }
        const r = await task.run(async (p) => {
          if (!separate) return [{ name: files.length === 1 ? `${baseName(files[0].name)}.pdf` : 'images.pdf', blob: await imagesToPdfBlob(files, opts, (f) => p(f)) }]
          const res: OutFile[] = []
          for (let i = 0; i < files.length; i++) {
            res.push({ name: `${baseName(files[i].name)}.pdf`, blob: await imagesToPdfBlob([files[i]], opts) })
            p((i + 1) / files.length)
          }
          return res
        }, 'Converting')
        if (r) setOut(r)
      }} />
      <Results files={out} onReset={() => { setOut([]); setFiles([]) }} />
    </div>
  )
}

/* ---------------------------------------------------------------- Excel */

export function ExcelToPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [pageSize, setPageSize] = useState<PageSizeName>('A4')
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto')
  const [fitWidth, setFitWidth] = useState(true)
  const [grid, setGrid] = useState(true)
  const [header, setHeader] = useState(true)
  const [sheets, setSheets] = useState<'all' | 'first'>('all')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="Spreadsheet"><SingleFile accept=".xlsx,.xls,.xlsm,.ods,.csv" file={file} setFile={setFile} label="Choose spreadsheet" /></Panel>
      <Panel title="Print settings">
        <Grid cols={3}>
          <Select label="Paper" value={pageSize} onChange={setPageSize} options={SIZES} />
          <Select label="Orientation" value={orientation} onChange={setOrientation} options={[['auto', 'Automatic (wide sheets landscape)'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]} />
          <Select label="Sheets" value={sheets} onChange={setSheets} options={[['all', 'All sheets'], ['first', 'First sheet only']]} />
        </Grid>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Toggle label="Fit all columns on one page width" checked={fitWidth} onChange={setFitWidth} />
          <Toggle label="Print gridlines" checked={grid} onChange={setGrid} />
          <Toggle label="Repeat first row on every page" checked={header} onChange={setHeader} />
        </div>
      </Panel>
      <RunBar task={task} label="Convert to PDF" disabled={!file} onRun={async () => {
        const r = await task.run((p) => xlsxToPdf(file!, { pageSize, orientation, fitWidth, gridlines: grid, repeatHeader: header, sheets }, p), 'Rendering sheets')
        if (r) setOut([pdfOut(r, `${baseName(file!.name)}.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); setFile(null) }} />
    </div>
  )
}

/* ----------------------------------------------------------- PowerPoint */

export function PowerPointToPdf() {
  const [files, setFiles] = useState<File[]>([])
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const legacy = files.some((f) => /\.ppt$/i.test(f.name))
  return (
    <div className="space-y-6">
      <Panel title="Presentations">
        <div className="space-y-4">
          {files.length > 0 && <FileOrderList files={files} onChange={setFiles} />}
          <FileDrop accept=".pptx,.ppsx,.potx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple compact={files.length > 0} label={files.length ? 'Add more' : 'Choose .pptx files'} onFiles={(f) => setFiles([...files, ...f])} />
          {legacy && <Note tone="warn">Old .ppt files must be re-saved as .pptx first.</Note>}
          <Note>Slides are rebuilt as vector PDF pages: backgrounds, shapes, pictures, text, theme colours and master-slide elements. Charts, SmartArt and animations are not rendered.</Note>
        </div>
      </Panel>
      <RunBar task={task} label="Convert to PDF" disabled={!files.some((f) => /\.(pptx|ppsx|potx)$/i.test(f.name))} onRun={async () => {
        const r = await task.run(async (p) => {
          const res: OutFile[] = []
          const list = files.filter((f) => /\.(pptx|ppsx|potx)$/i.test(f.name))
          for (let i = 0; i < list.length; i++) res.push(pdfOut(await pptxToPdf(list[i], (f) => p((i + f) / list.length, `Rendering ${list[i].name}`)), `${baseName(list[i].name)}.pdf`))
          return res
        }, 'Converting')
        if (r) setOut(r)
      }} />
      <Results files={out} onReset={() => { setOut([]); setFiles([]) }} />
    </div>
  )
}

/* ----------------------------------------------------------------- HTML */

export function HtmlToPdf() {
  const [src, setSrc] = useState<'code' | 'file'>('code')
  const [code, setCode] = useState('<h1>Hello</h1>\n<p>Write or paste <strong>HTML</strong> here. Tables, lists, links and images (data: URLs) are supported.</p>')
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'text' | 'visual'>('text')
  const [size, setSize] = useState<PageSizeName>('A4')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="HTML source">
        <div className="space-y-4">
          <Segmented value={src} onChange={setSrc} options={[['code', 'Paste code'], ['file', 'Upload .html file']]} />
          {src === 'code' ? <TextArea label="HTML" value={code} onChange={setCode} rows={12} mono /> : <SingleFile accept=".html,.htm,text/html" file={file} setFile={setFile} label="Choose HTML file" />}
        </div>
      </Panel>
      <Panel title="Output">
        <div className="space-y-4">
          <Segmented value={mode} onChange={setMode} options={[['text', 'Selectable text (reflowed)'], ['visual', 'Exact look (snapshot)']]} />
          {mode === 'text' && <Select label="Page size" value={size} onChange={setSize} options={SIZES} />}
          <Note>Scripts, styles from other sites and remote images are never loaded – the HTML is sanitised and rendered offline.</Note>
        </div>
      </Panel>
      <RunBar task={task} label="Convert to PDF" disabled={src === 'code' ? !code.trim() : !file} onRun={async () => {
        const r = await task.run(async () => {
          const html = src === 'code' ? code : await file!.text()
          const title = src === 'file' ? baseName(file!.name) : 'document'
          return { name: `${title}.pdf`, blob: mode === 'text' ? await htmlToPdfBlob(html, { pageSize: size, title }) : await htmlToPdfVisual(html) }
        }, 'Converting')
        if (r) setOut([r])
      }} />
      <Results files={out} onReset={() => setOut([])} />
    </div>
  )
}

/* ------------------------------------------------------------- Markdown */

const MD_SAMPLE = `# Project notes

Write **Markdown** on the left and see it on the right.

## Features
- Headings, *emphasis*, \`code\` and [links](https://example.com)
- [x] Task lists
- Tables:

| Item | Qty | Price |
|------|----:|------:|
| Pens | 10 | ₹50 |
| Paper | 2 | ₹300 |

> Quotes and code blocks work too.

\`\`\`
const total = items.reduce((s, i) => s + i.price, 0)
\`\`\`
`

export function MarkdownToPdf() {
  const [md, setMd] = useState(MD_SAMPLE)
  const [size, setSize] = useState<PageSizeName>('A4')
  const [mode, setMode] = useState<'text' | 'visual'>('text')
  const [title, setTitle] = useState('document')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const html = useMemo(() => markdownToHtml(md), [md])
  const safeHtml = useMemo(() => (typeof window === 'undefined' ? '' : DOMPurify.sanitize(html)), [html])
  return (
    <div className="space-y-6">
      <Panel title="Markdown" actions={<label className="cursor-pointer text-sm font-medium text-primary hover:underline">Open .md file<input type="file" className="sr-only" accept=".md,.markdown,.txt,text/markdown" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setMd(await f.text()); setTitle(baseName(f.name)) } }} /></label>}>
        <div className="grid gap-4 lg:grid-cols-2">
          <textarea aria-label="Markdown source" className="min-h-96 w-full rounded-lg border bg-background p-3 font-mono text-sm" value={md} onChange={(e) => setMd(e.target.value)} />
          <article className="prose-preview min-h-96 overflow-auto rounded-lg border bg-white p-6 text-sm text-neutral-900 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-600 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-neutral-100 [&_pre]:p-3 [&_table]:my-3 [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:bg-neutral-100 [&_th]:px-2 [&_ul]:list-disc [&_a]:text-blue-700 [&_a]:underline" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </div>
      </Panel>
      <Panel title="Output">
        <Grid cols={3}>
          <TextInput label="File name" value={title} onChange={setTitle} />
          <Select label="Page size" value={size} onChange={setSize} options={SIZES} />
          <Select label="Rendering" value={mode} onChange={setMode} options={[['text', 'Typeset (selectable text)'], ['visual', 'Exactly like the preview']]} />
        </Grid>
      </Panel>
      <RunBar task={task} label="Export PDF" disabled={!md.trim()} onRun={async () => {
        const r = await task.run(async () => ({ name: `${title || 'document'}.pdf`, blob: mode === 'text' ? await htmlToPdfBlob(html, { pageSize: size, title }) : await htmlToPdfVisual(`<style>table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}pre{background:#f4f4f5;padding:12px;border-radius:6px}blockquote{border-left:4px solid #ddd;margin:0;padding-left:12px;color:#555}</style>${html}`) }), 'Typesetting')
        if (r) setOut([r])
      }} />
      <Results files={out} onReset={() => setOut([])} />
    </div>
  )
}

/* ------------------------------------------------------------- CSV ↔ PDF */

export function CsvPdf() {
  const [dir, setDir] = useState<'to-pdf' | 'to-csv'>('to-pdf')
  const [file, setFile] = useState<File | null>(null)
  const [header, setHeader] = useState(true)
  const [size, setSize] = useState<PageSizeName>('A4')
  const [fontSize, setFontSize] = useState(9)
  const [preview, setPreview] = useState<string[][] | null>(null)
  const pdf = usePdfInput()
  const [onlyTables, setOnlyTables] = useState(true)
  const [perPage, setPerPage] = useState(false)
  const [sep, setSep] = useState<',' | ';' | '\t'>(',')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Segmented value={dir} onChange={(d) => { setDir(d); setOut([]) }} options={[['to-pdf', 'CSV → PDF'], ['to-csv', 'PDF → CSV']]} />
      {dir === 'to-pdf' ? (
        <>
          <Panel title="CSV file"><SingleFile accept=".csv,.tsv,.txt,text/csv" file={file} setFile={async (f) => { setFile(f); setPreview(f ? parseCsv(await f.text()).slice(0, 8) : null) }} label="Choose CSV" /></Panel>
          {preview && (
            <Panel title="Preview (first rows)">
              <div className="overflow-auto"><table className="w-full text-left text-xs"><tbody>{preview.map((r, i) => <tr key={i} className={i === 0 && header ? 'bg-muted font-semibold' : 'border-t'}>{r.map((c, k) => <td key={k} className="px-2 py-1">{c}</td>)}</tr>)}</tbody></table></div>
            </Panel>
          )}
          <Panel title="Format">
            <Grid cols={3}>
              <Select label="Page size" value={size} onChange={setSize} options={SIZES} />
              <NumberInput label="Font size" value={fontSize} min={5} max={16} suffix="pt" onChange={setFontSize} />
              <Toggle label="First row is a header" checked={header} onChange={setHeader} />
            </Grid>
          </Panel>
          <RunBar task={task} label="Create PDF" disabled={!file} onRun={async () => {
            const r = await task.run(async () => {
              const rows = parseCsv(await file!.text())
              if (!rows.length) throw new Error('The CSV is empty.')
              const width = Math.max(...rows.map((x) => x.length))
              const blocks = []
              for (let c0 = 0; c0 < width; c0 += 8) blocks.push({ type: 'table' as const, header, rows: rows.map((row) => Array.from({ length: Math.min(8, width - c0) }, (_, k) => [{ text: row[c0 + k] ?? '' }])) })
              return blocksToPdfBlob(blocks, { pageSize: size, fontSize, margin: 32, title: baseName(file!.name) })
            }, 'Building table')
            if (r) setOut([{ name: `${baseName(file!.name)}.pdf`, blob: r }])
          }} />
        </>
      ) : (
        <>
          <Panel title="PDF with tables"><PdfPicker pdf={pdf} /></Panel>
          <Panel title="Extraction">
            <Grid cols={3}>
              <Toggle label="Only table-like rows" hint="Skip headings and paragraphs" checked={onlyTables} onChange={setOnlyTables} />
              <Toggle label="One CSV per page" checked={perPage} onChange={setPerPage} />
              <Select label="Separator" value={sep} onChange={setSep} options={[[',', 'Comma (,)'], [';', 'Semicolon (;) – Excel in Europe'], ['\t', 'Tab']]} />
            </Grid>
          </Panel>
          <RunBar task={task} label="Extract to CSV" disabled={!pdf.input} onRun={async () => {
            const r = await task.run(async (p) => {
              const tables = await extractTables(pdf.input!.bytes, { numbers: false, onlyTables, onProgress: p })
              const name = baseName(pdf.input!.file.name)
              const bom = '﻿'
              if (perPage) return tables.filter((t) => t.rows.length).map((t) => ({ name: `${name}-page${t.page}.csv`, blob: new Blob([bom + toCsv(t.rows, sep)], { type: 'text/csv' }) }))
              const rows = tables.flatMap((t) => t.rows)
              if (!rows.length) throw new Error('No table text was found. If this is a scan, run OCR first.')
              return [{ name: `${name}.csv`, blob: new Blob([bom + toCsv(rows, sep)], { type: 'text/csv' }) }]
            }, 'Detecting tables')
            if (r) setOut(r)
          }} />
        </>
      )}
      <Results files={out} onReset={() => { setOut([]); setFile(null); pdf.reset() }} />
    </div>
  )
}

/* ---------------------------------------------------------------- eBook */

export function EbookToPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [size, setSize] = useState<PageSizeName>('A4')
  const [info, setInfo] = useState<string>('')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="eBook"><SingleFile accept=".epub,.txt,.html,.htm,.xhtml,application/epub+zip,text/plain,text/html" file={file} setFile={setFile} label="Choose EPUB, TXT or HTML" /></Panel>
      <Panel title="Typesetting">
        <Select label="Page size" value={size} onChange={setSize} options={SIZES} />
        <p className="mt-3 text-xs text-muted-foreground">Chapters start on a new page; headings, emphasis, lists, tables and embedded images are kept. DRM-protected books can’t be converted.</p>
      </Panel>
      <RunBar task={task} label="Convert to PDF" disabled={!file} onRun={async () => {
        const r = await task.run(async () => {
          let html: string
          let title = baseName(file!.name)
          if (/\.epub$/i.test(file!.name) || file!.type === 'application/epub+zip') {
            const res = await epubToHtml(file!)
            html = res.html
            title = res.title
            setInfo(`${res.title}${res.author ? ` by ${res.author}` : ''} · ${res.chapters} sections`)
          } else if (/\.(html?|xhtml)$/i.test(file!.name)) html = await file!.text()
          else html = textBookToHtml(await file!.text(), title)
          return { name: `${title.replace(/[\\/:*?"<>|]+/g, '')}.pdf`, blob: await htmlToPdfBlob(html, { pageSize: size, title }) }
        }, 'Typesetting')
        if (r) setOut([r])
      }} />
      <Results files={out} summary={info && <p className="text-muted-foreground">{info}</p>} onReset={() => { setOut([]); setFile(null); setInfo('') }} />
    </div>
  )
}

