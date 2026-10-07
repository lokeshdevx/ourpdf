'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canvasBlob, loadImage } from '@/tools/lib/pdf'
import { toCanvas } from '@/tools/lib/scan'
import { ColorInput, Grid, Note, Panel, Range, Results, Segmented, Toggle, type OutFile } from '../kit'

interface Params { cx: number; cy: number; rx: number; ry: number; threshold: number; detail: number; ink: string; invert: boolean; oval: boolean; size: number }

/**
 * Turns a photo of a fingertip into a clean ink-style thumb impression: local contrast normalisation (divide by a
 * blurred copy) brings out ridges regardless of lighting, a threshold maps ridges to ink, and everything else becomes
 * transparent.
 */
function processThumb(src: HTMLCanvasElement, p: Params): HTMLCanvasElement {
  const W = src.width, H = src.height
  const rx = p.rx * W, ry = p.ry * W
  const x0 = Math.max(0, Math.round(p.cx * W - rx)), y0 = Math.max(0, Math.round(p.cy * H - ry))
  const w = Math.min(W - x0, Math.round(rx * 2)), h = Math.min(H - y0, Math.round(ry * 2))
  const k = Math.min(1, p.size / Math.max(w, h))
  const ow = Math.max(8, Math.round(w * k)), oh = Math.max(8, Math.round(h * k))
  const crop = document.createElement('canvas')
  crop.width = ow
  crop.height = oh
  const cctx = crop.getContext('2d', { willReadFrequently: true })!
  cctx.filter = 'grayscale(1)'
  cctx.drawImage(src, x0, y0, w, h, 0, 0, ow, oh)
  const blur = document.createElement('canvas')
  blur.width = ow
  blur.height = oh
  const bctx = blur.getContext('2d', { willReadFrequently: true })!
  bctx.filter = `blur(${Math.max(2, Math.round(ow / (10 + p.detail * 30)))}px) grayscale(1)`
  bctx.drawImage(crop, 0, 0)
  const g = cctx.getImageData(0, 0, ow, oh)
  const b = bctx.getImageData(0, 0, ow, oh).data
  const out = new ImageData(ow, oh)
  const [ir, ig, ib] = [1, 3, 5].map((i) => parseInt(p.ink.slice(i, i + 2), 16))
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const i = (y * ow + x) * 4
    const v = g.data[i] / Math.max(1, b[i]) // < 1 on ridges (darker than surroundings)
    let a = (1 - v) * 255 * (2 + p.detail * 6) - (p.threshold - 0.5) * 255
    if (p.invert) a = 255 - a
    a = Math.max(0, Math.min(255, a))
    if (p.oval) {
      const dx = (x - ow / 2) / (ow / 2), dy = (y - oh / 2) / (oh / 2)
      const r = dx * dx + dy * dy
      if (r > 1) a = 0
      else if (r > 0.82) a *= (1 - r) / 0.18
    }
    out.data[i] = ir
    out.data[i + 1] = ig
    out.data[i + 2] = ib
    out.data[i + 3] = a
  }
  const res = document.createElement('canvas')
  res.width = ow
  res.height = oh
  res.getContext('2d')!.putImageData(out, 0, 0)
  return res
}

export function ThumbmarkMaker() {
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [srcUrl, setSrcUrl] = useState('')
  const [p, setP] = useState<Params>({ cx: 0.5, cy: 0.5, rx: 0.22, ry: 0.3, threshold: 0.5, detail: 0.5, ink: '#1a3c8f', invert: false, oval: true, size: 600 })
  const [preview, setPreview] = useState('')
  const [out, setOut] = useState<OutFile[]>([])
  const [camera, setCamera] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!src) return
    const t = setTimeout(() => setPreview(processThumb(src, { ...p, size: 400 }).toDataURL('image/png')), 60)
    return () => clearTimeout(t)
  }, [src, p])

  useEffect(() => {
    if (!camera) return
    let stream: MediaStream | null = null
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } } }).then((s) => {
      stream = s
      if (video.current) {
        video.current.srcObject = s
        void video.current.play()
      }
    }).catch(() => setCamera(false))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [camera])

  const setSource = async (c: HTMLCanvasElement) => {
    setSrc(c)
    setOut([])
    setSrcUrl(URL.createObjectURL(await canvasBlob(c, 'image/jpeg', 0.8)))
  }

  return (
    <div className="space-y-6">
      <Panel title="1 · Photograph your thumb">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setCamera(true)}><Camera className="mr-2 size-4" aria-hidden /> Use camera</Button>
            <Button variant="outline" onClick={() => file.current?.click()}><ImagePlus className="mr-2 size-4" aria-hidden /> Choose photo</Button>
            <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Choose photo" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const img = await loadImage(f); await setSource(toCanvas(img, img.naturalWidth, img.naturalHeight, 2400)) } }} />
          </div>
          <Note>Tips: press your thumb lightly on a dark surface or hold it close to the lens in bright, even light (no flash glare). Fill the frame with the fingertip and keep it in focus.</Note>
          {camera && (
            <div className="space-y-3">
              <video ref={video} playsInline muted className="mx-auto max-h-96 rounded-xl bg-black" />
              <div className="flex justify-center gap-2">
                <Button onClick={async () => { const v = video.current; if (v?.videoWidth) { await setSource(toCanvas(v, v.videoWidth, v.videoHeight, 2400)); setCamera(false) } }}>Capture</Button>
                <Button variant="ghost" onClick={() => setCamera(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </Panel>
      {src && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="2 · Frame the fingertip">
            <div className="relative mx-auto max-w-md overflow-hidden rounded-lg" style={{ aspectRatio: `${src.width} / ${src.height}` }}>
              { }
              {srcUrl && <img src={srcUrl} alt="Your photo" className="absolute inset-0 size-full object-fill" />}
              <div className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={{ left: `${(p.cx - p.rx) * 100}%`, top: `calc(${p.cy * 100}% - ${p.ry * 100 * (src.width / src.height)}%)`, width: `${p.rx * 200}%`, height: `${p.ry * 200 * (src.width / src.height)}%`, borderRadius: p.oval ? '50%' : '8px' }} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Range label="Horizontal" value={p.cx} min={0.1} max={0.9} step={0.01} onChange={(v) => setP({ ...p, cx: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Range label="Vertical" value={p.cy} min={0.1} max={0.9} step={0.01} onChange={(v) => setP({ ...p, cy: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Range label="Width" value={p.rx} min={0.05} max={0.5} step={0.01} onChange={(v) => setP({ ...p, rx: v })} format={(v) => `${Math.round(v * 200)}%`} />
              <Range label="Height" value={p.ry} min={0.05} max={0.7} step={0.01} onChange={(v) => setP({ ...p, ry: v })} format={(v) => `${Math.round(v * 200)}%`} />
            </div>
          </Panel>
          <Panel title="3 · Adjust the impression">
            <div className="grid h-72 place-items-center rounded-lg border bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:20px_20px]">
              { }
              {preview && <img src={preview} alt="Thumb impression preview" className="max-h-64 max-w-full" />}
            </div>
            <div className="mt-4 space-y-3">
              <Grid>
                <Range label="Ink amount" value={1 - p.threshold} min={0} max={1} step={0.02} onChange={(v) => setP({ ...p, threshold: 1 - v })} format={(v) => `${Math.round(v * 100)}%`} />
                <Range label="Ridge detail" value={p.detail} min={0} max={1} step={0.02} onChange={(v) => setP({ ...p, detail: v })} format={(v) => `${Math.round(v * 100)}%`} />
              </Grid>
              <div className="flex flex-wrap items-end gap-3">
                <Segmented label="Ink" value={p.ink} onChange={(v) => setP({ ...p, ink: v })} options={[['#1a3c8f', 'Blue'], ['#5b2a86', 'Violet'], ['#111111', 'Black']]} />
                <ColorInput label="Custom" value={p.ink} onChange={(v) => setP({ ...p, ink: v })} />
              </div>
              <Grid>
                <Toggle label="Oval shape" checked={p.oval} onChange={(v) => setP({ ...p, oval: v })} />
                <Toggle label="Invert (light ridges)" checked={p.invert} onChange={(v) => setP({ ...p, invert: v })} />
              </Grid>
            </div>
          </Panel>
        </div>
      )}
      {src && <Button size="lg" onClick={async () => {
        const c = processThumb(src, { ...p, size: 900 })
        setOut([{ name: 'thumb-impression.png', blob: await canvasBlob(c, 'image/png'), note: `${c.width} × ${c.height}px, transparent` }])
      }}>Create transparent PNG</Button>}
      <Results files={out} onReset={() => { setOut([]); setSrc(null) }} summary={<p className="text-muted-foreground">Place it on a form with <Link className="underline" href="/editor?tool=sign">Sign PDF</Link> → upload image. A visual thumb mark is not a biometric or legally verified signature.</p>} />
    </div>
  )
}
