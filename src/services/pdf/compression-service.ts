import type { CompressResult } from '@/engine/compress'
import { runEngine } from './worker-client'
import { exportPdfBytes } from './export-service'
import type { TaskContext } from '../tasks'

export type CompressionPreset = 'lossless' | 'medium' | 'high' | 'custom'

export interface CompressionSettings {
  preset: CompressionPreset
  jpegQuality: number
  maxDpi: number
  rasterize: boolean
  removeMetadata: boolean
  recompressFlate: boolean
}

export const PRESETS: Record<Exclude<CompressionPreset, 'custom'>, CompressionSettings> = {
  lossless: { preset: 'lossless', jpegQuality: 1, maxDpi: 0, rasterize: false, removeMetadata: false, recompressFlate: false },
  medium: { preset: 'medium', jpegQuality: 0.75, maxDpi: 150, rasterize: false, removeMetadata: false, recompressFlate: true },
  high: { preset: 'high', jpegQuality: 0.6, maxDpi: 96, rasterize: false, removeMetadata: true, recompressFlate: true },
}

export interface CompressionOutcome extends CompressResult {
  before: number
  after: number
  ratio: number
}

/** Measures the real output (no guesses): builds the edited PDF, then recompresses images and packs objects. */
export async function compressDocument(docId: string, s: CompressionSettings, ctx: TaskContext, beforeBytes: number): Promise<CompressionOutcome> {
  const first = await exportPdfBytes(docId, {
    signal: ctx.signal,
    rasterAll: s.rasterize ? { scale: Math.max(0.6, s.maxDpi / 72), quality: s.jpegQuality } : null,
    removeMetadata: s.removeMetadata || undefined,
    onProgress: (f, l) => ctx.progress(f * 0.6, l),
  })
  const res = await runEngine(
    'compress',
    { bytes: first, options: { jpegQuality: s.jpegQuality, maxDpi: s.maxDpi, removeMetadata: s.removeMetadata, recompressFlate: s.recompressFlate } },
    { transfer: [first.buffer as ArrayBuffer], signal: ctx.signal, onProgress: (f, l) => ctx.progress(0.6 + f * 0.4, l) },
  )
  const after = res.bytes.byteLength
  return { ...res, before: beforeBytes, after, ratio: beforeBytes ? 1 - after / beforeBytes : 0 }
}
