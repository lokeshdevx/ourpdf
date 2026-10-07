'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Camera, Check, ImagePlus, RotateCw, ScanLine, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { imagesToPdfBlob, type PageSizeName } from '@/services/convert/to-pdf'
import { canvasBlob, loadImage } from '@/tools/lib/pdf'
import { applyFilter, detectQuad, quadSize, rotateCanvas, toCanvas, warp, type Quad, type ScanFilter } from '@/tools/lib/scan'
import { Grid, Note, Panel, Results, RunBar, Segmented, Select, useTask, type OutFile } from '../kit'

interface ScanPage { id: string; src: HTMLCanvasElement; quad: Quad; filter: ScanFilter; rotate: 0 | 90 | 180 | 270; preview?: string }

const FILTERS: readonly (readonly [ScanFilter, string])[] = [['magic', 'Magic colour'], ['bw', 'Black & white'], ['grayscale', 'Grayscale'], ['enhance', 'Enhanced'], ['original', 'Original']]

async function processPage(p: ScanPage, maxSide = 2400): Promise<HTMLCanvasElement> {
  const { w, h } = quadSize(p.quad, maxSide)
  let c = applyFilter(warp(p.src, p.quad, w, h), p.filter)
  if (p.rotate === 90) c = rotateCanvas(c, 90)
  else if (p.rotate === 180) c = rotateCanvas(c, 180)
  else if (p.rotate === 270) c = rotateCanvas(c, -90)
  return c
}

/** Live camera with a capture button. */
function CameraView({ onCapture, onClose }: { onCapture: (c: HTMLCanvasElement) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [count, setCount] = useState(0)
  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })
      .then((s) => {
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
      })
      .catch((e) => setError(e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, or choose photos instead.' : 'No camera is available. Choose photos instead.'))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])
  const snap = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    onCapture(toCanvas(v, v.videoWidth, v.videoHeight))
    setCount((c) => c + 1)
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="Camera scanner">
      <div className="relative flex-1 overflow-hidden">
        {error ? <p className="p-6 text-center text-white">{error}</p> : <video ref={video} playsInline muted className="size-full object-contain" />}
        {flash && <div className="absolute inset-0 bg-white/70" />}
        <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-white/40" />
      </div>
      <div className="flex items-center justify-between gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" onClick={onClose}><X className="mr-1.5 size-4" aria-hidden /> Close</Button>
        <button type="button" onClick={snap} disabled={!!error} aria-label="Capture page" className="grid size-18 place-items-center rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-40"><span className="size-14 rounded-full bg-white" /></button>
        <Button onClick={onClose} disabled={!count}><Check className="mr-1.5 size-4" aria-hidden /> Done ({count})</Button>
      </div>
    </div>
  )
}

/** Image with four draggable corner handles. */
function CornerEditor({ page, onChange }: { page: ScanPage; onChange: (q: Quad) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState('')
  const drag = useRef<number | null>(null)
  useEffect(() => {
    let u = ''
    void canvasBlob(page.src, 'image/jpeg', 0.8).then((b) => {
      u = URL.createObjectURL(b)
      setUrl(u)
    })
    return () => URL.revokeObjectURL(u)
  }, [page.src])
  const W = page.src.width, H = page.src.height
  const move = (e: React.PointerEvent) => {
    if (drag.current === null || !box.current) return
    const r = box.current.getBoundingClientRect()
    const x = Math.min(W, Math.max(0, ((e.clientX - r.left) / r.width) * W))
    const y = Math.min(H, Math.max(0, ((e.clientY - r.top) / r.height) * H))
    const q = [...page.quad] as Quad
    q[drag.current] = { x, y }
    onChange(q)
  }
  const pts = page.quad.map((p) => `${(p.x / W) * 100},${(p.y / H) * 100}`).join(' ')
  return (
    <div ref={box} className="relative mx-auto touch-none select-none" style={{ aspectRatio: `${W} / ${H}`, maxHeight: '60vh' }} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
      { }
      {url && <img src={url} alt="Captured page" className="absolute inset-0 size-full rounded-lg object-fill" draggable={false} />}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <polygon points={pts} fill="rgba(59,130,246,0.15)" stroke="rgb(59,130,246)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {page.quad.map((p, i) => (
        <button key={i} type="button" aria-label={['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'][i] + ' corner'} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = i }} onPointerMove={move} onPointerUp={() => (drag.current = null)}
          className="absolute size-7 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-primary shadow-lg active:cursor-grabbing" style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }} />
      ))}
    </div>
  )
}

export function ScanDocument() {
  const [pages, setPages] = useState<ScanPage[]>([])
  const [camera, setCamera] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [size, setSize] = useState<'fit' | PageSizeName>('A4')
  const [quality, setQuality] = useState<'standard' | 'high'>('standard')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const fileInput = useRef<HTMLInputElement>(null)

  const add = async (c: HTMLCanvasElement) => {
    const quad = detectQuad(c, c.width, c.height)
    const p: ScanPage = { id: crypto.randomUUID(), src: c, quad, filter: 'magic', rotate: 0 }
    p.preview = URL.createObjectURL(await canvasBlob(await processPage(p, 500), 'image/jpeg', 0.7))
    setPages((prev) => [...prev, p])
  }
  const update = async (id: string, patch: Partial<ScanPage>) => {
    const cur = pages.find((p) => p.id === id)
    if (!cur) return
    const next = { ...cur, ...patch }
    if (cur.preview) URL.revokeObjectURL(cur.preview)
    next.preview = URL.createObjectURL(await canvasBlob(await processPage(next, 500), 'image/jpeg', 0.7))
    setPages((prev) => prev.map((p) => (p.id === id ? next : p)))
  }
  const editPage = pages.find((p) => p.id === editing)

  return (
    <div className="space-y-6">
      {camera && <CameraView onCapture={(c) => void add(c)} onClose={() => setCamera(false)} />}
      <Panel title={pages.length ? `${pages.length} page${pages.length === 1 ? '' : 's'} scanned` : 'Capture pages'}>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => setCamera(true)}><Camera className="mr-2 size-5" aria-hidden /> {pages.length ? 'Scan more' : 'Open camera'}</Button>
          <Button size="lg" variant="outline" onClick={() => fileInput.current?.click()}><ImagePlus className="mr-2 size-5" aria-hidden /> Choose photos</Button>
          <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose photos" onChange={async (e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            await task.run(async (p) => {
              for (let i = 0; i < files.length; i++) {
                const img = await loadImage(files[i])
                await add(toCanvas(img, img.naturalWidth, img.naturalHeight))
                p((i + 1) / files.length, 'Detecting page edges')
              }
            }, 'Loading photos')
          }} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Page edges are detected automatically – drag the corners to adjust. Everything is processed on this device; nothing is uploaded.</p>
      </Panel>

      {editPage && (
        <Panel title="Adjust page" actions={<Button size="sm" onClick={() => setEditing(null)}><Check className="mr-1.5 size-4" aria-hidden /> Done</Button>}>
          <div className="space-y-4">
            <CornerEditor page={editPage} onChange={(q) => setPages((prev) => prev.map((p) => (p.id === editPage.id ? { ...p, quad: q } : p)))} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void update(editPage.id, { quad: detectQuad(editPage.src, editPage.src.width, editPage.src.height) })}><ScanLine className="mr-1.5 size-4" aria-hidden /> Auto-detect</Button>
              <Button variant="outline" size="sm" onClick={() => { const W = editPage.src.width, H = editPage.src.height; void update(editPage.id, { quad: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }] }) }}>Whole image</Button>
              <Button variant="outline" size="sm" onClick={() => void update(editPage.id, { quad: editPage.quad })}>Update preview</Button>
            </div>
          </div>
        </Panel>
      )}

      {pages.length > 0 && (
        <Panel title="Pages">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((p, i) => (
              <li key={p.id} className={cn('space-y-2 rounded-xl border bg-background p-3', editing === p.id && 'ring-2 ring-primary')}>
                <button type="button" onClick={() => setEditing(p.id)} className="grid h-48 w-full place-items-center overflow-hidden rounded-lg bg-muted" aria-label={`Adjust page ${i + 1}`}>
                  { }
                  {p.preview && <img src={p.preview} alt={`Page ${i + 1}`} className="max-h-48 max-w-full shadow" />}
                </button>
                <select aria-label={`Filter for page ${i + 1}`} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" value={p.filter} onChange={(e) => void update(p.id, { filter: e.target.value as ScanFilter })}>
                  {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium">Page {i + 1}</span>
                  <span className="flex">
                    <Button variant="ghost" size="icon" aria-label="Rotate" onClick={() => void update(p.id, { rotate: (((p.rotate + 90) % 360) as ScanPage['rotate']) })}><RotateCw className="size-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => setPages((prev) => { const n = [...prev]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })}><ArrowUp className="size-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === pages.length - 1} onClick={() => setPages((prev) => { const n = [...prev]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n })}><ArrowDown className="size-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Delete page" onClick={() => { if (editing === p.id) setEditing(null); setPages((prev) => prev.filter((x) => x.id !== p.id)) }}><Trash2 className="size-4" /></Button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="text-muted-foreground">Apply to all:</span>
            {FILTERS.map(([v, l]) => <Button key={v} variant="outline" size="sm" onClick={async () => { for (const p of pages) await update(p.id, { filter: v }) }}>{l}</Button>)}
          </div>
        </Panel>
      )}

      {pages.length > 0 && (
        <Panel title="Export">
          <Grid>
            <Select label="Page size" value={size} onChange={setSize} options={[['A4', 'A4'], ['Letter', 'US Letter'], ['Legal', 'US Legal'], ['fit', 'Same as scan']]} />
            <Segmented label="Quality" value={quality} onChange={setQuality} options={[['standard', 'Standard (smaller)'], ['high', 'High']]} />
          </Grid>
          <div className="mt-4"><Note>Want selectable, searchable text? Open the result in <Link className="underline" href="/editor?tool=ocr">OCR</Link> after exporting.</Note></div>
        </Panel>
      )}
      <RunBar task={task} label="Create PDF" disabled={!pages.length} onRun={async () => {
        const r = await task.run(async (p) => {
          const blobs: Blob[] = []
          for (let i = 0; i < pages.length; i++) {
            const c = await processPage(pages[i], quality === 'high' ? 3000 : 2000)
            blobs.push(await canvasBlob(c, 'image/jpeg', quality === 'high' ? 0.9 : 0.78))
            p((i + 1) / pages.length * 0.8, `Processing page ${i + 1}`)
          }
          return imagesToPdfBlob(blobs, { pageSize: size, orientation: 'auto', margin: 0, dpi: quality === 'high' ? 300 : 200 })
        }, 'Building PDF')
        if (r) setOut([{ name: `scan-${new Date().toISOString().slice(0, 10)}.pdf`, blob: r, note: `${pages.length} page${pages.length === 1 ? '' : 's'}` }])
      }} />
      <Results files={out} onReset={() => { setOut([]); setPages([]) }} />
    </div>
  )
}
