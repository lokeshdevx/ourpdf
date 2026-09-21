'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Eraser, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ColorField } from '@/components/editor/controls'
import { cropTransparent, renderTypedSignature, TYPED_STYLES, whiteToTransparent } from '@/lib/signature'
import { addAsset } from '@/services/assets'
import { pickFiles } from '@/services/import'
import { armImage } from '@/services/insert'
import { deleteSignature, listSignatures, saveSignature, signatureAsAsset } from '@/services/storage/signatures'
import type { SignatureRecord } from '@/services/storage/db'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell } from './DialogShell'

/** Simple smoothed signature pad (pointer events → canvas). No external dependency. */
function Pad({ color, onChange, padRef }: { color: string; onChange: (empty: boolean) => void; padRef: React.MutableRefObject<HTMLCanvasElement | null> }) {
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const pos = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
    const c = e.currentTarget as HTMLCanvasElement
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }
  return (
    <canvas
      ref={padRef}
      width={900}
      height={300}
      data-testid="signature-pad"
      aria-label="Draw your signature here"
      className="w-full touch-none rounded-md border bg-white"
      style={{ cursor: 'crosshair', aspectRatio: '3 / 1' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); onChange(false) }}
      onPointerMove={(e) => {
        if (!drawing.current) return
        const ctx = e.currentTarget.getContext('2d')!
        const p = pos(e)
        const l = last.current ?? p
        ctx.strokeStyle = color
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(l.x, l.y)
        ctx.quadraticCurveTo(l.x, l.y, (l.x + p.x) / 2, (l.y + p.y) / 2)
        ctx.stroke()
        last.current = p
      }}
      onPointerUp={() => { drawing.current = false; last.current = null }}
      onPointerCancel={() => { drawing.current = false }}
    />
  )
}

export default function SignDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const [tab, setTab] = useState('draw')
  const [role, setRole] = useState<'signature' | 'initials'>('signature')
  const [color, setColor] = useState('#1d3a8a')
  const [typed, setTyped] = useState('')
  const [style, setStyle] = useState(TYPED_STYLES[0].id)
  const [uploaded, setUploaded] = useState<{ blob: Blob; width: number; height: number; url: string } | null>(null)
  const [empty, setEmpty] = useState(true)
  const [save, setSave] = useState(true)
  const [saved, setSaved] = useState<SignatureRecord[]>([])
  const [typedPreview, setTypedPreview] = useState<string | null>(null)
  const padRef = useRef<HTMLCanvasElement | null>(null)

  const refresh = useCallback(() => void listSignatures().then(setSaved), [])
  useEffect(refresh, [refresh])
  useEffect(() => {
    let alive = true
    let url: string | null = null
    if (typed.trim()) {
      renderTypedSignature(typed, TYPED_STYLES.find((s) => s.id === style)!, color, 64).then((r) => { if (alive) { url = URL.createObjectURL(r.blob); setTypedPreview(url) } }).catch(() => {})
    }
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [typed, style, color])
  useEffect(() => () => { if (uploaded) URL.revokeObjectURL(uploaded.url) }, [uploaded])

  const place = async (blob: Blob, width: number, height: number, name: string, persist: boolean) => {
    if (persist) await saveSignature(blob, { name, kind: tab === 'type' ? 'typed' : tab === 'upload' ? 'uploaded' : 'drawn', role, width, height }).catch(() => {})
    const info = await addAsset(blob, name)
    armImage(info.id, role, role === 'initials' ? 80 : 180)
    close()
  }

  const placeCurrent = async () => {
    try {
      if (tab === 'draw') {
        const c = padRef.current
        if (!c || empty) return void toast.error('Draw your signature first')
        const r = await cropTransparent(c)
        await place(r.blob, r.width, r.height, role === 'initials' ? 'Initials' : 'Signature', save)
      } else if (tab === 'type') {
        if (!typed.trim()) return void toast.error('Type your name first')
        const r = await renderTypedSignature(typed, TYPED_STYLES.find((s) => s.id === style)!, color, 96)
        await place(r.blob, r.width, r.height, typed, save)
      } else if (tab === 'upload' && uploaded) await place(uploaded.blob, uploaded.width, uploaded.height, 'Signature image', save)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <DialogShell
      id="sign"
      title="Sign"
      description="Create a signature or initials, then click on the page to place it. You can move, resize and rotate it afterwards."
      size="lg"
      footer={<><Button variant="outline" onClick={close}>Cancel</Button>{tab !== 'saved' && <Button onClick={() => void placeCurrent()} data-testid="sign-use">Use &amp; place</Button>}</>}
    >
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertDescription className="text-xs">This adds a <strong>visual e-signature</strong> (an image). It is <strong>not</strong> a certificate-based digital signature and does not cryptographically prove identity or detect later changes.</AlertDescription>
      </Alert>
      <div className="flex items-center gap-4">
        <Label className="flex items-center gap-2 font-normal"><Checkbox checked={role === 'initials'} onCheckedChange={(v) => setRole(v === true ? 'initials' : 'signature')} /> This is my initials</Label>
        <ColorField value={color} onChange={(v) => v && setColor(v)} label="Ink colour" />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4"><TabsTrigger value="draw" data-testid="sign-tab-draw">Draw</TabsTrigger><TabsTrigger value="type" data-testid="sign-tab-type">Type</TabsTrigger><TabsTrigger value="upload">Upload</TabsTrigger><TabsTrigger value="saved" data-testid="sign-tab-saved">Saved ({saved.length})</TabsTrigger></TabsList>
        <TabsContent value="draw" className="space-y-2 pt-3">
          <Pad color={color} padRef={padRef} onChange={setEmpty} />
          <Button size="sm" variant="outline" onClick={() => { const c = padRef.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); setEmpty(true) }}><Eraser className="size-3.5" /> Clear</Button>
        </TabsContent>
        <TabsContent value="type" className="space-y-3 pt-3">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your name" aria-label="Typed signature" data-testid="sign-typed" />
          <div className="grid grid-cols-2 gap-2">
            {TYPED_STYLES.map((s) => (
              <button key={s.id} type="button" onClick={() => setStyle(s.id)} aria-pressed={style === s.id} className={`rounded-md border p-2 text-left text-xl ${style === s.id ? 'border-primary bg-primary/5' : ''}`} style={{ font: s.font.replace('%s', '26'), color }}>{typed || 'Your name'}</button>
            ))}
          </div>
          {typed.trim() && typedPreview && <img src={typedPreview} alt="Preview" className="h-16 rounded border bg-white p-1" />}
        </TabsContent>
        <TabsContent value="upload" className="space-y-2 pt-3">
          <Button variant="outline" onClick={async () => { const f = (await pickFiles({ accept: 'image/*', multiple: false }))[0]; if (!f) return; try { const r = await whiteToTransparent(f); setUploaded({ ...r, url: URL.createObjectURL(r.blob) }) } catch (e) { toast.error((e as Error).message) } }}><Upload className="size-4" /> Choose signature image…</Button>
          {uploaded &&   <img src={uploaded.url} alt="Uploaded signature" className="h-24 rounded border bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-1" />}
          <p className="text-xs text-muted-foreground">Photograph your signature on white paper. The white background is removed automatically.</p>
        </TabsContent>
        <TabsContent value="saved" className="pt-3">
          {!saved.length && <p className="text-sm text-muted-foreground">No saved signatures. Tick “Save for later” when creating one.</p>}
          <ul className="grid gap-2 sm:grid-cols-2">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-md border p-2">
                <SavedPreview blob={s.blob} />
                <div className="min-w-0 flex-1 text-xs"><div className="truncate font-medium">{s.name}</div><div className="text-muted-foreground">{s.role}</div></div>
                <Button size="sm" onClick={async () => { const info = await signatureAsAsset(s); armImage(info.id, s.role, s.role === 'initials' ? 80 : 180); close() }} data-testid="use-saved-signature">Use</Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete saved signature ${s.name}`} onClick={async () => { await deleteSignature(s.id); refresh() }}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
      {tab !== 'saved' && <Label className="flex items-center gap-2 font-normal"><Checkbox checked={save} onCheckedChange={(v) => setSave(v === true)} /> Save for later (stored only in this browser)</Label>}
    </DialogShell>
  )
}

function SavedPreview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL is an external resource owned by this effect
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
   
  return url ? <img src={url} alt="" className="h-10 w-20 rounded border bg-white object-contain" /> : null
}
