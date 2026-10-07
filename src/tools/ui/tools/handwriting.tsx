'use client'

import { useEffect, useRef, useState } from 'react'
import { Eraser, PenLine, RefreshCw, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { imagesToPdfBlob } from '@/services/convert/to-pdf'
import { PAGE_SIZES } from '@/lib/geometry'
import { clearGlyphs, GLYPH_CHARS, HAND_FONTS, INKS, loadGlyphs, renderHandwriting, saveGlyphs, strokesToGlyph, type GlyphSet, type HandOptions, type Paper } from '@/tools/lib/handwriting'
import { allPageText, baseName, canvasBlob, closePdf, groupLines, openPdfjs, paragraphs } from '@/tools/lib/pdf'
import { ColorInput, Grid, Note, Panel, PdfPicker, Range, Results, RunBar, Segmented, Select, TextArea, TextInput, Toggle, usePdfInput, useTask, type OutFile } from '../kit'

const SAMPLE = `Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to make glucose and release oxygen.

It happens mainly in the leaves, inside tiny structures called chloroplasts that contain the green pigment chlorophyll.

6CO2 + 6H2O + light → C6H12O6 + 6O2`

/* ----------------------------------------------- capture own handwriting */

const PAD = 220

function GlyphPad({ onDone, onClose, existing }: { onDone: (g: GlyphSet) => void; onClose: () => void; existing: GlyphSet | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [idx, setIdx] = useState(0)
  const [set, setSet] = useState<GlyphSet>(existing ?? {})
  const strokes = useRef<[number, number][][]>([])
  const drawing = useRef(false)
  const ch = GLYPH_CHARS[idx]
  const redraw = () => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, PAD, PAD)
    ctx.strokeStyle = '#cbd5e1'
    ctx.setLineDash([4, 4])
    for (const y of [0.25, 0.5]) { ctx.beginPath(); ctx.moveTo(0, y * PAD); ctx.lineTo(PAD, y * PAD); ctx.stroke() }
    ctx.setLineDash([])
    ctx.strokeStyle = '#ef4444'
    ctx.beginPath(); ctx.moveTo(0, 0.75 * PAD); ctx.lineTo(PAD, 0.75 * PAD); ctx.stroke()
    ctx.strokeStyle = '#1a3c8f'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of strokes.current) {
      ctx.beginPath()
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1])
      ctx.stroke()
    }
    ctx.lineWidth = 1
  }
  useEffect(() => {
    strokes.current = []
    redraw()
     
  }, [idx])
  const pos = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * PAD, ((e.clientY - r.top) / r.height) * PAD]
  }
  const commit = (advance: boolean) => {
    const g = strokesToGlyph(strokes.current, PAD)
    const next = { ...set }
    if (g) next[ch] = [...(next[ch] ?? []).slice(-2), g]
    setSet(next)
    strokes.current = []
    if (advance) setIdx((i) => Math.min(GLYPH_CHARS.length - 1, i + 1))
    redraw()
    return next
  }
  const done = Object.keys(set).length
  return (
    <Panel title="Teach it your handwriting" actions={<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}>
      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="space-y-3">
          <p className="text-center text-sm">Write <span className="rounded bg-muted px-2 py-0.5 font-mono text-lg font-bold">{ch}</span> sitting on the red line</p>
          <canvas ref={canvas} width={PAD} height={PAD} className="mx-auto block touch-none rounded-xl border bg-white" style={{ width: PAD, height: PAD }}
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drawing.current = true; strokes.current.push([pos(e)]); redraw() }}
            onPointerMove={(e) => { if (!drawing.current) return; strokes.current[strokes.current.length - 1].push(pos(e)); redraw() }}
            onPointerUp={() => (drawing.current = false)} aria-label={`Drawing pad for ${ch}`} />
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { strokes.current.pop(); redraw() }}><Undo2 className="mr-1 size-4" aria-hidden /> Undo</Button>
            <Button variant="outline" size="sm" onClick={() => { strokes.current = []; redraw() }}><Eraser className="mr-1 size-4" aria-hidden /> Clear</Button>
            <Button size="sm" onClick={() => commit(true)}>Save &amp; next</Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">Write a letter again later to add a variation – up to 3 per character make the result look more natural.</p>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">{done} of {GLYPH_CHARS.length} characters captured</p>
          <div className="flex flex-wrap gap-1">
            {[...GLYPH_CHARS].map((c, i) => (
              <button key={c} type="button" onClick={() => setIdx(i)} className={cn('size-8 rounded-md border font-mono text-sm', i === idx && 'ring-2 ring-primary', set[c] ? 'bg-green-600/15 border-green-600/40' : 'bg-background')}>{c}{set[c]?.length > 1 ? <sup className="text-[9px]">{set[c].length}</sup> : null}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { const s = commit(false); saveGlyphs(s); onDone(s) }} disabled={!done}><PenLine className="mr-1.5 size-4" aria-hidden /> Use my handwriting</Button>
            <Button variant="ghost" onClick={() => { clearGlyphs(); setSet({}); setIdx(0) }}><Trash2 className="mr-1.5 size-4" aria-hidden /> Start over</Button>
          </div>
          <Note>Your handwriting is stored only in this browser. Characters you skip are written with the selected font.</Note>
        </div>
      </div>
    </Panel>
  )
}

/* -------------------------------------------------------------- studio */

function HandwritingStudio({ text, setText, title }: { text: string; setText: (t: string) => void; title: string }) {
  const [font, setFont] = useState<string>('caveat')
  const [own, setOwn] = useState<GlyphSet | null>(null)
  const [useOwn, setUseOwn] = useState(false)
  const [capture, setCapture] = useState(false)
  const [ink, setInk] = useState<string>(INKS.blue)
  const [paper, setPaper] = useState<Paper>('ruled')
  const [size, setSize] = useState(16)
  const [gap, setGap] = useState(1.75)
  const [jitter, setJitter] = useState(0.6)
  const [slant, setSlant] = useState(0)
  const [margin, setMargin] = useState(true)
  const [scan, setScan] = useState(false)
  const [heading, setHeading] = useState('')
  const [seed, setSeed] = useState(7)
  const [pageSize, setPageSize] = useState<'A4' | 'Letter'>('A4')
  const [preview, setPreview] = useState<string>('')
  const [pages, setPages] = useState(0)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  useEffect(() => {
    const g = loadGlyphs()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore captured handwriting from this browser
    if (g && Object.keys(g).length) setOwn(g)
  }, [])
  const opts = (scale: number): HandOptions => {
    const [w, h] = PAGE_SIZES[pageSize]
    return { font, own: useOwn ? own : null, size, ink, paper, lineGap: gap, jitter, slant, margin, scanEffect: scan, pageWidth: w, pageHeight: h, scale, heading: heading.trim() || undefined, seed }
  }
  const key = JSON.stringify([text, font, useOwn, ink, paper, size, gap, jitter, slant, margin, scan, heading, seed, pageSize, own ? Object.keys(own).length : 0])
  useEffect(() => {
    let cancel = false
    const t = setTimeout(async () => {
      const canvases = await renderHandwriting(text || ' ', opts(1.1))
      if (cancel) return
      setPages(canvases.length)
      setPreview(canvases[0].toDataURL('image/jpeg', 0.8))
    }, 250)
    return () => {
      cancel = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures every option
  }, [key])
  return (
    <div className="space-y-6">
      {capture && <GlyphPad existing={own} onClose={() => setCapture(false)} onDone={(g) => { setOwn(g); setUseOwn(true); setCapture(false) }} />}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <Panel title="Text"><TextArea label="What should be written" value={text} onChange={setText} rows={10} /><div className="mt-3"><TextInput label="Heading (optional)" value={heading} onChange={setHeading} placeholder="e.g. Assignment 3 – Biology" /></div></Panel>
          <Panel title="Handwriting">
            <div className="space-y-4">
              <Segmented value={useOwn ? 'own' : 'font'} onChange={(v) => { if (v === 'own' && !own) setCapture(true); setUseOwn(v === 'own') }} options={[['font', 'Handwriting font'], ['own', 'My own handwriting']]} />
              {!useOwn ? (
                <div className="grid grid-cols-2 gap-2">
                  {HAND_FONTS.map((f) => (
                    <button key={f.id} type="button" onClick={() => setFont(f.id)} className={cn('rounded-lg border p-2 text-left transition', font === f.id ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary')}>
                      <span className="block text-xl" style={{ fontFamily: `"Hand-${f.id}"`, color: ink }}>The quick fox</span>
                      <span className="text-xs text-muted-foreground">{f.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">{own ? <span>{Object.keys(own).length} characters captured.</span> : null}<Button variant="outline" size="sm" onClick={() => setCapture(true)}><PenLine className="mr-1.5 size-4" aria-hidden /> {own ? 'Add / redo characters' : 'Capture my handwriting'}</Button></div>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex gap-1.5" role="radiogroup" aria-label="Ink colour">
                  {Object.entries(INKS).map(([n, c]) => <button key={n} type="button" role="radio" aria-checked={ink === c} aria-label={n} onClick={() => setInk(c)} className={cn('size-8 rounded-full border-2', ink === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} />)}
                </div>
                <ColorInput label="Custom ink" value={ink} onChange={setInk} />
              </div>
              <Grid>
                <Select label="Paper" value={paper} onChange={setPaper} options={[['ruled', 'Ruled notebook'], ['college', 'College ruled'], ['legal', 'Yellow legal pad'], ['grid', 'Graph / grid'], ['plain', 'Plain white']]} />
                <Select label="Page size" value={pageSize} onChange={setPageSize} options={[['A4', 'A4'], ['Letter', 'US Letter']]} />
                <Range label="Size" value={size} min={10} max={28} onChange={setSize} format={(v) => `${v}pt`} />
                <Range label="Line spacing" value={gap} min={1.3} max={2.6} step={0.05} onChange={setGap} format={(v) => v.toFixed(2)} />
                <Range label="Natural variation" value={jitter} min={0} max={1} step={0.05} onChange={setJitter} format={(v) => `${Math.round(v * 100)}%`} />
                <Range label="Slant" value={slant} min={-1} max={1} step={0.1} onChange={setSlant} format={(v) => (v === 0 ? 'none' : v > 0 ? 'right' : 'left')} />
              </Grid>
              <Grid>
                <Toggle label="Margin line" checked={margin} onChange={setMargin} />
                <Toggle label="Scanned-photo look" checked={scan} onChange={setScan} />
              </Grid>
            </div>
          </Panel>
        </div>
        <Panel title={`Preview${pages > 1 ? ` (page 1 of ${pages})` : ''}`} actions={<Button variant="ghost" size="sm" onClick={() => setSeed(Math.floor(Math.random() * 1e6))}><RefreshCw className="mr-1.5 size-4" aria-hidden /> Re-write</Button>} className="lg:sticky lg:top-20 lg:self-start">
          { }
          {preview ? <img src={preview} alt="Handwriting preview" className="w-full rounded-lg border shadow-sm" /> : <div className="aspect-[1/1.414] animate-pulse rounded-lg bg-muted" />}
        </Panel>
      </div>
      <RunBar task={task} label="Download PDF" disabled={!text.trim()} extra={<Button variant="outline" disabled={!text.trim() || task.busy} onClick={async () => {
        const r = await task.run(async () => {
          const canvases = await renderHandwriting(text, opts(2.5))
          return Promise.all(canvases.map(async (c, i) => ({ name: `${title}-page${i + 1}.png`, blob: await canvasBlob(c, 'image/png') })))
        }, 'Writing')
        if (r) setOut(r)
      }}>Download as images</Button>} onRun={async () => {
        const r = await task.run(async (p) => {
          const canvases = await renderHandwriting(text, opts(2.5))
          const blobs = await Promise.all(canvases.map((c) => canvasBlob(c, 'image/jpeg', 0.88)))
          p(0.8)
          return imagesToPdfBlob(blobs, { pageSize, orientation: 'portrait', margin: 0, dpi: 180 })
        }, 'Writing')
        if (r) setOut([{ name: `${title}-handwritten.pdf`, blob: r, note: `${pages} page${pages === 1 ? '' : 's'}` }])
      }} />
      <Results files={out} onReset={() => setOut([])} />
    </div>
  )
}

export function TextToHandwriting() {
  const [text, setText] = useState(SAMPLE)
  return <HandwritingStudio text={text} setText={setText} title="notes" />
}

export function PdfToHandwriting() {
  const pdf = usePdfInput()
  const [text, setText] = useState<string | null>(null)
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="Source">
        <div className="space-y-3">
          <PdfPicker pdf={{ ...pdf, reset: () => { setText(null); pdf.reset() } }} />
          {!pdf.input && <p className="text-sm text-muted-foreground">…or <button type="button" className="font-medium text-primary underline" onClick={() => setText(SAMPLE)}>type text instead</button>.</p>}
          {pdf.input && text === null && <Button onClick={async () => {
            const r = await task.run(async (p) => {
              const doc = await openPdfjs(pdf.input!.bytes)
              const pages = await allPageText(doc, p)
              await closePdf(doc)
              const t = pages.map((pg) => paragraphs(groupLines(pg.runs)).map((x) => x.text).join('\n\n')).join('\n\n').trim()
              if (!t) throw new Error('This PDF has no text layer (it is probably scanned). Run OCR first, or type the text.')
              return t
            }, 'Reading the PDF')
            if (r !== undefined) setText(r)
          }}>Use the text of this PDF</Button>}
          {task.error && <Note tone="warn">{task.error}</Note>}
        </div>
      </Panel>
      {text !== null && <HandwritingStudio text={text} setText={setText} title={pdf.input ? baseName(pdf.input.file.name) : 'notes'} />}
    </div>
  )
}

