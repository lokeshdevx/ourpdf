'use client'

import { useEffect, useRef, useState } from 'react'
import { Copy, Download, Eraser, Link2, Pen, Send, Trash2, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SITE } from '@/lib/site'
import { saveBlob } from '@/services/download'
import { acceptAnswer, answerOffer, createOffer, receiver, sendFile, type Incoming, type Peer } from '@/tools/lib/p2p'
import { formatBytes } from '@/tools/lib/pdf'
import { FileDrop, Note, Panel, TextArea, Toggle } from '../kit'

/* ------------------------------------------------------- connection UI */

/** Invite links always point at the public site in production builds (localhost while developing). */
function inviteOrigin(): string {
  return process.env.NODE_ENV === 'production' ? SITE.url.replace(/\/+$/, '') : window.location.origin
}

type Phase = 'start' | 'offered' | 'answered' | 'connected' | 'closed'

/** Two-step manual pairing. The invite travels in the URL #fragment, which browsers never send to any server. */
function useConnection(label: string) {
  const [phase, setPhase] = useState<Phase>('start')
  const [code, setCode] = useState('')
  const [peer, setPeer] = useState<Peer | null>(null)
  const [channel, setChannel] = useState<RTCDataChannel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wire = (p: Peer) => {
    setPeer(p)
    p.pc.addEventListener('connectionstatechange', () => {
      if (['failed', 'closed', 'disconnected'].includes(p.pc.connectionState)) setPhase('closed')
    })
    void p.channel.then((ch) => {
      setChannel(ch)
      setPhase('connected')
      ch.addEventListener('close', () => setPhase('closed'))
    })
  }
  const invite = async (stun: boolean) => {
    setError(null)
    try {
      const r = await createOffer(stun, label)
      wire(r.peer)
      setCode(r.code)
      setPhase('offered')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const join = async (offer: string) => {
    setError(null)
    try {
      const r = await answerOffer(offer)
      wire(r.peer)
      setCode(r.code)
      setPhase('answered')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const finish = async (answer: string) => {
    setError(null)
    try {
      await acceptAnswer(peer!, answer)
    } catch (e) {
      setError((e as Error).message || 'That code is not valid.')
    }
  }
  const close = () => {
    peer?.pc.close()
    setPhase('start')
    setPeer(null)
    setChannel(null)
    setCode('')
  }
  return { phase, code, channel, error, invite, join, finish, close }
}

function Pairing({ conn, path }: { conn: ReturnType<typeof useConnection>; path: string }) {
  const [stun, setStun] = useState(true)
  const [pasted, setPasted] = useState('')
  const [hashOffer, setHashOffer] = useState<string | null>(null)
  useEffect(() => {
    const m = /#join=([\w-]+)/.exec(window.location.hash)
    if (m) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- an invite link was opened
      setHashOffer(m[1])
      history.replaceState(null, '', window.location.pathname)
    }
  }, [])
  const copy = (s: string) => { void navigator.clipboard.writeText(s); toast.success('Copied – send it to the other person') }
  const link = conn.code ? `${inviteOrigin()}${path}#join=${conn.code}` : ''
  if (conn.phase === 'connected') return <Note tone="ok"><Wifi className="mr-1 inline size-4" aria-hidden /> Connected directly to the other browser (encrypted). <button type="button" className="ml-2 underline" onClick={conn.close}>Disconnect</button></Note>
  return (
    <Panel title="Connect">
      <div className="space-y-4">
        {conn.phase === 'closed' && <Note tone="warn"><WifiOff className="mr-1 inline size-4" aria-hidden /> The connection closed. <button type="button" className="underline" onClick={conn.close}>Start again</button></Note>}
        {conn.phase === 'start' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border p-4">
              <p className="font-semibold">Start a session</p>
              <p className="text-sm text-muted-foreground">Creates an invite link to send to the other person.</p>
              <Toggle label="Allow connections across different networks" hint="Uses a public STUN server only to discover your public IP address. Off = same Wi-Fi / LAN only, no third party at all." checked={stun} onChange={setStun} />
              <Button onClick={() => void conn.invite(stun)}><Link2 className="mr-2 size-4" aria-hidden /> Create invite</Button>
            </div>
            <div className="space-y-3 rounded-xl border p-4">
              <p className="font-semibold">Join a session</p>
              {hashOffer ? <><p className="text-sm">You opened an invite link.</p><Button onClick={() => void conn.join(hashOffer)}>Accept invite</Button></> : <><TextArea label="Paste the invite link or code" value={pasted} onChange={setPasted} rows={3} /><Button variant="outline" disabled={!pasted.trim()} onClick={() => void conn.join(pasted.replace(/^.*#join=/, '').trim())}>Join</Button></>}
            </div>
          </div>
        )}
        {conn.phase === 'offered' && (
          <div className="space-y-3">
            <p className="text-sm"><strong>Step 1.</strong> Send this invite link to the other person (chat, email…):</p>
            <div className="flex gap-2"><input readOnly value={link} aria-label="Invite link" className="h-10 min-w-0 flex-1 rounded-lg border bg-muted px-3 font-mono text-xs" /><Button onClick={() => copy(link)}><Copy className="mr-1.5 size-4" aria-hidden /> Copy</Button></div>
            <p className="text-sm"><strong>Step 2.</strong> They send back a reply code. Paste it here:</p>
            <div className="flex gap-2"><input value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Reply code" placeholder="Reply code" className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 font-mono text-xs" /><Button disabled={!pasted.trim()} onClick={() => void conn.finish(pasted.trim())}>Connect</Button></div>
          </div>
        )}
        {conn.phase === 'answered' && (
          <div className="space-y-3">
            <p className="text-sm">Send this reply code back to the person who invited you. You’ll connect as soon as they paste it.</p>
            <div className="flex gap-2"><input readOnly value={conn.code} aria-label="Reply code" className="h-10 min-w-0 flex-1 rounded-lg border bg-muted px-3 font-mono text-xs" /><Button onClick={() => copy(conn.code)}><Copy className="mr-1.5 size-4" aria-hidden /> Copy</Button></div>
            <p className="animate-pulse text-sm text-muted-foreground">Waiting for the connection…</p>
          </div>
        )}
        {conn.error && <Note tone="warn">{conn.error}</Note>}
      </div>
    </Panel>
  )
}

/* -------------------------------------------------------------- share */

export function P2PShare() {
  const conn = useConnection('ourpdf-files')
  const [incoming, setIncoming] = useState<Incoming[]>([])
  const [outgoing, setOutgoing] = useState<{ name: string; size: number; sent: number }[]>([])
  useEffect(() => {
    if (!conn.channel) return
    const ch = conn.channel
    const h = receiver(setIncoming)
    ch.addEventListener('message', h)
    return () => ch.removeEventListener('message', h)
  }, [conn.channel])
  const send = async (files: File[]) => {
    for (const f of files) {
      const idx = outgoing.length
      setOutgoing((o) => [...o, { name: f.name, size: f.size, sent: 0 }])
      try {
        await sendFile(conn.channel!, f, (sent) => setOutgoing((o) => o.map((x, i) => (i === idx ? { ...x, sent } : x))))
      } catch (e) {
        toast.error((e as Error).message)
        break
      }
    }
  }
  return (
    <div className="space-y-6">
      <Pairing conn={conn} path="/p2p-file-share" />
      {conn.phase === 'connected' && (
        <Panel title="Send files"><FileDrop accept="*/*" multiple label="Choose files to send" hint="any type, any size" onFiles={(f) => void send(f)} /></Panel>
      )}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <Panel title="Transfers">
          <ul className="space-y-2 text-sm">
            {outgoing.map((o, i) => <li key={`o${i}`} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><span className="truncate"><Send className="mr-1.5 inline size-4" aria-hidden />{o.name}</span><span className="text-muted-foreground">{o.sent >= o.size ? 'Sent' : `${Math.round((o.sent / Math.max(1, o.size)) * 100)}%`}</span></div><div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(o.sent / Math.max(1, o.size)) * 100}%` }} /></div></li>)}
            {incoming.map((f) => <li key={f.meta.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><span className="truncate"><Download className="mr-1.5 inline size-4" aria-hidden />{f.meta.name} · {formatBytes(f.meta.size)}</span>{f.blob ? <Button size="sm" onClick={() => void saveBlob(f.blob!, f.meta.name)}>Save</Button> : <span className="text-muted-foreground">{Math.round((f.received / Math.max(1, f.meta.size)) * 100)}%</span>}</div>{!f.blob && <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-green-600" style={{ width: `${(f.received / Math.max(1, f.meta.size)) * 100}%` }} /></div>}</li>)}
          </ul>
        </Panel>
      )}
      <Note>Files go straight from one browser to the other over an end-to-end encrypted WebRTC channel. No server stores or relays them. Keep this tab open until the transfer finishes.</Note>
    </div>
  )
}

/* --------------------------------------------------------- whiteboard */

interface Stroke { id: string; color: string; width: number; pts: [number, number][]; erase?: boolean }
const COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea']

export function Whiteboard() {
  const conn = useConnection('ourpdf-board')
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const cur = useRef<Stroke | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(3)
  const [erase, setErase] = useState(false)
  const [peerCursor, setPeerCursor] = useState<[number, number] | null>(null)
  const W = 1600, H = 1000
  const draw = (s: Stroke) => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || !s.pts.length) return
    ctx.save()
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.erase ? s.width * 6 : s.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)))
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] * W + 0.1, s.pts[0][1] * H)
    ctx.stroke()
    ctx.restore()
  }
  const redraw = () => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    strokes.current.forEach(draw)
  }
  const send = (m: unknown) => {
    if (conn.channel?.readyState === 'open') conn.channel.send(JSON.stringify(m))
  }
  useEffect(() => {
    if (!conn.channel) return
    const ch = conn.channel
    const on = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return
      const m = JSON.parse(e.data)
      if (m.t === 'stroke') {
        strokes.current.push(m.s)
        draw(m.s)
      } else if (m.t === 'clear') {
        strokes.current = []
        redraw()
      } else if (m.t === 'cursor') setPeerCursor(m.p)
      else if (m.t === 'sync') {
        strokes.current = m.strokes
        redraw()
      }
    }
    ch.addEventListener('message', on)
    // share what is already on the board with the newcomer
    if (strokes.current.length) ch.send(JSON.stringify({ t: 'sync', strokes: strokes.current }))
    return () => ch.removeEventListener('message', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawing helpers only touch refs
  }, [conn.channel])
  const pos = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
  }
  const lastCursor = useRef(0)
  return (
    <div className="space-y-6">
      <Pairing conn={conn} path="/collab-whiteboard" />
      <Panel className="p-0 sm:p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-2">
          {COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => { setColor(c); setErase(false) }} className={cn('size-8 rounded-full border-2', color === c && !erase ? 'border-foreground' : 'border-transparent')} style={{ background: c }} />)}
          <select aria-label="Pen size" className="h-9 rounded-lg border bg-background px-2 text-sm" value={width} onChange={(e) => setWidth(Number(e.target.value))}>{[2, 3, 5, 8, 14].map((w) => <option key={w} value={w}>{w}px</option>)}</select>
          <Button variant={erase ? 'default' : 'outline'} size="sm" onClick={() => setErase(!erase)}>{erase ? <Pen className="mr-1.5 size-4" aria-hidden /> : <Eraser className="mr-1.5 size-4" aria-hidden />}{erase ? 'Pen' : 'Eraser'}</Button>
          <Button variant="ghost" size="sm" onClick={() => { strokes.current = []; redraw(); send({ t: 'clear' }) }}><Trash2 className="mr-1.5 size-4" aria-hidden /> Clear</Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => canvas.current?.toBlob((b) => { if (b) void saveBlob(b, 'whiteboard.png') })}><Download className="mr-1.5 size-4" aria-hidden /> PNG</Button>
          <span className={cn('text-xs', conn.phase === 'connected' ? 'text-green-600' : 'text-muted-foreground')}>{conn.phase === 'connected' ? '● live' : 'solo (connect to draw together)'}</span>
        </div>
        <div className="relative">
          <canvas ref={canvas} width={W} height={H} className="block w-full touch-none bg-white" style={{ aspectRatio: `${W} / ${H}`, cursor: 'crosshair' }} aria-label="Whiteboard"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); cur.current = { id: crypto.randomUUID(), color, width, erase, pts: [pos(e)] }; draw(cur.current) }}
            onPointerMove={(e) => {
              const p = pos(e)
              if (Date.now() - lastCursor.current > 50) { lastCursor.current = Date.now(); send({ t: 'cursor', p }) }
              if (!cur.current) return
              cur.current.pts.push(p)
              const ctx = canvas.current!.getContext('2d')!
              const pts = cur.current.pts
              ctx.save()
              ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
              ctx.strokeStyle = color
              ctx.lineWidth = erase ? width * 6 : width
              ctx.lineCap = 'round'
              ctx.beginPath()
              ctx.moveTo(pts[pts.length - 2][0] * W, pts[pts.length - 2][1] * H)
              ctx.lineTo(p[0] * W, p[1] * H)
              ctx.stroke()
              ctx.restore()
            }}
            onPointerUp={() => { if (cur.current) { strokes.current.push(cur.current); send({ t: 'stroke', s: cur.current }); cur.current = null } }} />
          {peerCursor && conn.phase === 'connected' && <span className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500 ring-2 ring-white" style={{ left: `${peerCursor[0] * 100}%`, top: `${peerCursor[1] * 100}%` }} aria-hidden />}
        </div>
      </Panel>
      <Note>Drawings travel directly between the connected browsers. Nothing is stored on a server – download a PNG to keep the board.</Note>
    </div>
  )
}
