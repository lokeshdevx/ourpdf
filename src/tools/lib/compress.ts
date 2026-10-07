import { runEngine } from '@/services/pdf/worker-client'
import { rasterRebuild } from './raster'

export type CompressLevel = 'low' | 'recommended' | 'extreme' | 'scan'

export const COMPRESS_LEVELS: readonly (readonly [CompressLevel, string])[] = [
  ['low', 'Light – best quality'],
  ['recommended', 'Recommended'],
  ['extreme', 'Strong – smallest images'],
  ['scan', 'Maximum – re-render pages (scans)'],
]

const SETTINGS = {
  low: { jpegQuality: 0.85, maxDpi: 200, recompressFlate: false, removeMetadata: false },
  recommended: { jpegQuality: 0.7, maxDpi: 150, recompressFlate: true, removeMetadata: false },
  extreme: { jpegQuality: 0.5, maxDpi: 96, recompressFlate: true, removeMetadata: true },
}

/**
 * Compresses in the engine worker (image recompression + downsampling + object streams + unused-object removal).
 * 'scan' first re-renders every page as a JPEG (keeping an invisible text layer) – best for scanned documents.
 * Returns the original bytes if compression would make the file bigger.
 */
export async function compressBytes(bytes: Uint8Array, level: CompressLevel, onProgress?: (f: number, l?: string) => void, custom?: { jpegQuality: number; maxDpi: number }): Promise<Uint8Array> {
  let input = bytes
  if (level === 'scan') {
    input = await rasterRebuild(bytes, { scale: 1.4, jpegQuality: 0.55, keepText: true, paint: () => {}, onProgress: (f, l) => onProgress?.(f * 0.7, l) })
  }
  const s = level === 'scan' ? SETTINGS.extreme : { ...SETTINGS[level], ...custom }
  const copy = input.slice()
  const res = await runEngine('compress', { bytes: copy, options: s }, { transfer: [copy.buffer as ArrayBuffer], onProgress: (f, l) => onProgress?.((level === 'scan' ? 0.7 : 0) + f * (level === 'scan' ? 0.3 : 1), l) })
  return res.bytes.length < bytes.length ? res.bytes : bytes
}
