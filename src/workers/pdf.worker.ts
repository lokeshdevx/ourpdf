/// <reference lib="webworker" />
import { runOp, type EngineOp } from '@/engine/ops'

interface Req {
  type: 'run' | 'cancel'
  id: number
  op?: EngineOp
  payload?: never
}

const signals = new Map<number, { aborted: boolean }>()
const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (e: MessageEvent<Req>) => {
  const { type, id } = e.data
  if (type === 'cancel') {
    const s = signals.get(id)
    if (s) s.aborted = true
    return
  }
  const signal = { aborted: false }
  signals.set(id, signal)
  try {
    const result = await runOp(e.data.op!, e.data.payload!, (fraction, label) => ctx.postMessage({ id, type: 'progress', fraction, label }), signal)
    const transfer: Transferable[] = []
    if (result instanceof Uint8Array) transfer.push(result.buffer as ArrayBuffer)
    else if (result && typeof result === 'object' && 'bytes' in result && (result as { bytes: Uint8Array }).bytes instanceof Uint8Array) transfer.push((result as { bytes: Uint8Array }).bytes.buffer as ArrayBuffer)
    ctx.postMessage({ id, type: 'result', result }, transfer)
  } catch (err) {
    const er = err as Error
    ctx.postMessage({ id, type: 'error', name: er?.name ?? 'Error', message: er?.message ?? String(err) })
  } finally {
    signals.delete(id)
  }
}
