/// <reference lib="webworker" />
/**
 * On-device AI worker (Transformers.js + ONNX Runtime Web). Models and the runtime are self-hosted under /models and
 * /ort – remote model downloads are disabled, so audio and document text never leave the device.
 */
import { env, pipeline } from '@huggingface/transformers'

env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = '/models/'
env.useBrowserCache = true
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number; proxy?: boolean } }
if (onnx.wasm) {
  onnx.wasm.wasmPaths = { mjs: '/ort/ort-wasm-simd-threaded.asyncify.mjs', wasm: '/ort/ort-wasm-simd-threaded.asyncify.wasm' }
  // no cross-origin isolation (COEP) → SharedArrayBuffer is unavailable, so run single-threaded
  onnx.wasm.numThreads = 1
}

const MODELS = { asr: 'whisper-base', embed: 'all-MiniLM-L6-v2' } as const

type Req =
  | { id: number; type: 'check'; model: keyof typeof MODELS }
  | { id: number; type: 'transcribe'; audio: Float32Array; language: string | null; timestamps: boolean }
  | { id: number; type: 'embed'; texts: string[] }

const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, Promise<any>>()
function load(task: 'automatic-speech-recognition' | 'feature-extraction', model: string, id: number) {
  let p = cache.get(model)
  if (!p) {
    const seen = new Map<string, number>()
    p = pipeline(task, model, {
      dtype: task === 'automatic-speech-recognition' ? { encoder_model: 'q8', decoder_model_merged: 'q8' } : 'q8',
      device: 'wasm',
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status === 'progress' && e.file && e.total) {
          seen.set(e.file, (e.loaded ?? 0) / e.total)
          const vals = [...seen.values()]
          post({ id, type: 'progress', stage: 'Loading model', fraction: vals.reduce((a, b) => a + b, 0) / vals.length })
        }
      },
    } as never)
    p.catch(() => cache.delete(model))
    cache.set(model, p)
  }
  return p
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const req = ev.data
  try {
    if (req.type === 'check') {
      const r = await fetch(`/models/${MODELS[req.model]}/config.json`, { method: 'HEAD' })
      post({ id: req.id, type: 'done', result: r.ok })
      return
    }
    if (req.type === 'transcribe') {
      const asr = await load('automatic-speech-recognition', MODELS.asr, req.id)
      post({ id: req.id, type: 'progress', stage: 'Transcribing', fraction: 0 })
      const total = req.audio.length / 16000
      const out = await asr(req.audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: req.timestamps,
        language: req.language ?? undefined,
        task: 'transcribe',
        // streamer-less progress: report each 30 s chunk
        chunk_callback: (c: { is_last?: boolean; stride?: [number, number, number] }) => {
          if (c.stride) post({ id: req.id, type: 'progress', stage: 'Transcribing', fraction: Math.min(1, c.stride[0] / 16000 / total) })
        },
      })
      post({ id: req.id, type: 'done', result: out })
      return
    }
    if (req.type === 'embed') {
      const fe = await load('feature-extraction', MODELS.embed, req.id)
      const vectors: Float32Array[] = []
      for (let i = 0; i < req.texts.length; i += 16) {
        const t = await fe(req.texts.slice(i, i + 16), { pooling: 'mean', normalize: true })
        const dim = t.dims[t.dims.length - 1]
        const data = t.data as Float32Array
        for (let k = 0; k < data.length / dim; k++) vectors.push(data.slice(k * dim, (k + 1) * dim))
        post({ id: req.id, type: 'progress', stage: 'Understanding the document', fraction: Math.min(1, (i + 16) / req.texts.length) })
      }
      post({ id: req.id, type: 'done', result: vectors })
    }
  } catch (e) {
    post({ id: req.id, type: 'error', message: (e as Error).message ?? String(e) })
  }
}
