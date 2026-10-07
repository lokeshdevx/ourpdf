/** Talks to the on-device AI worker (public/workers/ai.worker.js). */

type Progress = (fraction: number, stage: string) => void
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: Progress }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker('/workers/ai.worker.js', { type: 'module', name: 'ourpdf-ai' })
  worker.onmessage = (e: MessageEvent<{ id: number; type: string; result?: unknown; message?: string; fraction?: number; stage?: string }>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    if (e.data.type === 'progress') p.progress?.(e.data.fraction ?? 0, e.data.stage ?? '')
    else if (e.data.type === 'done') {
      pending.delete(e.data.id)
      p.resolve(e.data.result)
    } else if (e.data.type === 'error') {
      pending.delete(e.data.id)
      p.reject(new Error(e.data.message))
    }
  }
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'The AI engine failed to start'))
    pending.clear()
    worker = null
  }
  return worker
}

function call<T>(msg: Record<string, unknown>, progress?: Progress, transfer: Transferable[] = []): Promise<T> {
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress })
    getWorker().postMessage({ ...msg, id }, transfer)
  })
}

export function stopAi() {
  worker?.terminate()
  worker = null
  for (const p of pending.values()) p.reject(new Error('Cancelled'))
  pending.clear()
}

/** Whether a model's files are installed on this server (`npm run models`). */
export async function modelAvailable(model: 'asr' | 'embed'): Promise<boolean> {
  try {
    const r = await fetch(`/models/${model === 'asr' ? 'whisper-base' : 'all-MiniLM-L6-v2'}/config.json`, { method: 'HEAD' })
    return r.ok
  } catch {
    return false
  }
}

export interface Transcript { text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }

export function transcribe(audio: Float32Array, opts: { language: string | null; timestamps: boolean }, progress?: Progress): Promise<Transcript> {
  return call<Transcript>({ type: 'transcribe', audio, language: opts.language, timestamps: opts.timestamps }, progress, [audio.buffer])
}

export function embed(texts: string[], progress?: Progress): Promise<Float32Array[]> {
  return call<Float32Array[]>({ type: 'embed', texts }, progress)
}

/** Decodes any audio/video file the browser supports and resamples it to 16 kHz mono (Whisper's input). */
export async function decodeAudio(file: Blob): Promise<Float32Array> {
  const buf = await file.arrayBuffer()
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ac = new Ctx()
  let decoded: AudioBuffer
  try {
    decoded = await ac.decodeAudioData(buf)
  } catch {
    throw new Error('This audio format cannot be decoded by your browser. Try MP3, WAV, M4A, OGG or WEBM.')
  } finally {
    void ac.close()
  }
  const frames = Math.ceil(decoded.duration * 16000)
  const off = new OfflineAudioContext(1, Math.max(1, frames), 16000)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return rendered.getChannelData(0).slice()
}
