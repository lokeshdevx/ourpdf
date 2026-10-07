/**
 * Serverless WebRTC: the two browsers exchange a connection code by any channel (chat, email, a link), then talk over an
 * encrypted (DTLS) data channel directly. No signalling server; an optional public STUN server only reveals the public
 * IP address so peers on different networks can find each other – file data never passes through it.
 */

export const PUBLIC_STUN = 'stun:stun.l.google.com:19302'

async function deflate(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function inflate(code: string): Promise<string> {
  const b64 = code.trim().replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

/** Waits until all ICE candidates are in the local description (non-trickle signalling: one code each way). */
function gathered(pc: RTCPeerConnection, timeout = 4000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const t = setTimeout(resolve, timeout)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t)
        resolve()
      }
    })
  })
}

export interface Peer {
  pc: RTCPeerConnection
  channel: Promise<RTCDataChannel>
}

function makePc(useStun: boolean) {
  return new RTCPeerConnection({ iceServers: useStun ? [{ urls: PUBLIC_STUN }] : [] })
}

/** Side A: creates an offer code to send to the other person. */
export async function createOffer(useStun: boolean, label = 'ourpdf'): Promise<{ peer: Peer; code: string }> {
  const pc = makePc(useStun)
  const ch = pc.createDataChannel(label, { ordered: true })
  ch.binaryType = 'arraybuffer'
  const channel = new Promise<RTCDataChannel>((resolve) => ch.addEventListener('open', () => resolve(ch)))
  await pc.setLocalDescription(await pc.createOffer())
  await gathered(pc)
  return { peer: { pc, channel }, code: await deflate(JSON.stringify({ t: 'o', s: pc.localDescription!.sdp, st: useStun })) }
}

/** Side A: applies the answer code received back. */
export async function acceptAnswer(peer: Peer, code: string) {
  const msg = JSON.parse(await inflate(code))
  if (msg.t !== 'a') throw new Error('That is not an answer code. Paste the code the other person sent back.')
  await peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.s })
}

/** Side B: turns a received offer code into an answer code to send back. */
export async function answerOffer(code: string): Promise<{ peer: Peer; code: string }> {
  let msg: { t: string; s: string; st: boolean }
  try {
    msg = JSON.parse(await inflate(code))
  } catch {
    throw new Error('That code is incomplete or damaged. Copy it again.')
  }
  if (msg.t !== 'o') throw new Error('That is not an invitation code.')
  const pc = makePc(msg.st)
  const channel = new Promise<RTCDataChannel>((resolve) => {
    pc.addEventListener('datachannel', (e) => {
      e.channel.binaryType = 'arraybuffer'
      if (e.channel.readyState === 'open') resolve(e.channel)
      else e.channel.addEventListener('open', () => resolve(e.channel))
    })
  })
  await pc.setRemoteDescription({ type: 'offer', sdp: msg.s })
  await pc.setLocalDescription(await pc.createAnswer())
  await gathered(pc)
  return { peer: { pc, channel }, code: await deflate(JSON.stringify({ t: 'a', s: pc.localDescription!.sdp })) }
}

/* ------------------------------------------------------- file transfer */

const CHUNK = 64 * 1024

export interface FileMeta { id: string; name: string; size: number; type: string; sha256?: string }

export async function sendFile(ch: RTCDataChannel, file: File, onProgress: (sent: number) => void): Promise<void> {
  const id = crypto.randomUUID()
  ch.send(JSON.stringify({ kind: 'file-start', id, name: file.name, size: file.size, type: file.type }))
  ch.bufferedAmountLowThreshold = 1 << 20
  let offset = 0
  while (offset < file.size) {
    if (ch.readyState !== 'open') throw new Error('The connection closed during the transfer.')
    if (ch.bufferedAmount > 8 << 20) await new Promise<void>((r) => ch.addEventListener('bufferedamountlow', () => r(), { once: true }))
    const buf = await file.slice(offset, offset + CHUNK).arrayBuffer()
    ch.send(buf)
    offset += buf.byteLength
    onProgress(offset)
  }
  ch.send(JSON.stringify({ kind: 'file-end', id }))
}

export interface Incoming { meta: FileMeta; received: number; blob?: Blob }

/** Reassembles incoming files (start message → binary chunks → end message). */
export function receiver(onUpdate: (files: Incoming[]) => void, onMessage?: (m: Record<string, unknown>) => void) {
  const files: Incoming[] = []
  let cur: { inc: Incoming; parts: ArrayBuffer[] } | null = null
  return (e: MessageEvent) => {
    if (typeof e.data === 'string') {
      const m = JSON.parse(e.data)
      if (m.kind === 'file-start') {
        cur = { inc: { meta: { id: m.id, name: m.name, size: m.size, type: m.type }, received: 0 }, parts: [] }
        files.push(cur.inc)
      } else if (m.kind === 'file-end' && cur) {
        cur.inc.blob = new Blob(cur.parts, { type: cur.inc.meta.type || 'application/octet-stream' })
        cur = null
      } else onMessage?.(m)
    } else if (cur) {
      cur.parts.push(e.data as ArrayBuffer)
      cur.inc.received += (e.data as ArrayBuffer).byteLength
    }
    onUpdate([...files])
  }
}
