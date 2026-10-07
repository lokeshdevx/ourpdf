'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { RotateCcw, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { COMPRESS_LEVELS, compressBytes, type CompressLevel } from '@/tools/lib/compress'
import {
  alternatePdfs, autoTrim, bookmarkGroups, cropMargins, flipPdf, mergePdfs, nUp, readOutline, resizePages, rotatePages, splitByGroups, splitBySize, splitByText, splitPagesInHalf, type OutlineEntry, type SheetSize,
} from '@/tools/lib/pages'
import { baseName, closePdf, formatBytes, loadDoc, openPdfjs, parseRangeGroups, parseRanges, zipFiles } from '@/tools/lib/pdf'
import { FileDrop, FileOrderList, Grid, NumberInput, Note, Panel, PdfPicker, Results, RunBar, Segmented, Select, TextInput, Thumbs, Toggle, pdfOut, usePdfInput, useTask, type OutFile } from '../kit'

const PDF_ACCEPT = 'application/pdf,.pdf'
const onlyPdf = (files: File[]) => files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))

/* ---------------------------------------------------------------- merge */

export function Merge() {
  const [files, setFiles] = useState<File[]>([])
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDFs to merge" actions={files.length > 1 && <Button variant="ghost" size="sm" onClick={() => setFiles([...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))}>Sort by name</Button>}>
        <div className="space-y-4">
          {files.length > 0 && <FileOrderList files={files} onChange={setFiles} />}
          <FileDrop accept={PDF_ACCEPT} multiple compact={files.length > 0} label={files.length ? 'Add more PDFs' : 'Choose PDFs'} onFiles={(f) => setFiles([...files, ...onlyPdf(f)])} />
          <p className="text-xs text-muted-foreground">Drag the rows or use the arrows to set the order.</p>
        </div>
      </Panel>
      <RunBar task={task} label={`Merge ${files.length || ''} PDFs`} disabled={files.length < 2} onRun={async () => {
        const r = await task.run(async (p) => mergePdfs(await Promise.all(files.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()) }))), p), 'Merging')
        if (r) setOut([pdfOut(r, 'merged.pdf')])
      }} />
      <Results files={out} onReset={() => { setOut([]); setFiles([]) }} />
    </div>
  )
}

/* ------------------------------------------------------------- alternate */

export function Alternate() {
  const [files, setFiles] = useState<File[]>([])
  const [reverse, setReverse] = useState<boolean[]>([])
  const [chunk, setChunk] = useState(1)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDFs to interleave">
        <div className="space-y-4">
          {files.length > 0 && <FileOrderList files={files} onChange={(f) => { setFiles(f); setReverse(f.map(() => false)) }} render={(_, i) => (
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!reverse[i]} onChange={(e) => setReverse(reverse.map((v, k) => (k === i ? e.target.checked : v)))} /> reverse order</label>
          )} />}
          <FileDrop accept={PDF_ACCEPT} multiple compact={files.length > 0} label={files.length ? 'Add more PDFs' : 'Choose 2 or more PDFs'} onFiles={(f) => { const next = [...files, ...onlyPdf(f)]; setFiles(next); setReverse([...reverse, ...onlyPdf(f).map(() => false)]) }} />
        </div>
      </Panel>
      <Panel title="Options">
        <Grid>
          <NumberInput label="Pages taken from each file per turn" value={chunk} min={1} max={50} onChange={setChunk} />
        </Grid>
        <div className="mt-4"><Note>Scanned a double-sided document as two stacks? Put the fronts first and the backs second, and tick <strong>reverse order</strong> on the backs – the pages come out in the right sequence.</Note></div>
      </Panel>
      <RunBar task={task} label="Mix pages" disabled={files.length < 2} onRun={async () => {
        const r = await task.run(async () => alternatePdfs(await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer()))), { chunk: Math.max(1, chunk || 1), reverse }), 'Interleaving')
        if (r) setOut([pdfOut(r, 'mixed.pdf')])
      }} />
      <Results files={out} onReset={() => { setOut([]); setFiles([]) }} />
    </div>
  )
}

/* -------------------------------------------------------------- compress */

export function Compress() {
  const pdf = usePdfInput()
  const [level, setLevel] = useState<CompressLevel>('recommended')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const before = pdf.input?.bytes.length ?? 0
  const after = out[0]?.blob.size ?? 0
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Compression level">
        <Segmented value={level} onChange={setLevel} options={COMPRESS_LEVELS} />
        <p className="mt-3 text-xs text-muted-foreground">{level === 'scan' ? 'Every page is re-rendered as an image (text stays searchable). Best for scans and photos; vector text becomes slightly less sharp.' : level === 'extreme' ? 'Images are downsampled to 96 dpi and saved at lower JPEG quality. Metadata is removed.' : level === 'low' ? 'Only oversized images are touched – visually lossless.' : 'Images downsampled to 150 dpi at good quality – the best balance for sharing.'}</p>
      </Panel>
      <RunBar task={task} label="Compress PDF" disabled={!pdf.input} onRun={async () => {
        const r = await task.run((p) => compressBytes(pdf.input!.bytes, level, p), 'Compressing')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-compressed.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} summary={after > 0 && (after < before
        ? <Note tone="ok">{formatBytes(before)} → <strong>{formatBytes(after)}</strong> ({Math.round((1 - after / before) * 100)}% smaller)</Note>
        : <Note tone="warn">This PDF is already well optimised – it could not be made smaller at this level. Try “Maximum”.</Note>)} />
    </div>
  )
}

/* ----------------------------------------------------------------- split */

type SplitMode = 'ranges' | 'every' | 'single' | 'extract'

export function Split() {
  const pdf = usePdfInput()
  const [mode, setMode] = useState<SplitMode>('ranges')
  const [ranges, setRanges] = useState('1-3, 4-6')
  const [every, setEvery] = useState(2)
  const [extract, setExtract] = useState('1, 3-4')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="How to split">
        <div className="space-y-4">
          <Segmented value={mode} onChange={setMode} options={[['ranges', 'By ranges'], ['every', 'Every N pages'], ['single', 'Every page'], ['extract', 'Extract pages']]} />
          {mode === 'ranges' && <TextInput label="Ranges (one file each)" value={ranges} onChange={setRanges} hint="Comma-separated, e.g. 1-3, 4-6, 7-  (an open end means “to the last page”)." />}
          {mode === 'every' && <NumberInput label="Pages per file" value={every} min={1} onChange={setEvery} />}
          {mode === 'extract' && <TextInput label="Pages to extract into one file" value={extract} onChange={setExtract} hint="e.g. 1, 3-5, odd, even" />}
        </div>
      </Panel>
      {pdf.input && pdf.input.pages <= 300 && <Panel title="Pages"><Thumbs bytes={pdf.input.bytes} max={36} /></Panel>}
      <RunBar task={task} label="Split PDF" disabled={!pdf.input} onRun={async () => {
        const inp = pdf.input!
        const name = baseName(inp.file.name)
        const r = await task.run(async () => {
          let groups: number[][]
          if (mode === 'ranges') groups = parseRangeGroups(ranges, inp.pages)
          else if (mode === 'every') groups = Array.from({ length: Math.ceil(inp.pages / Math.max(1, every)) }, (_, i) => Array.from({ length: Math.min(every, inp.pages - i * every) }, (_, k) => i * every + k))
          else if (mode === 'single') groups = Array.from({ length: inp.pages }, (_, i) => [i])
          else groups = [parseRanges(extract, inp.pages)]
          if (!groups.length) throw new Error('Enter at least one page range.')
          const label = (_: number, g: number[]) => `${name}-${g.length === 1 ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[g.length - 1] + 1}`}.pdf`
          return splitByGroups(inp.bytes, groups, label)
        }, 'Splitting')
        if (r) setOut(r.map((p) => pdfOut(p.bytes, p.name, `${p.pages} page${p.pages === 1 ? '' : 's'}`)))
      }} />
      <Results files={out} zipName={`${pdf.input ? baseName(pdf.input.file.name) : 'split'}-split.zip`} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* --------------------------------------------------------- split by text */

export function SplitByText() {
  const pdf = usePdfInput()
  const [phrase, setPhrase] = useState('Invoice No')
  const [cs, setCs] = useState(false)
  const [after, setAfter] = useState(false)
  const [nameFromMatch, setNameFromMatch] = useState(true)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Split rule">
        <div className="space-y-4">
          <TextInput label="Phrase that marks a new document" value={phrase} onChange={setPhrase} hint="Every page containing this text starts a new file – e.g. “Invoice No”, “Page 1 of”, “Employee ID”." />
          <Grid>
            <Toggle label="Match case" checked={cs} onChange={setCs} />
            <Toggle label="Split after the matching page" hint="The match ends a document instead of starting one" checked={after} onChange={setAfter} />
            <Toggle label="Name files after the matching line" checked={nameFromMatch} onChange={setNameFromMatch} />
          </Grid>
          <Note>Works on the PDF’s text layer. For scans, run <Link className="underline" href="/editor?tool=ocr">OCR</Link> first.</Note>
        </div>
      </Panel>
      <RunBar task={task} label="Find & split" disabled={!pdf.input || !phrase.trim()} onRun={async () => {
        const inp = pdf.input!
        const name = baseName(inp.file.name)
        const r = await task.run(async (p) => {
          const res = await splitByText(inp.bytes, phrase, { caseSensitive: cs, splitAfter: after, onProgress: (f) => p(f * 0.5, 'Searching pages') })
          if (res.groups.length <= 1) throw new Error(`“${phrase}” was not found on any page after the first, so there is nothing to split.`)
          const titles = after ? [] : res.titles
          const offset = res.starts[0] === 0 && !after && res.titles.length < res.groups.length ? 1 : 0
          return splitByGroups(inp.bytes, res.groups, (i, g) => {
            const t = nameFromMatch ? titles[i - offset]?.replace(/[\\/:*?"<>|]+/g, '').trim() : ''
            return `${String(i + 1).padStart(2, '0')} ${t || `${name} p${g[0] + 1}-${g[g.length - 1] + 1}`}.pdf`
          })
        }, 'Splitting')
        if (r) setOut(r.map((x) => pdfOut(x.bytes, x.name, `${x.pages} page${x.pages === 1 ? '' : 's'}`)))
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ---------------------------------------------------- split by bookmarks */

export function SplitByBookmarks() {
  const pdf = usePdfInput()
  const [outline, setOutline] = useState<OutlineEntry[] | null>(null)
  const [level, setLevel] = useState(1)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const maxLevel = outline?.length ? Math.max(...outline.map((o) => o.level)) : 1
  const groups = useMemo(() => (outline && pdf.input ? bookmarkGroups(outline, level, pdf.input.pages) : []), [outline, level, pdf.input])
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, open: async (f, pw) => { setOutline(null); await pdf.open(f, pw) } }} /></Panel>
      {pdf.input && !outline && (
        <Button onClick={async () => {
          const r = await task.run(async () => {
            const doc = await openPdfjs(pdf.input!.bytes)
            const o = await readOutline(doc)
            await closePdf(doc)
            return o
          }, 'Reading bookmarks')
          if (r) setOutline(r)
        }}>Read bookmarks</Button>
      )}
      {outline && !outline.length && <Note tone="warn">This PDF has no bookmarks. Use Split by Text or Split PDF instead.</Note>}
      {outline && outline.length > 0 && (
        <Panel title={`${groups.length} sections`}>
          <div className="space-y-4">
            {maxLevel > 1 && <Segmented label="Bookmark level" value={level} onChange={setLevel} options={Array.from({ length: Math.min(4, maxLevel) }, (_, i) => [i + 1, i === 0 ? 'Top level (chapters)' : `Level ${i + 1}`] as const)} />}
            <ol className="max-h-80 space-y-1 overflow-auto text-sm">{groups.map((g, i) => (<li key={i} className="flex justify-between gap-3 rounded-lg px-2 py-1 odd:bg-muted/50"><span className="truncate">{i + 1}. {g.title}</span><span className="shrink-0 text-muted-foreground">p{g.pages[0] + 1}–{g.pages[g.pages.length - 1] + 1}</span></li>))}</ol>
          </div>
        </Panel>
      )}
      <RunBar task={task} label="Split by bookmarks" disabled={!groups.length} onRun={async () => {
        const r = await task.run(() => splitByGroups(pdf.input!.bytes, groups.map((g) => g.pages), (i) => `${String(i + 1).padStart(2, '0')} ${groups[i].title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80)}.pdf`), 'Splitting')
        if (r) setOut(r.map((x) => pdfOut(x.bytes, x.name, `${x.pages} pages`)))
      }} />
      <Results files={out} onReset={() => { setOut([]); setOutline(null); pdf.reset() }} />
    </div>
  )
}

/* ----------------------------------------------------------- split half */

export function SplitHalf() {
  const pdf = usePdfInput()
  const [mode, setMode] = useState<'document' | 'pages'>('pages')
  const [dir, setDir] = useState<'vertical' | 'horizontal'>('vertical')
  const [rtl, setRtl] = useState(false)
  const [skipFirst, setSkipFirst] = useState(false)
  const [skipLast, setSkipLast] = useState(false)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="What to cut">
        <div className="space-y-4">
          <Segmented value={mode} onChange={setMode} options={[['pages', 'Slice every page in half (book scans)'], ['document', 'Cut the document into two files']]} />
          {mode === 'pages' && (
            <Grid>
              <Segmented label="Cut" value={dir} onChange={setDir} options={[['vertical', 'Down the middle (left | right)'], ['horizontal', 'Across (top / bottom)']]} />
              <div className="space-y-3">
                <Toggle label="Right half first" hint="For right-to-left books (Arabic, Hebrew, manga)" checked={rtl} onChange={setRtl} />
                <Toggle label="Keep the first page whole" hint="Front covers are usually a single page" checked={skipFirst} onChange={setSkipFirst} />
                <Toggle label="Keep the last page whole" checked={skipLast} onChange={setSkipLast} />
              </div>
            </Grid>
          )}
          {mode === 'document' && pdf.input && <p className="text-sm text-muted-foreground">Part 1: pages 1–{Math.ceil(pdf.input.pages / 2)} · Part 2: pages {Math.ceil(pdf.input.pages / 2) + 1}–{pdf.input.pages}</p>}
        </div>
      </Panel>
      <RunBar task={task} label="Split in half" disabled={!pdf.input || (mode === 'document' && pdf.input.pages < 2)} onRun={async () => {
        const inp = pdf.input!
        const name = baseName(inp.file.name)
        const r = await task.run(async () => {
          if (mode === 'pages') return [pdfOut(await splitPagesInHalf(inp.bytes, { direction: dir, rtl, skipFirst, skipLast }), `${name}-halves.pdf`)]
          const mid = Math.ceil(inp.pages / 2)
          const parts = await splitByGroups(inp.bytes, [Array.from({ length: mid }, (_, i) => i), Array.from({ length: inp.pages - mid }, (_, i) => mid + i)], (i) => `${name}-part${i + 1}.pdf`)
          return parts.map((p) => pdfOut(p.bytes, p.name, `${p.pages} pages`))
        }, 'Splitting')
        if (r) setOut(r)
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ----------------------------------------------------------- split size */

export function SplitBySize({ presetMb, compressFirst: compressDefault = false }: { presetMb?: number; compressFirst?: boolean }) {
  const pdf = usePdfInput()
  const [mb, setMb] = useState(presetMb ?? 5)
  const [compress, setCompress] = useState(compressDefault)
  const [out, setOut] = useState<OutFile[]>([])
  const [warn, setWarn] = useState<string | null>(null)
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Size limit">
        <Grid>
          <NumberInput label="Maximum size of each part" value={mb} min={0.1} step={0.1} suffix="MB" onChange={setMb} hint="Common limits: email 10–25 MB, many upload portals 2–5 MB." />
          <Toggle label="Compress first" hint="Fewer, smaller parts" checked={compress} onChange={setCompress} />
        </Grid>
      </Panel>
      <RunBar task={task} label="Split by size" disabled={!pdf.input || !(mb > 0)} onRun={async () => {
        const inp = pdf.input!
        const name = baseName(inp.file.name)
        setWarn(null)
        const r = await task.run(async (p) => {
          const src = compress ? await compressBytes(inp.bytes, 'recommended', (f) => p(f * 0.4, 'Compressing')) : inp.bytes
          const limit = Math.floor(mb * 1024 * 1024)
          if (src.length <= limit) return { parts: [{ name: '', bytes: src, pages: inp.pages }], oversized: [] }
          return splitBySize(src, limit, (f) => p((compress ? 0.4 : 0) + f * (compress ? 0.6 : 1), 'Splitting'))
        }, 'Working')
        if (!r) return
        if (r.oversized.length) setWarn(`Page${r.oversized.length > 1 ? 's' : ''} ${r.oversized.map((i) => i + 1).join(', ')} ${r.oversized.length > 1 ? 'are' : 'is'} larger than the limit on ${r.oversized.length > 1 ? 'their' : 'its'} own. Try “Compress first”.`)
        let start = 1
        setOut(r.parts.map((x, i) => {
          const o = pdfOut(x.bytes, r.parts.length === 1 ? `${name}.pdf` : `${name}-part${i + 1}.pdf`, `pages ${start}–${start + x.pages - 1}`)
          start += x.pages
          return o
        }))
      }} />
      {warn && <Note tone="warn">{warn}</Note>}
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ---------------------------------------------------------------- rotate */

export function Rotate() {
  const pdf = usePdfInput()
  const [rot, setRot] = useState<Record<number, number>>({})
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const apply = (d: number) => {
    const n = pdf.input?.pages ?? 0
    const targets = sel.size ? [...sel] : Array.from({ length: n }, (_, i) => i)
    const next = { ...rot }
    for (const i of targets) next[i] = ((next[i] ?? 0) + d + 360) % 360
    setRot(next)
  }
  const changed = Object.values(rot).some((v) => v % 360)
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setRot({}); setSel(new Set()); pdf.reset() } }} /></Panel>
      {pdf.input && (
        <Panel title={sel.size ? `${sel.size} page${sel.size === 1 ? '' : 's'} selected` : 'All pages (click pages to pick some)'} actions={<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => apply(-90)}><RotateCcw className="mr-1.5 size-4" aria-hidden /> Left</Button><Button variant="outline" size="sm" onClick={() => apply(90)}><RotateCw className="mr-1.5 size-4" aria-hidden /> Right</Button><Button variant="outline" size="sm" onClick={() => apply(180)}>180°</Button>{sel.size > 0 && <Button variant="ghost" size="sm" onClick={() => setSel(new Set())}>Clear selection</Button>}</div>}>
          <Thumbs bytes={pdf.input.bytes} max={120} selected={sel} rotation={(i) => rot[i] ?? 0} onToggle={(i) => { const n = new Set(sel); if (n.has(i)) n.delete(i); else n.add(i); setSel(n) }} />
        </Panel>
      )}
      <RunBar task={task} label="Apply rotation" disabled={!pdf.input || !changed} onRun={async () => {
        const r = await task.run(async () => {
          let bytes = pdf.input!.bytes
          for (const angle of [90, 180, 270]) {
            const idx = Object.entries(rot).filter(([, v]) => v === angle).map(([k]) => Number(k))
            if (idx.length) bytes = await rotatePages(bytes, idx, angle)
          }
          return bytes
        }, 'Rotating')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-rotated.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); setRot({}); pdf.reset() }} />
    </div>
  )
}

/* ------------------------------------------------------------------ flip */

export function Flip() {
  const pdf = usePdfInput()
  const [mode, setMode] = useState<'horizontal' | 'vertical' | 'both'>('horizontal')
  const [pages, setPages] = useState('')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Mirror">
        <div className="space-y-4">
          <Segmented value={mode} onChange={setMode} options={[['horizontal', 'Horizontally (left ↔ right)'], ['vertical', 'Vertically (top ↕ bottom)'], ['both', 'Both']]} />
          <TextInput label="Pages (blank = all)" value={pages} onChange={setPages} placeholder="e.g. 1-3, 5" />
          <Note>Useful for iron-on transfers, T-shirt prints, light-box tracing and back-to-front scans.</Note>
        </div>
      </Panel>
      <RunBar task={task} label="Flip PDF" disabled={!pdf.input} onRun={async () => {
        const r = await task.run(async () => flipPdf(pdf.input!.bytes, mode, pages.trim() ? parseRanges(pages, pdf.input!.pages) : undefined), 'Flipping')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-flipped.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ------------------------------------------------------------------ n-up */

export function PagesPerSheet() {
  const pdf = usePdfInput()
  const [per, setPer] = useState(4)
  const [sheet, setSheet] = useState<SheetSize>('A4')
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto')
  const [border, setBorder] = useState(true)
  const [order, setOrder] = useState<'rows' | 'columns'>('rows')
  const [margin, setMargin] = useState(18)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Layout">
        <div className="space-y-4">
          <Segmented label="Pages per sheet" value={per} onChange={setPer} options={[[2, '2'], [4, '4'], [6, '6'], [8, '8'], [9, '9'], [16, '16']]} />
          <Grid cols={3}>
            <Select label="Sheet size" value={sheet} onChange={setSheet} options={[['A4', 'A4'], ['Letter', 'Letter'], ['A3', 'A3'], ['Legal', 'Legal'], ['source', 'Same as the PDF']]} />
            <Select label="Orientation" value={orientation} onChange={setOrientation} options={[['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]} />
            <Select label="Order" value={order} onChange={setOrder} options={[['rows', 'Left to right, then down'], ['columns', 'Top to bottom, then across']]} />
            <NumberInput label="Margin" value={margin} min={0} max={72} suffix="pt" onChange={setMargin} />
          </Grid>
          <Toggle label="Draw a thin border around each page" checked={border} onChange={setBorder} />
          {pdf.input && <p className="text-sm text-muted-foreground">{pdf.input.pages} pages → {Math.ceil(pdf.input.pages / per)} sheet{Math.ceil(pdf.input.pages / per) === 1 ? '' : 's'}</p>}
        </div>
      </Panel>
      <RunBar task={task} label="Create sheets" disabled={!pdf.input} onRun={async () => {
        const r = await task.run(() => nUp(pdf.input!.bytes, { perSheet: per, sheet, orientation, margin: margin || 0, gap: Math.max(4, (margin || 0) / 2), border, order }), 'Arranging')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-${per}up.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ---------------------------------------------------------- crop & resize */

export function CropResize() {
  const pdf = usePdfInput()
  const [mode, setMode] = useState<'margins' | 'auto' | 'resize'>('margins')
  const [m, setM] = useState({ top: 10, right: 10, bottom: 10, left: 10 })
  const [pad, setPad] = useState(6)
  const [size, setSize] = useState<'A4' | 'Letter' | 'A3' | 'Legal' | 'A5'>('A4')
  const [resizeMargin, setResizeMargin] = useState(0)
  const [pages, setPages] = useState('')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const MM = 72 / 25.4
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Mode">
        <div className="space-y-4">
          <Segmented value={mode} onChange={setMode} options={[['margins', 'Crop margins'], ['auto', 'Auto-trim white space'], ['resize', 'Resize to paper size']]} />
          {mode === 'margins' && (
            <>
              <Grid cols={4}>
                {(['top', 'right', 'bottom', 'left'] as const).map((k) => <NumberInput key={k} label={k[0].toUpperCase() + k.slice(1)} value={m[k]} min={0} suffix="mm" onChange={(v) => setM({ ...m, [k]: v })} />)}
              </Grid>
              <TextInput label="Pages (blank = all)" value={pages} onChange={setPages} placeholder="e.g. 2-10" />
            </>
          )}
          {mode === 'auto' && <NumberInput label="Padding to keep around the content" value={pad} min={0} max={72} suffix="pt" onChange={setPad} />}
          {mode === 'resize' && (
            <Grid>
              <Select label="Paper size" value={size} onChange={setSize} options={[['A4', 'A4 (210 × 297 mm)'], ['Letter', 'US Letter (8.5 × 11 in)'], ['Legal', 'US Legal (8.5 × 14 in)'], ['A3', 'A3 (297 × 420 mm)'], ['A5', 'A5 (148 × 210 mm)']]} />
              <NumberInput label="Margin" value={resizeMargin} min={0} max={100} suffix="mm" onChange={setResizeMargin} hint="Content is scaled to fit and centred; landscape pages stay landscape." />
            </Grid>
          )}
          {mode !== 'resize' && <Note>Cropping hides the trimmed area (like Acrobat’s crop tool). To permanently remove what is underneath, use Redact.</Note>}
          <p className="text-xs text-muted-foreground">Need to draw the crop box by hand? Use the <Link className="underline" href="/editor?tool=crop">visual crop tool</Link> in the editor.</p>
        </div>
      </Panel>
      <RunBar task={task} label={mode === 'resize' ? 'Resize pages' : 'Crop pages'} disabled={!pdf.input} onRun={async () => {
        const inp = pdf.input!
        const r = await task.run(async (p) => {
          if (mode === 'margins') return cropMargins(inp.bytes, { top: m.top * MM, right: m.right * MM, bottom: m.bottom * MM, left: m.left * MM }, pages.trim() ? parseRanges(pages, inp.pages) : undefined)
          if (mode === 'auto') return autoTrim(inp.bytes, pad, (f) => p(f, 'Measuring content'))
          return resizePages(inp.bytes, size, resizeMargin * MM)
        }, 'Processing')
        if (r) setOut([pdfOut(r, `${baseName(inp.file.name)}-${mode === 'resize' ? size : 'cropped'}.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ------------------------------------------------------------- PDF → ZIP */

export function PdfToZip() {
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('documents')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const total = files.reduce((s, f) => s + f.size, 0)
  return (
    <div className="space-y-6">
      <Panel title="PDFs to bundle">
        <div className="space-y-4">
          {files.length > 0 && <FileOrderList files={files} onChange={setFiles} />}
          <FileDrop accept={PDF_ACCEPT} multiple compact={files.length > 0} label={files.length ? 'Add more PDFs' : 'Choose PDFs'} onFiles={(f) => setFiles([...files, ...onlyPdf(f)])} />
          {files.length > 0 && <p className="text-sm text-muted-foreground">{files.length} files · {formatBytes(total)}</p>}
        </div>
      </Panel>
      <Panel title="Archive"><TextInput label="ZIP file name" value={name} onChange={setName} /></Panel>
      <RunBar task={task} label="Create ZIP" disabled={!files.length} onRun={async () => {
        const r = await task.run(async () => {
          // validate each file is a readable PDF before archiving
          for (const f of files) await loadDoc(new Uint8Array(await f.arrayBuffer())).catch((e) => { if (!/password/i.test(String(e))) throw new Error(`${f.name}: ${(e as Error).message}`) })
          return zipFiles(files.map((f) => ({ name: f.name, data: f })))
        }, 'Compressing')
        if (r) setOut([{ name: `${name.trim() || 'documents'}.zip`, blob: r, note: `${files.length} PDFs, ${Math.max(0, Math.round((1 - r.size / total) * 100))}% smaller` }])
      }} />
      <Results files={out} onReset={() => { setOut([]); setFiles([]) }} />
    </div>
  )
}
