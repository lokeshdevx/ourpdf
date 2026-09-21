import { AppError, CancelledError, toUserError } from '@/lib/errors'
import type { EngineOp, EngineOps } from '@/engine/ops'

let worker: Worker | null = null
let seq = 0
let idleTimer: ReturnType<typeof setTimeout> | null = null
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; onProgress?: (f: number, l?: string) => void }>()
const IDLE_MS = 45_000

function armIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (!pending.size) terminateEngineWorker()
  }, IDLE_MS)
}

/** Frees the worker (and its memory). It is recreated on demand. */
export function terminateEngineWorker() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  worker?.terminate()
  worker = null
  for (const [, p] of pending) p.reject(new CancelledError('Worker terminated'))
  pending.clear()
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    // Built by scripts/build-workers.mjs from src/workers/pdf.worker.ts (classic script, same origin).
    worker = new Worker('/workers/pdf.worker.js')
  } catch {
    return null
  }
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { id: number; type: string; result?: unknown; fraction?: number; label?: string; name?: string; message?: string }
    const p = pending.get(m.id)
    if (!p) return
    if (m.type === 'progress') p.onProgress?.(m.fraction ?? 0, m.label)
    else if (m.type === 'result') {
      pending.delete(m.id)
      p.resolve(m.result)
      armIdle()
    } else if (m.type === 'error') {
      pending.delete(m.id)
      p.reject(m.name === 'AbortError' ? new CancelledError() : toUserError(Object.assign(new Error(m.message), { name: m.name })))
      armIdle()
    }
  }
  worker.onerror = (e) => {
    const err = new AppError('unknown', e.message || 'The PDF worker crashed')
    for (const [, p] of pending) p.reject(err)
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export interface RunOptions {
  transfer?: Transferable[]
  onProgress?: (fraction: number, label?: string) => void
  signal?: AbortSignal
}

/** Runs a CPU-heavy PDF operation in the engine worker (inline fallback when Workers are unavailable). */
export async function runEngine<K extends EngineOp>(op: K, payload: EngineOps[K]['payload'], opts: RunOptions = {}): Promise<EngineOps[K]['result']> {
  if (opts.signal?.aborted) throw new CancelledError()
  const w = getWorker()
  if (!w) {
    const { runOp } = await import('@/engine/ops')
    const sig = { aborted: false }
    opts.signal?.addEventListener('abort', () => (sig.aborted = true))
    try {
      return await runOp(op, payload, opts.onProgress ?? (() => {}), sig)
    } catch (e) {
      throw (e as Error).name === 'AbortError' ? new CancelledError() : toUserError(e)
    }
  }
  const id = ++seq
  if (idleTimer) clearTimeout(idleTimer)
  return new Promise<EngineOps[K]['result']>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress: opts.onProgress })
    opts.signal?.addEventListener('abort', () => {
      w.postMessage({ type: 'cancel', id })
    })
    try {
      w.postMessage({ type: 'run', id, op, payload }, opts.transfer ?? [])
    } catch (e) {
      pending.delete(id)
      reject(toUserError(e))
    }
  })
}
