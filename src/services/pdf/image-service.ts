import { AppError } from '@/lib/errors'
import { applyFilters, hasFilters } from '@/lib/image-filters'
import { addAsset, getAsset } from '@/services/assets'
import type { AssetInfo, ImageObj } from '@/types'
import { detectFile } from '@/utils/file'

const MAX_SIDE = 5000

async function canvasBlob(c: HTMLCanvasElement | OffscreenCanvas, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality })
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image encoding failed'))), type, quality))
}

/** EXIF orientation of a JPEG (1 = normal). */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1
  let off = 2
  while (off + 4 < bytes.length) {
    if (bytes[off] !== 0xff) return 1
    const marker = bytes[off + 1]
    const len = (bytes[off + 2] << 8) | bytes[off + 3]
    if (marker === 0xe1 && String.fromCharCode(...bytes.slice(off + 4, off + 8)) === 'Exif') {
      const t = off + 10
      const le = bytes[t] === 0x49
      const u16 = (o: number) => (le ? bytes[t + o] | (bytes[t + o + 1] << 8) : (bytes[t + o] << 8) | bytes[t + o + 1])
      const u32 = (o: number) => (le ? (bytes[t + o] | (bytes[t + o + 1] << 8) | (bytes[t + o + 2] << 16) | (bytes[t + o + 3] << 24)) >>> 0 : ((bytes[t + o] << 24) | (bytes[t + o + 1] << 16) | (bytes[t + o + 2] << 8) | bytes[t + o + 3]) >>> 0)
      const ifd = u32(4)
      const n = u16(ifd)
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12
        if (u16(e) === 0x0112) return u16(e + 8)
      }
      return 1
    }
    off += 2 + len
  }
  return 1
}

export interface NormalizedImage {
  bytes: Uint8Array
  mime: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

/**
 * Converts any browser-decodable image into PNG/JPEG bytes that pdf-lib can embed.
 * Baseline JPEGs with normal orientation are passed through untouched (no generation loss).
 */
export async function normalizeImage(blob: Blob): Promise<NormalizedImage> {
  const kind = await detectFile(blob)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (kind === 'jpeg' && jpegOrientation(bytes) === 1) {
    const bmp = await decode(blob)
    const out = { bytes, mime: 'image/jpeg' as const, width: bmp.width, height: bmp.height }
    bmp.close()
    return out
  }
  if (kind === 'png') {
    const bmp = await decode(blob)
    const out = { bytes, mime: 'image/png' as const, width: bmp.width, height: bmp.height }
    bmp.close()
    return out
  }
  if (!['jpeg', 'webp', 'tiff', 'unknown'].includes(kind)) throw new AppError('unsupported', 'This file is not a supported image.')
  const bmp = await decode(blob)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  const w = bmp.width
  const h = bmp.height
  bmp.close()
  const png = await canvasBlob(c, 'image/png')
  c.width = c.height = 0
  return { bytes: new Uint8Array(await png.arrayBuffer()), mime: 'image/png', width: w, height: h }
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    throw new AppError('unsupported', kindHint(blob))
  }
}
function kindHint(blob: Blob) {
  return /tiff?/i.test(blob.type) ? 'TIFF images are not supported by this browser.' : 'Unable to decode this image – it may be damaged or in an unsupported format.'
}

/** Adds a user image as an asset (PNG/JPEG normalised). */
export async function importImageAsset(file: Blob, name: string): Promise<AssetInfo> {
  const n = await normalizeImage(file)
  return addAsset(new Blob([n.bytes as BlobPart], { type: n.mime }), name)
}

/** Renders the object's image with crop + filters (+ optional JPEG quality) baked in, ready for embedding. */
export async function bakeImage(o: ImageObj): Promise<{ bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' }> {
  const rec = getAsset(o.assetId)
  if (!rec) throw new AppError('unknown', 'An image used in this document is no longer available.')
  const untouched = !o.crop && !hasFilters(o.filters) && o.quality >= 0.999
  if (untouched && (rec.info.mime === 'image/png' || rec.info.mime === 'image/jpeg')) {
    return { bytes: new Uint8Array(await rec.blob.arrayBuffer()), mime: rec.info.mime }
  }
  const bmp = await createImageBitmap(rec.blob)
  const crop = o.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const sx = Math.round(crop.x * bmp.width)
  const sy = Math.round(crop.y * bmp.height)
  const sw = Math.max(1, Math.round(crop.w * bmp.width))
  const sh = Math.max(1, Math.round(crop.h * bmp.height))
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * k))
  const h = Math.max(1, Math.round(sh * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const jpeg = o.quality < 0.999
  if (jpeg) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h)
  bmp.close()
  if (hasFilters(o.filters)) {
    const data = ctx.getImageData(0, 0, w, h)
    applyFilters(data.data, w, h, o.filters)
    ctx.putImageData(data, 0, 0)
  }
  const blob = await canvasBlob(c, jpeg ? 'image/jpeg' : 'image/png', jpeg ? Math.max(0.05, o.quality) : undefined)
  c.width = c.height = 0
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: jpeg ? 'image/jpeg' : 'image/png' }
}

/** Key that identifies identical baked output so duplicates share one embedded image. */
export function imageKey(o: ImageObj): string {
  return `${o.assetId}|${JSON.stringify(o.filters)}|${o.crop ? `${o.crop.x},${o.crop.y},${o.crop.w},${o.crop.h}` : ''}|${o.quality}`
}
