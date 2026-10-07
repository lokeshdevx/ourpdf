'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, FilePlus2, PenLine, RotateCcw, RotateCw, Search, Trash2, Type, Upload, X } from 'lucide-react'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { safe, unicodeFonts } from '@/tools/lib/fonts'
import { HAND_FONTS, loadHandFont } from '@/tools/lib/handwriting'
import { ocrCanvas, ocrRuns } from '@/tools/lib/ocr'
import { baseName, closePdf, loadDoc, openPdfjs, pageText, renderPage, saveDoc } from '@/tools/lib/pdf'
import { boxesFor, indexRuns, type Box } from '@/tools/lib/pii'
import { applyRedactions, drawInvisibleText } from '@/tools/lib/raster'
import { inVisualSpace } from '@/tools/lib/stamp'
import { Grid, Note, Panel, PdfPicker, Results, RunBar, Segmented, TextInput, Toggle, pdfOut, usePdfInput, useTask, type OutFile } from '../kit'
import { PageCanvas, pct, usePageImages } from '../page-view'

/* ================================================================ organize */

interface Slot { id: string; src: number | null; rot: number }

export function OrganizePdf() {
  const pdf = usePdfInput()
  const { pages } = usePageImages(pdf.input?.bytes ?? null, 260, 500)
  const [slots, setSlots] = useState<Slot[]>([])
  const [drag, setDrag] = useState<number | null>(null)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one slot per page of a newly opened file
    setSlots(pdf.input ? Array.from({ length: pdf.input.pages }, (_, i) => ({ id: `p${i}`, src: i, rot: 0 })) : [])
  }, [pdf.input])
  const move = (from: number, to: number) => setSlots((s) => { const n = [...s]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n })
  const update = (i: number, patch: Partial<Slot>) => setSlots((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const changed = slots.some((s, i) => s.src !== i || s.rot) || slots.length !== (pdf.input?.pages ?? 0)
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      {pdf.input && (
        <Panel title={`${slots.length} page${slots.length === 1 ? '' : 's'} – drag to reorder`} actions={<div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setSlots((s) => [...s].reverse())}>Reverse order</Button>
          <Button variant="outline" size="sm" onClick={() => setSlots((s) => [...s, { id: crypto.randomUUID(), src: null, rot: 0 }])}><FilePlus2 className="mr-1.5 size-4" aria-hidden /> Blank page</Button>
          <Button variant="ghost" size="sm" disabled={!changed} onClick={() => setSlots(Array.from({ length: pdf.input!.pages }, (_, i) => ({ id: `p${i}`, src: i, rot: 0 })))}>Reset</Button>
        </div>}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5" data-testid="organize-grid">
            {slots.map((s, i) => (
              <li key={s.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null && drag !== i) move(drag, i); setDrag(null) }}
                className={cn('group rounded-xl border bg-background p-2 transition', drag === i && 'opacity-50')}>
                <div className="grid h-36 place-items-center overflow-hidden rounded-lg bg-muted/50">
                  {s.src === null ? <span className="grid h-28 w-20 place-items-center rounded border bg-white text-xs text-muted-foreground">blank</span>
                     
                    : pages[s.src] ? <img src={pages[s.src].url} alt={`Page ${s.src + 1}`} draggable={false} className="max-h-32 max-w-full bg-white shadow transition-transform duration-200" style={{ transform: `rotate(${s.rot}deg)` }} /> : <span className="h-28 w-20 animate-pulse rounded bg-muted" />}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">{i + 1}{s.src !== null && s.src !== i && <span className="font-normal text-muted-foreground"> (was {s.src + 1})</span>}</span>
                  <span className="flex opacity-80 group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Rotate page ${i + 1} left`} onClick={() => update(i, { rot: (s.rot + 270) % 360 })}><RotateCcw className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Rotate page ${i + 1} right`} onClick={() => update(i, { rot: (s.rot + 90) % 360 })}><RotateCw className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Duplicate page ${i + 1}`} onClick={() => setSlots((x) => [...x.slice(0, i + 1), { ...s, id: crypto.randomUUID() }, ...x.slice(i + 1)])}><Copy className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Delete page ${i + 1}`} onClick={() => setSlots((x) => x.filter((_, k) => k !== i))}><Trash2 className="size-3.5" /></Button>
                  </span>
                </div>
                <div className="mt-1 flex justify-center gap-1 sm:hidden">
                  <Button variant="ghost" size="icon" className="size-7" disabled={i === 0} aria-label="Move earlier" onClick={() => move(i, i - 1)}><ArrowUp className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="size-7" disabled={i === slots.length - 1} aria-label="Move later" onClick={() => move(i, i + 1)}><ArrowDown className="size-3.5" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <RunBar task={task} label="Save organized PDF" disabled={!pdf.input || !slots.length || !changed} onRun={async () => {
        const r = await task.run(async () => {
          const src = await loadDoc(pdf.input!.bytes)
          const out = await PDFDocument.create({ updateMetadata: false })
          const real = slots.map((s) => s.src).filter((x): x is number => x !== null)
          const copied = await out.copyPages(src, real)
          let k = 0
          for (const s of slots) {
            if (s.src === null) {
              const ref = src.getPage(0).getSize()
              out.addPage([ref.width, ref.height])
              continue
            }
            const p = copied[k++]
            if (s.rot) p.setRotation(degrees((p.getRotation().angle + s.rot) % 360))
            out.addPage(p)
          }
          return saveDoc(out)
        }, 'Saving')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-organized.pdf`, `${slots.length} pages`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}

/* ==================================================================== sign */

const SIG_KEY = 'ourpdf.signatures.v1'
interface Placed { id: string; page: number; x: number; y: number; w: number; h: number; kind: 'image' | 'text'; src?: string; text?: string; size?: number }

function trimCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  if (x1 <= x0) return c
  const o = document.createElement('canvas')
  o.width = x1 - x0 + 8
  o.height = y1 - y0 + 8
  o.getContext('2d')!.drawImage(c, x0 - 4, y0 - 4, o.width, o.height, 0, 0, o.width, o.height)
  return o
}

function SignatureMaker({ onCreate }: { onCreate: (dataUrl: string) => void }) {
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw')
  const [name, setName] = useState('')
  const [font, setFont] = useState('homemade-apple')
  const [ink, setInk] = useState('#0f2560')
  const pad = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<[number, number] | null>(null)
  useEffect(() => { void loadHandFont(font) }, [font])
  const pos = (e: React.PointerEvent): [number, number] => {
    const r = pad.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * pad.current!.width, ((e.clientY - r.top) / r.height) * pad.current!.height]
  }
  const typed = async () => {
    await loadHandFont(font)
    const c = document.createElement('canvas')
    c.width = 1200
    c.height = 300
    const ctx = c.getContext('2d')!
    ctx.font = `140px "Hand-${font}"`
    ctx.fillStyle = ink
    ctx.textBaseline = 'middle'
    ctx.fillText(name, 20, 150)
    return trimCanvas(c).toDataURL('image/png')
  }
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[['draw', 'Draw'], ['type', 'Type'], ['upload', 'Upload / photo']]} />
      <div className="flex gap-1.5" role="radiogroup" aria-label="Ink colour">
        {['#0f2560', '#111111', '#1d4ed8', '#b91c1c'].map((c) => <button key={c} type="button" role="radio" aria-checked={ink === c} aria-label={c} onClick={() => setInk(c)} className={cn('size-7 rounded-full border-2', ink === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} />)}
      </div>
      {mode === 'draw' && (
        <div className="space-y-2">
          <canvas ref={pad} width={900} height={260} className="w-full touch-none rounded-xl border bg-white" aria-label="Draw your signature"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e) }}
            onPointerMove={(e) => {
              if (!drawing.current || !last.current) return
              const ctx = pad.current!.getContext('2d')!
              const p = pos(e)
              ctx.strokeStyle = ink
              ctx.lineWidth = 5
              ctx.lineCap = 'round'
              ctx.lineJoin = 'round'
              ctx.beginPath()
              ctx.moveTo(...last.current)
              ctx.lineTo(...p)
              ctx.stroke()
              last.current = p
            }}
            onPointerUp={() => { drawing.current = false }} />
          <div className="flex gap-2">
            <Button onClick={() => onCreate(trimCanvas(pad.current!).toDataURL('image/png'))}>Use signature</Button>
            <Button variant="ghost" onClick={() => pad.current!.getContext('2d')!.clearRect(0, 0, 900, 260)}>Clear</Button>
          </div>
        </div>
      )}
      {mode === 'type' && (
        <div className="space-y-3">
          <TextInput label="Your name" value={name} onChange={setName} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {HAND_FONTS.slice(0, 8).map((f) => <button key={f.id} type="button" onClick={() => setFont(f.id)} className={cn('truncate rounded-lg border px-3 py-2 text-2xl', font === f.id ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary')} style={{ fontFamily: `"Hand-${f.id}"`, color: ink }}>{name || 'Signature'}</button>)}
          </div>
          <Button disabled={!name.trim()} onClick={async () => onCreate(await typed())}>Use signature</Button>
        </div>
      )}
      {mode === 'upload' && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm">
          <Upload className="size-6 text-primary" aria-hidden /> Choose a photo or scan of your signature (white background is removed)
          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const bmp = await createImageBitmap(f)
            const c = document.createElement('canvas')
            const k = Math.min(1, 1400 / bmp.width)
            c.width = bmp.width * k
            c.height = bmp.height * k
            const ctx = c.getContext('2d', { willReadFrequently: true })!
            ctx.drawImage(bmp, 0, 0, c.width, c.height)
            const img = ctx.getImageData(0, 0, c.width, c.height)
            for (let i = 0; i < img.data.length; i += 4) {
              const l = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
              img.data[i + 3] = l > 200 ? 0 : l > 150 ? 255 * (200 - l) / 50 : 255
            }
            ctx.putImageData(img, 0, 0)
            onCreate(trimCanvas(c).toDataURL('image/png'))
          }} />
        </label>
      )}
    </div>
  )
}

export function SignPdf() {
  const pdf = usePdfInput()
  const { pages } = usePageImages(pdf.input?.bytes ?? null, 1000, 200)
  const [sigs, setSigs] = useState<string[]>([])
  const [active, setActive] = useState<{ kind: 'image'; src: string } | { kind: 'text'; text: string } | null>(null)
  const [placed, setPlaced] = useState<Placed[]>([])
  const [making, setMaking] = useState(false)
  const [dragging, setDragging] = useState<{ id: string; mode: 'move' | 'resize'; dx: number; dy: number } | null>(null)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIG_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore signatures saved in this browser
      if (raw) setSigs(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])
  const keep = (list: string[]) => {
    setSigs(list)
    try { localStorage.setItem(SIG_KEY, JSON.stringify(list.slice(0, 6))) } catch { /* ignore */ }
  }
  const place = async (page: number, x: number, y: number) => {
    if (!active) return
    if (active.kind === 'image') {
      const img = new Image()
      img.src = active.src
      await img.decode()
      const w = 150, h = (150 * img.height) / img.width
      setPlaced((p) => [...p, { id: crypto.randomUUID(), page, x: x - w / 2, y: y - h / 2, w, h, kind: 'image', src: active.src }])
    } else {
      const size = 12
      setPlaced((p) => [...p, { id: crypto.randomUUID(), page, x, y: y - size / 2, w: active.text.length * size * 0.55, h: size * 1.3, kind: 'text', text: active.text, size }])
    }
  }
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setPlaced([]); pdf.reset() } }} /></Panel>
      {pdf.input && (
        <Panel title="1 · Choose what to place" actions={<Button variant="outline" size="sm" onClick={() => setMaking(!making)}><PenLine className="mr-1.5 size-4" aria-hidden /> {making ? 'Close' : 'New signature'}</Button>}>
          {(making || !sigs.length) && <div className="mb-4 rounded-xl border p-4"><SignatureMaker onCreate={(u) => { keep([u, ...sigs]); setActive({ kind: 'image', src: u }); setMaking(false) }} /></div>}
          <div className="flex flex-wrap items-center gap-2">
            {sigs.map((s, i) => (
              <span key={i} className="relative">
                <button type="button" onClick={() => setActive({ kind: 'image', src: s })} aria-pressed={active?.kind === 'image' && active.src === s} aria-label={`Signature ${i + 1}`} className={cn('grid h-16 w-40 place-items-center rounded-lg border bg-white p-1', active?.kind === 'image' && active.src === s && 'border-primary ring-2 ring-primary/30')}>
                  { }
                  <img src={s} alt="" className="max-h-14 max-w-full" />
                </button>
                <button type="button" aria-label="Delete saved signature" onClick={() => keep(sigs.filter((_, k) => k !== i))} className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border bg-background"><X className="size-3" /></button>
              </span>
            ))}
            <Button variant={active?.kind === 'text' && active.text === today ? 'default' : 'outline'} size="sm" onClick={() => setActive({ kind: 'text', text: today })}><Type className="mr-1.5 size-4" aria-hidden /> Date</Button>
            <Button variant="outline" size="sm" onClick={() => { const t = prompt('Text to place (e.g. your name or initials)'); if (t) setActive({ kind: 'text', text: t }) }}><Type className="mr-1.5 size-4" aria-hidden /> Text…</Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{active ? 'Now click on the page where it should go. Drag to move; drag the corner to resize.' : 'Pick a signature, the date or text.'}</p>
        </Panel>
      )}
      {pdf.input && pages.length > 0 && (
        <Panel title="2 · Click to place">
          <div className="mx-auto max-w-3xl space-y-6">
            {pages.map((pg, i) => (
              <PageCanvas key={i} page={pg} index={i} cursor={active ? 'copy' : 'default'}
                onPointerDown={(pt) => void place(i, pt.x, pt.y)}
                onPointerMove={(pt) => {
                  if (!dragging) return
                  setPlaced((list) => list.map((p) => {
                    if (p.id !== dragging.id) return p
                    if (dragging.mode === 'move') return { ...p, x: pt.x - dragging.dx, y: pt.y - dragging.dy }
                    const w = Math.max(20, pt.x - p.x)
                    return p.kind === 'image' ? { ...p, w, h: (w * p.h) / p.w } : { ...p, w, size: (p.size ?? 12) * (w / p.w), h: (p.h * w) / p.w }
                  }))
                }}
                onPointerUp={() => setDragging(null)}>
                {placed.filter((p) => p.page === i).map((p) => (
                  <div key={p.id} className="group absolute cursor-move rounded outline-1 outline-dashed outline-primary/60 hover:outline-primary" style={pct(pg, p)}
                    onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); const r = e.currentTarget.parentElement!.getBoundingClientRect(); setDragging({ id: p.id, mode: 'move', dx: ((e.clientX - r.left) / r.width) * pg.w - p.x, dy: ((e.clientY - r.top) / r.height) * pg.h - p.y }) }}>
                    { }
                    {p.kind === 'image' ? <img src={p.src} alt="Signature" draggable={false} className="pointer-events-none size-full" /> : <span className="pointer-events-none block whitespace-nowrap leading-none text-black" style={{ fontSize: `${(p.size! / pg.w) * 100}cqw` }}>{p.text}</span>}
                    <button type="button" aria-label="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => setPlaced((l) => l.filter((x) => x.id !== p.id))} className="absolute -right-2.5 -top-2.5 hidden size-5 place-items-center rounded-full bg-destructive text-white group-hover:grid"><X className="size-3" /></button>
                    <span aria-hidden onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget.parentElement!.parentElement as HTMLElement).setPointerCapture(e.pointerId); setDragging({ id: p.id, mode: 'resize', dx: 0, dy: 0 }) }} className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize rounded-sm border-2 border-white bg-primary" />
                  </div>
                ))}
              </PageCanvas>
            ))}
          </div>
        </Panel>
      )}
      <RunBar task={task} label={`Save signed PDF${placed.length ? ` (${placed.length})` : ''}`} disabled={!placed.length} onRun={async () => {
        const r = await task.run(async () => {
          const doc = await loadDoc(pdf.input!.bytes)
          const { regular } = await unicodeFonts(doc)
          const pgs = doc.getPages()
          for (const p of placed) {
            const page = pgs[p.page]
            if (p.kind === 'image') {
              const img = await doc.embedPng(p.src!)
              inVisualSpace(page, (_w, h) => page.drawImage(img, { x: p.x, y: h - p.y - p.h, width: p.w, height: p.h }))
            } else inVisualSpace(page, (_w, h) => page.drawText(safe(regular, p.text!), { x: p.x, y: h - p.y - p.h * 0.8, size: p.size!, font: regular, color: rgb(0, 0, 0) }))
          }
          return saveDoc(doc)
        }, 'Signing')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-signed.pdf`)])
      }} />
      <Note>This adds a visual e-signature (like signing on paper). It is not a certificate-based digital signature.</Note>
      <Results files={out} onReset={() => { setOut([]); setPlaced([]); pdf.reset() }} />
    </div>
  )
}

/* ================================================================= redact */

export function RedactPdf() {
  const pdf = usePdfInput()
  const { pages } = usePageImages(pdf.input?.bytes ?? null, 1000, 200)
  const [boxes, setBoxes] = useState<(Box & { id: string; page: number })[]>([])
  const [draft, setDraft] = useState<{ page: number; x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [q, setQ] = useState('')
  const [colour, setColour] = useState('#000000')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const byPage = useMemo(() => {
    const m = new Map<number, Box[]>()
    for (const b of boxes) m.set(b.page, [...(m.get(b.page) ?? []), b])
    return m
  }, [boxes])
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setBoxes([]); pdf.reset() } }} /></Panel>
      {pdf.input && (
        <Panel title="Mark what to remove">
          <div className="space-y-4">
            <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
              e.preventDefault()
              if (!q.trim()) return
              const found = await task.run(async () => {
                const doc = await openPdfjs(pdf.input!.bytes)
                const res: (Box & { id: string; page: number })[] = []
                const re = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
                for (let i = 0; i < doc.numPages; i++) {
                  const t = await pageText(await doc.getPage(i + 1))
                  const idx = indexRuns(t.runs)
                  for (const m of idx.text.matchAll(re)) for (const b of boxesFor(t.runs, idx, m.index ?? 0, (m.index ?? 0) + m[0].length)) res.push({ ...b, id: crypto.randomUUID(), page: i })
                }
                await closePdf(doc)
                return res
              }, 'Searching')
              if (found) {
                setBoxes((b) => [...b, ...found])
                if (!found.length) task.setError(`“${q}” was not found in the text of this PDF.`)
              }
            }}>
              <div className="min-w-48 flex-1"><TextInput label="Find and mark every occurrence of" value={q} onChange={setQ} placeholder="name, account number, address…" /></div>
              <Button type="submit" variant="outline"><Search className="mr-1.5 size-4" aria-hidden /> Mark all</Button>
            </form>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">Or drag a box over anything on the pages below.</span>
              <label className="ml-auto flex items-center gap-2">Colour <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} className="h-8 w-10 rounded border" /></label>
              {boxes.length > 0 && <Button variant="ghost" size="sm" onClick={() => setBoxes([])}>Clear {boxes.length} mark{boxes.length === 1 ? '' : 's'}</Button>}
            </div>
          </div>
        </Panel>
      )}
      {pages.length > 0 && (
        <div className="mx-auto max-w-3xl space-y-6">
          {pages.map((pg, i) => (
            <PageCanvas key={i} page={pg} index={i} cursor="crosshair"
              onPointerDown={(pt) => setDraft({ page: i, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y })}
              onPointerMove={(pt) => draft?.page === i && setDraft({ ...draft, x1: pt.x, y1: pt.y })}
              onPointerUp={() => {
                if (draft && draft.page === i && Math.abs(draft.x1 - draft.x0) > 3 && Math.abs(draft.y1 - draft.y0) > 3) setBoxes((b) => [...b, { id: crypto.randomUUID(), page: i, x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0) }])
                setDraft(null)
              }}>
              {boxes.filter((b) => b.page === i).map((b) => (
                <button key={b.id} type="button" aria-label="Remove this mark" title="Click to remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => setBoxes((l) => l.filter((x) => x.id !== b.id))} className="absolute opacity-70 ring-1 ring-red-500 hover:opacity-50" style={{ ...pct(pg, b), background: colour }} />
              ))}
              {draft?.page === i && <div className="pointer-events-none absolute border-2 border-dashed border-red-500 bg-red-500/20" style={pct(pg, { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0) })} />}
            </PageCanvas>
          ))}
        </div>
      )}
      <RunBar task={task} label={`Redact ${boxes.length || ''} area${boxes.length === 1 ? '' : 's'} permanently`} disabled={!boxes.length} onRun={async () => {
        const r = await task.run((p) => applyRedactions(pdf.input!.bytes, byPage, { colour, onProgress: p }), 'Redacting')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-redacted.pdf`)])
      }} />
      <Note>Redacted pages are rebuilt from pixels, so the text and images under each box are permanently removed – not just covered. Need to find Aadhaar, PAN or phone numbers automatically? Use Auto-Redact PII.</Note>
      <Results files={out} onReset={() => { setOut([]); setBoxes([]); pdf.reset() }} />
    </div>
  )
}

/* ==================================================================== OCR */

const LANGS: [string, string][] = [['eng', 'English'], ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['ita', 'Italian'], ['por', 'Portuguese']]

export function OcrPdf() {
  const pdf = usePdfInput()
  const [langs, setLangs] = useState<string[]>(['eng'])
  const [onlyScanned, setOnlyScanned] = useState(true)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="Scanned PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Recognition">
        <div className="space-y-4">
          <div><p className="mb-1.5 text-sm font-medium">Document language(s)</p><div className="flex flex-wrap gap-2">{LANGS.map(([c, l]) => <label key={c} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={langs.includes(c)} onChange={(e) => setLangs(e.target.checked ? [...langs, c] : langs.filter((x) => x !== c))} />{l}</label>)}</div></div>
          <Grid><Toggle label="Skip pages that already have text" checked={onlyScanned} onChange={setOnlyScanned} /></Grid>
          <p className="text-xs text-muted-foreground">The page images stay exactly as they are; an invisible text layer is added so you can search, select and copy the text.</p>
        </div>
      </Panel>
      <RunBar task={task} label="Make searchable" disabled={!pdf.input || !langs.length} onRun={async () => {
        const r = await task.run(async (p) => {
          const js = await openPdfjs(pdf.input!.bytes)
          const doc = await loadDoc(pdf.input!.bytes)
          const font = await doc.embedFont(StandardFonts.Helvetica)
          const pgs = doc.getPages()
          const all: string[] = []
          let done = 0
          for (let i = 0; i < js.numPages; i++) {
            const page = await js.getPage(i + 1)
            const existing = await pageText(page)
            if (onlyScanned && existing.runs.some((x) => x.str.trim())) {
              all.push(existing.text)
              continue
            }
            const scale = 2.5
            const canvas = await renderPage(page, scale)
            const res = await ocrCanvas(canvas, langs, (f) => p((i + f) / js.numPages, `Reading page ${i + 1} of ${js.numPages}`))
            canvas.width = canvas.height = 0
            const runs = ocrRuns(res, scale)
            inVisualSpace(pgs[i], (_w, h) => drawInvisibleText(pgs[i], font, runs, h))
            all.push(res.text)
            done++
            page.cleanup()
          }
          await closePdf(js)
          if (!done && onlyScanned) throw new Error('Every page already has selectable text – nothing to recognise. Turn off “Skip pages that already have text” to OCR anyway.')
          return { bytes: await saveDoc(doc), text: all.join('\n\n') }
        }, 'Preparing OCR')
        if (r) setOut([pdfOut(r.bytes, `${baseName(pdf.input!.file.name)}-searchable.pdf`, 'searchable'), { name: `${baseName(pdf.input!.file.name)}.txt`, blob: new Blob([r.text], { type: 'text/plain;charset=utf-8' }) }])
      }} />
      <Results files={out} onReset={() => { setOut([]); pdf.reset() }} />
    </div>
  )
}
