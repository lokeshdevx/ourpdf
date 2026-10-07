'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib'
import { Button } from '@/components/ui/button'
import { addHeaderFooter, addPageNumbers, addWatermark, batesNumber, POSITIONS, type Position } from '@/tools/lib/stamp'
import { invertColours, type ColourMode } from '@/tools/lib/raster'
import { flattenPdf } from '@/tools/lib/security'
import { baseName, loadDoc, parseRanges, saveDoc } from '@/tools/lib/pdf'
import { hexToRgb } from '@/utils/color'
import { ColorInput, FileDrop, FileOrderList, Grid, NumberInput, Note, Panel, PdfPicker, Range, Results, RunBar, Segmented, Select, TextInput, Toggle, pdfOut, usePdfInput, useTask, type OutFile } from '../kit'

const POS_LABEL: Record<Position, string> = { 'top-left': 'Top left', 'top-center': 'Top centre', 'top-right': 'Top right', 'middle-left': 'Middle left', center: 'Centre', 'middle-right': 'Middle right', 'bottom-left': 'Bottom left', 'bottom-center': 'Bottom centre', 'bottom-right': 'Bottom right' }

function PositionGrid({ value, onChange, allowMiddle = true }: { value: Position; onChange: (p: Position) => void; allowMiddle?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">Position</p>
      <div className="grid w-40 grid-cols-3 gap-1 rounded-xl border bg-muted/40 p-1.5" role="radiogroup" aria-label="Position">
        {POSITIONS.map((p) => {
          const middle = p.startsWith('middle') || p === 'center'
          return (
            <button key={p} type="button" role="radio" aria-checked={value === p} aria-label={POS_LABEL[p]} disabled={!allowMiddle && middle} onClick={() => onChange(p)} className={`h-9 rounded-md border transition disabled:opacity-30 ${value === p ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary'}`}>
              <span className="mx-auto block size-2 rounded-full bg-current" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ watermark */

export function Watermark() {
  const pdf = usePdfInput()
  const [kind, setKind] = useState<'text' | 'image'>('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [image, setImage] = useState<File | null>(null)
  const [size, setSize] = useState(60)
  const [color, setColor] = useState('#d32f2f')
  const [opacity, setOpacity] = useState(0.25)
  const [rotation, setRotation] = useState(45)
  const [position, setPosition] = useState<Position>('center')
  const [tiled, setTiled] = useState(false)
  const [scale, setScale] = useState(0.4)
  const [bold, setBold] = useState(true)
  const [pages, setPages] = useState('')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Watermark">
        <div className="space-y-4">
          <Segmented value={kind} onChange={setKind} options={[['text', 'Text'], ['image', 'Image / logo']]} />
          {kind === 'text' ? (
            <Grid>
              <TextInput label="Text" value={text} onChange={setText} />
              <NumberInput label="Font size" value={size} min={6} max={300} suffix="pt" onChange={setSize} />
              <ColorInput label="Colour" value={color} onChange={setColor} />
              <Toggle label="Bold" checked={bold} onChange={setBold} />
            </Grid>
          ) : (
            <div className="space-y-3">
              {image ? <p className="text-sm">Image: <strong>{image.name}</strong> <Button variant="link" size="sm" onClick={() => setImage(null)}>change</Button></p> : <FileDrop compact accept="image/png,image/jpeg" label="Choose PNG or JPG" onFiles={(f) => setImage(f[0])} />}
              <Range label="Width (share of page width)" value={scale} min={0.05} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setScale} />
            </div>
          )}
          <Grid>
            <Range label="Opacity" value={opacity} min={0.05} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setOpacity} />
            <Range label="Rotation" value={rotation} min={-90} max={90} step={5} format={(v) => `${v}°`} onChange={setRotation} />
          </Grid>
          <div className="flex flex-wrap items-end gap-6">
            {!tiled && <PositionGrid value={position} onChange={setPosition} />}
            <div className="min-w-60 flex-1 space-y-3">
              <Toggle label="Tile across the whole page" checked={tiled} onChange={setTiled} />
              <TextInput label="Pages (blank = all)" value={pages} onChange={setPages} placeholder="e.g. 1, 3-5" />
            </div>
          </div>
        </div>
      </Panel>
      <RunBar task={task} label="Add watermark" disabled={!pdf.input || (kind === 'text' ? !text.trim() : !image)} onRun={async () => {
        const inp = pdf.input!
        const r = await task.run(async () => addWatermark(inp.bytes, {
          kind, text, size, color, opacity, rotation, position, tiled, scale, bold,
          image: image ? { bytes: new Uint8Array(await image.arrayBuffer()), mime: image.type || 'image/png' } : undefined,
          pages: pages.trim() ? parseRanges(pages, inp.pages) : undefined,
        }), 'Watermarking')
        if (r) setOut([pdfOut(r, `${baseName(inp.file.name)}-watermarked.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* --------------------------------------------------------- page numbers */

const NUMBER_FORMATS = [['{n}', '1'], ['Page {n}', 'Page 1'], ['Page {n} of {total}', 'Page 1 of 10'], ['{n} / {total}', '1 / 10'], ['- {n} -', '- 1 -'], ['custom', 'Custom…']] as const

export function PageNumbers() {
  const pdf = usePdfInput()
  const [fmt, setFmt] = useState<string>('Page {n} of {total}')
  const [custom, setCustom] = useState('{file} – {n}')
  const [position, setPosition] = useState<Position>('bottom-center')
  const [start, setStart] = useState(1)
  const [size, setSize] = useState(10)
  const [margin, setMargin] = useState(24)
  const [color, setColor] = useState('#333333')
  const [skipFirst, setSkipFirst] = useState(false)
  const [pages, setPages] = useState('')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Numbering">
        <div className="space-y-4">
          <Grid>
            <Select label="Format" value={fmt} onChange={setFmt} options={NUMBER_FORMATS} />
            {fmt === 'custom' && <TextInput label="Custom format" value={custom} onChange={setCustom} hint="Tokens: {n} page, {total} pages, {file} file name, {date}, {time}" />}
            <NumberInput label="Start at" value={start} min={0} onChange={setStart} />
            <NumberInput label="Font size" value={size} min={5} max={72} suffix="pt" onChange={setSize} />
            <NumberInput label="Distance from edge" value={margin} min={0} max={144} suffix="pt" onChange={setMargin} />
            <ColorInput label="Colour" value={color} onChange={setColor} />
          </Grid>
          <div className="flex flex-wrap items-end gap-6">
            <PositionGrid value={position} onChange={setPosition} allowMiddle={false} />
            <div className="min-w-60 flex-1 space-y-3">
              <Toggle label="Don’t number the first page (cover)" checked={skipFirst} onChange={setSkipFirst} />
              <TextInput label="Only these pages (blank = all)" value={pages} onChange={setPages} placeholder="e.g. 3-20" />
            </div>
          </div>
        </div>
      </Panel>
      <RunBar task={task} label="Add page numbers" disabled={!pdf.input} onRun={async () => {
        const inp = pdf.input!
        const r = await task.run(async () => addPageNumbers(inp.bytes, { template: fmt === 'custom' ? custom : fmt, position, start: Number.isFinite(start) ? start : 1, size, margin, color, skipFirst, pages: pages.trim() ? parseRanges(pages, inp.pages) : undefined }, baseName(inp.file.name)), 'Numbering')
        if (r) setOut([pdfOut(r, `${baseName(inp.file.name)}-numbered.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ---------------------------------------------------------------- Bates */

export function Bates() {
  const [files, setFiles] = useState<File[]>([])
  const [prefix, setPrefix] = useState('ABC')
  const [suffix, setSuffix] = useState('')
  const [start, setStart] = useState(1)
  const [digits, setDigits] = useState(6)
  const [position, setPosition] = useState<Position>('bottom-right')
  const [size, setSize] = useState(9)
  const [color, setColor] = useState('#000000')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const sample = `${prefix}${String(start).padStart(digits, '0')}${suffix}`
  return (
    <div className="space-y-6">
      <Panel title="Documents (in production order)">
        <div className="space-y-4">
          {files.length > 0 && <FileOrderList files={files} onChange={setFiles} />}
          <FileDrop accept="application/pdf,.pdf" multiple compact={files.length > 0} label={files.length ? 'Add more PDFs' : 'Choose PDFs'} onFiles={(f) => setFiles([...files, ...f])} />
        </div>
      </Panel>
      <Panel title="Bates number">
        <div className="space-y-4">
          <Grid cols={4}>
            <TextInput label="Prefix" value={prefix} onChange={setPrefix} />
            <NumberInput label="Start number" value={start} min={0} onChange={setStart} />
            <NumberInput label="Digits" value={digits} min={1} max={12} onChange={setDigits} />
            <TextInput label="Suffix" value={suffix} onChange={setSuffix} />
          </Grid>
          <p className="text-sm">First stamp: <code className="rounded bg-muted px-2 py-1 font-mono">{sample}</code></p>
          <div className="flex flex-wrap items-end gap-6">
            <PositionGrid value={position} onChange={setPosition} allowMiddle={false} />
            <Grid>
              <NumberInput label="Font size" value={size} min={5} max={36} suffix="pt" onChange={setSize} />
              <ColorInput label="Colour" value={color} onChange={setColor} />
            </Grid>
          </div>
        </div>
      </Panel>
      <RunBar task={task} label="Stamp Bates numbers" disabled={!files.length} onRun={async () => {
        const r = await task.run(async () => batesNumber(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), { prefix, suffix, start: start || 0, digits: digits || 6, position, size, margin: 18, color }), 'Stamping')
        if (r) setOut(r.map((x) => pdfOut(x.bytes, `${baseName(x.name)}-bates.pdf`, `${x.first} – ${x.last}`)))
      }} />
      <Results files={out} zipName="bates-production.zip" onReset={() => { setOut([]); setFiles([]) }} />
    </div>
  )
}

/* ------------------------------------------------------- header/footer */

export function HeaderFooter() {
  const pdf = usePdfInput()
  const [header, setHeader] = useState<[string, string, string]>(['', '{file}', ''])
  const [footer, setFooter] = useState<[string, string, string]>(['{date}', '', 'Page {n} of {total}'])
  const [size, setSize] = useState(9)
  const [margin, setMargin] = useState(24)
  const [color, setColor] = useState('#444444')
  const [skipFirst, setSkipFirst] = useState(false)
  const [start, setStart] = useState(1)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const slot = (arr: [string, string, string], set: (v: [string, string, string]) => void, i: number, label: string) => <TextInput label={label} value={arr[i]} onChange={(v) => { const n = [...arr] as [string, string, string]; n[i] = v; set(n) }} />
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Header">
        <Grid cols={3}>{slot(header, setHeader, 0, 'Left')}{slot(header, setHeader, 1, 'Centre')}{slot(header, setHeader, 2, 'Right')}</Grid>
      </Panel>
      <Panel title="Footer">
        <Grid cols={3}>{slot(footer, setFooter, 0, 'Left')}{slot(footer, setFooter, 1, 'Centre')}{slot(footer, setFooter, 2, 'Right')}</Grid>
        <p className="mt-3 text-xs text-muted-foreground">Tokens: <code>{'{n}'}</code> page number, <code>{'{total}'}</code> page count, <code>{'{file}'}</code> file name, <code>{'{date}'}</code> DD/MM/YYYY, <code>{'{iso}'}</code> YYYY-MM-DD, <code>{'{time}'}</code></p>
      </Panel>
      <Panel title="Style">
        <Grid cols={4}>
          <NumberInput label="Font size" value={size} min={5} max={36} suffix="pt" onChange={setSize} />
          <NumberInput label="Distance from edge" value={margin} min={0} max={144} suffix="pt" onChange={setMargin} />
          <NumberInput label="First page number" value={start} min={0} onChange={setStart} />
          <ColorInput label="Colour" value={color} onChange={setColor} />
        </Grid>
        <div className="mt-4"><Toggle label="Skip the first page" checked={skipFirst} onChange={setSkipFirst} /></div>
      </Panel>
      <RunBar task={task} label="Add header & footer" disabled={!pdf.input || ![...header, ...footer].some((s) => s.trim())} onRun={async () => {
        const r = await task.run(() => addHeaderFooter(pdf.input!.bytes, { header, footer, size, margin, color, skipFirst, start: start || 1 }, baseName(pdf.input!.file.name)), 'Adding')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-header-footer.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* -------------------------------------------------------------- flatten */

export function Flatten() {
  const pdf = usePdfInput()
  const [forms, setForms] = useState(true)
  const [annots, setAnnots] = useState(true)
  const [scripts, setScripts] = useState(true)
  const [keepLinks, setKeepLinks] = useState(true)
  const [out, setOut] = useState<OutFile[]>([])
  const [summary, setSummary] = useState('')
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="What to flatten">
        <Grid>
          <Toggle label="Form fields" hint="Answers are burned into the page and can no longer be changed" checked={forms} onChange={setForms} />
          <Toggle label="Annotations" hint="Comments, highlights, stamps and drawings become part of the page" checked={annots} onChange={setAnnots} />
          <Toggle label="Scripts & actions" hint="Removes JavaScript, auto-run actions and XFA" checked={scripts} onChange={setScripts} />
          <Toggle label="Keep clickable links" checked={keepLinks} onChange={setKeepLinks} />
        </Grid>
      </Panel>
      <RunBar task={task} label="Flatten PDF" disabled={!pdf.input || !(forms || annots || scripts)} onRun={async () => {
        const r = await task.run(() => flattenPdf(pdf.input!.bytes, { forms, annotations: annots, scripts, keepLinks }), 'Flattening')
        if (!r) return
        setSummary(`${r.fields} form field${r.fields === 1 ? '' : 's'}, ${r.annotations} annotation${r.annotations === 1 ? '' : 's'} and ${r.scripts} script${r.scripts === 1 ? '' : 's'} flattened or removed.`)
        setOut([pdfOut(r.bytes, `${baseName(pdf.input!.file.name)}-flattened.pdf`)])
      }} />
      <Results files={out} summary={summary && <Note tone="ok">{summary}</Note>} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* --------------------------------------------------------------- invert */

const MODES: readonly (readonly [ColourMode, string])[] = [['dark', 'Dark mode (keeps colours)'], ['invert', 'Pure negative'], ['night', 'Night (soft grey)'], ['sepia', 'Sepia'], ['grayscale', 'Grayscale'], ['high-contrast', 'High contrast B/W'], ['custom', 'Custom colours']]

export function InvertColours() {
  const pdf = usePdfInput()
  const [mode, setMode] = useState<ColourMode>('dark')
  const [fg, setFg] = useState('#f5f0e6')
  const [bg, setBg] = useState('#1d2433')
  const [dpi, setDpi] = useState(150)
  const [keepText, setKeepText] = useState(true)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const rgb = (h: string) => { const c = hexToRgb(h); return [c.r, c.g, c.b] as [number, number, number] }
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Colour scheme">
        <div className="space-y-4">
          <Select label="Mode" value={mode} onChange={setMode} options={MODES} />
          {mode === 'custom' && <Grid><ColorInput label="Background (paper)" value={bg} onChange={setBg} /><ColorInput label="Text (ink)" value={fg} onChange={setFg} /></Grid>}
          <Grid>
            <Select label="Quality" value={String(dpi)} onChange={(v) => setDpi(Number(v))} options={[['110', 'Screen (110 dpi, smallest)'], ['150', 'Standard (150 dpi)'], ['220', 'High (220 dpi)'], ['300', 'Print (300 dpi)']]} />
            <Toggle label="Keep text selectable & searchable" checked={keepText} onChange={setKeepText} />
          </Grid>
          <Note>Pages are re-rendered pixel by pixel, so every colour – including images – is converted exactly.</Note>
        </div>
      </Panel>
      <RunBar task={task} label="Convert colours" disabled={!pdf.input} onRun={async () => {
        const r = await task.run((p) => invertColours(pdf.input!.bytes, mode, { scale: dpi / 72, quality: 0.85, keepText, custom: { fg: rgb(fg), bg: rgb(bg) }, onProgress: p }), 'Rendering')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-${mode}.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ------------------------------------------------------------ fill form */

type FieldInfo = { name: string; kind: 'text' | 'check' | 'radio' | 'dropdown' | 'list'; value: string | boolean | string[]; options: string[]; multiline: boolean; readOnly: boolean; required: boolean; maxLength?: number }

export function FillForm() {
  const pdf = usePdfInput()
  const [fields, setFields] = useState<FieldInfo[] | null>(null)
  const [lock, setLock] = useState(true)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const load = async () => {
    const r = await task.run(async () => {
      const doc = await loadDoc(pdf.input!.bytes)
      const form = doc.getForm()
      return form.getFields().map((f): FieldInfo => {
        const base = { name: f.getName(), readOnly: f.isReadOnly(), required: f.isRequired(), options: [] as string[], multiline: false }
        if (f instanceof PDFTextField) return { ...base, kind: 'text', value: f.getText() ?? '', multiline: f.isMultiline(), maxLength: f.getMaxLength() }
        if (f instanceof PDFCheckBox) return { ...base, kind: 'check', value: f.isChecked() }
        if (f instanceof PDFRadioGroup) return { ...base, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions() }
        if (f instanceof PDFDropdown) return { ...base, kind: 'dropdown', value: f.getSelected()[0] ?? '', options: f.getOptions() }
        if (f instanceof PDFOptionList) return { ...base, kind: 'list', value: f.getSelected(), options: f.getOptions() }
        return { ...base, kind: 'text', value: '', readOnly: true }
      }).filter((f) => !/signature/i.test(f.name) || f.kind !== 'text' || !f.readOnly)
    }, 'Reading form')
    if (r) setFields(r)
  }
  const set = (i: number, v: FieldInfo['value']) => setFields(fields!.map((f, k) => (k === i ? { ...f, value: v } : f)))
  return (
    <div className="space-y-6">
      <Panel title="Fillable PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setFields(null); pdf.reset() } }} /></Panel>
      {pdf.input && !fields && <Button onClick={() => void load()} disabled={task.busy}>Show form fields</Button>}
      {fields && !fields.length && <Note tone="warn">This PDF has no fillable fields. To type on a flat form, use the <Link className="underline" href="/editor?tool=edit">editor</Link> and add text boxes.</Note>}
      {fields && fields.length > 0 && (
        <Panel title={`${fields.length} field${fields.length === 1 ? '' : 's'}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f, i) => {
              const label = <>{f.name}{f.required && <span className="text-destructive"> *</span>}{f.readOnly && <span className="text-muted-foreground"> (read-only)</span>}</>
              if (f.kind === 'check') return <Toggle key={f.name} label={label} checked={!!f.value} onChange={(v) => set(i, v)} />
              if (f.kind === 'radio' || f.kind === 'dropdown') return <Select key={f.name} label={label} value={String(f.value)} onChange={(v) => set(i, v)} options={[['', '—'], ...f.options.map((o) => [o, o] as const)]} />
              if (f.kind === 'list') return (
                <div key={f.name} className="space-y-1.5"><p className="text-sm font-medium">{label}</p><select multiple className="h-28 w-full rounded-lg border bg-background p-2 text-sm" value={f.value as string[]} onChange={(e) => set(i, Array.from(e.target.selectedOptions).map((o) => o.value))}>{f.options.map((o) => <option key={o}>{o}</option>)}</select></div>
              )
              return f.multiline
                ? <div key={f.name} className="sm:col-span-2"><label className="space-y-1.5 text-sm font-medium"><span>{label}</span><textarea className="block w-full rounded-lg border bg-background p-3 text-sm font-normal" rows={3} disabled={f.readOnly} maxLength={f.maxLength} value={String(f.value)} onChange={(e) => set(i, e.target.value)} /></label></div>
                : <TextInput key={f.name} label={label} value={String(f.value)} disabled={f.readOnly} onChange={(v) => set(i, f.maxLength ? v.slice(0, f.maxLength) : v)} />
            })}
          </div>
          <div className="mt-5"><Toggle label="Lock the answers (flatten)" hint="Every viewer – including phones and printers – shows exactly what you typed, and it can’t be edited" checked={lock} onChange={setLock} /></div>
        </Panel>
      )}
      <RunBar task={task} label="Save filled PDF" disabled={!fields?.length} onRun={async () => {
        const missing = fields!.filter((f) => f.required && (f.value === '' || f.value === false || (Array.isArray(f.value) && !f.value.length)))
        if (missing.length) {
          task.setError(`Please fill the required field${missing.length > 1 ? 's' : ''}: ${missing.map((f) => f.name).join(', ')}`)
          return
        }
        const r = await task.run(async () => {
          const doc = await loadDoc(pdf.input!.bytes)
          const form = doc.getForm()
          for (const f of fields!) {
            if (f.readOnly) continue
            const field = form.getField(f.name)
            if (field instanceof PDFTextField) field.setText(String(f.value) || undefined)
            else if (field instanceof PDFCheckBox) { if (f.value) field.check(); else field.uncheck() }
            else if (field instanceof PDFRadioGroup) { if (f.value) field.select(String(f.value)); else field.clear() }
            else if (field instanceof PDFDropdown) { if (f.value) field.select(String(f.value)); else field.clear() }
            else if (field instanceof PDFOptionList) { if ((f.value as string[]).length) field.select(f.value as string[]); else field.clear() }
          }
          try {
            const { unicodeFonts } = await import('@/tools/lib/fonts')
            const { regular } = await unicodeFonts(doc)
            form.updateFieldAppearances(regular)
          } catch {
            form.updateFieldAppearances()
          }
          if (lock) form.flatten({ updateFieldAppearances: false })
          return saveDoc(doc)
        }, 'Saving')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-filled.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); setFields(null); pdf.reset() }} />
    </div>
  )
}
