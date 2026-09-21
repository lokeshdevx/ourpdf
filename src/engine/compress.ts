import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib'
import { collectGarbage } from './assemble'
import type { ProgressFn } from './types'

export interface CompressOptions {
  password?: string
  /** JPEG quality 0.1–1 for recompressed images. */
  jpegQuality: number
  /** Images are downscaled so their longest side is at most this many pixels (dpi × 11.7in). 0 = keep. */
  maxDpi: number
  removeMetadata: boolean
  /** Also recompress Flate (lossless) RGB/Gray images to JPEG. */
  recompressFlate: boolean
}
export interface CompressResult {
  bytes: Uint8Array
  imagesTotal: number
  imagesRecompressed: number
  imagesSkipped: number
  objectsRemoved: number
}

const hasOffscreen = typeof OffscreenCanvas !== 'undefined'

async function encodeJpeg(pixels: ImageData | ImageBitmap, w: number, h: number, quality: number): Promise<Uint8Array | null> {
  if (!hasOffscreen) return null
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  if (pixels instanceof ImageData) ctx.putImageData(pixels, 0, 0)
  else ctx.drawImage(pixels, 0, 0, w, h)
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality })
  return new Uint8Array(await blob.arrayBuffer())
}

const nameOf = (o: unknown) => (o instanceof PDFName ? o.asString() : undefined)

/** Lossy image recompression + object stream packing + unreferenced-object removal. */
export async function compressPdf(input: Uint8Array, opts: CompressOptions, onProgress: ProgressFn = () => {}): Promise<CompressResult> {
  const doc = await PDFDocument.load(input, { password: opts.password ?? '', updateMetadata: false })
  const ctx = doc.context
  const images: [PDFRef, PDFRawStream][] = []
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && nameOf(obj.dict.get(PDFName.of('Subtype'))) === '/Image') images.push([ref, obj])
  }
  let recompressed = 0
  let skipped = 0
  let i = 0
  for (const [, stream] of images) {
    i++
    onProgress(0.05 + (i / Math.max(1, images.length)) * 0.8, `Image ${i} of ${images.length}`)
    try {
      const d = stream.dict
      const w = (d.lookup(PDFName.of('Width')) as PDFNumber | undefined)?.asNumber()
      const h = (d.lookup(PDFName.of('Height')) as PDFNumber | undefined)?.asNumber()
      const bpc = (d.lookup(PDFName.of('BitsPerComponent')) as PDFNumber | undefined)?.asNumber()
      if (!w || !h || (bpc !== 8 && !d.has(PDFName.of('ImageMask')))) {
        skipped++
        continue
      }
      if (d.has(PDFName.of('ImageMask')) || d.has(PDFName.of('Mask')) || d.has(PDFName.of('Decode'))) {
        skipped++
        continue
      }
      const cs = d.lookup(PDFName.of('ColorSpace'))
      let comps = 0
      if (cs instanceof PDFName) comps = cs.asString() === '/DeviceRGB' ? 3 : cs.asString() === '/DeviceGray' ? 1 : 0
      else if (cs instanceof PDFArray && nameOf(cs.get(0)) === '/ICCBased') {
        const icc = cs.lookup(1)
        const n = icc instanceof PDFRawStream ? (icc.dict.lookup(PDFName.of('N')) as PDFNumber | undefined)?.asNumber() : undefined
        comps = n === 3 || n === 1 ? n : 0
      }
      if (!comps) {
        skipped++
        continue
      }
      const filter = d.lookup(PDFName.of('Filter'))
      const fname = filter instanceof PDFName ? filter.asString() : filter instanceof PDFArray && filter.size() === 1 ? nameOf(filter.get(0)) : undefined
      const targetMax = opts.maxDpi > 0 ? Math.round(opts.maxDpi * 11.7) : Infinity
      const scale = Math.min(1, targetMax / Math.max(w, h))
      const tw = Math.max(1, Math.round(w * scale))
      const th = Math.max(1, Math.round(h * scale))
      const original = stream.getContents().length
      let jpeg: Uint8Array | null = null
      if (fname === '/DCTDecode') {
        if (scale >= 0.999 && opts.jpegQuality >= 0.95) {
          skipped++
          continue
        }
        const bmp = await createImageBitmap(new Blob([stream.getContents() as BlobPart], { type: 'image/jpeg' }))
        jpeg = await encodeJpeg(bmp, tw, th, opts.jpegQuality)
        bmp.close()
      } else if (fname === '/FlateDecode' && opts.recompressFlate) {
        const raw = decodePDFRawStream(stream).decode()
        if (raw.length < w * h * comps) {
          skipped++
          continue
        }
        const rgba = new Uint8ClampedArray(w * h * 4)
        for (let p = 0, q = 0; p < w * h; p++) {
          if (comps === 3) {
            rgba[q++] = raw[p * 3]
            rgba[q++] = raw[p * 3 + 1]
            rgba[q++] = raw[p * 3 + 2]
          } else {
            rgba[q++] = raw[p]
            rgba[q++] = raw[p]
            rgba[q++] = raw[p]
          }
          rgba[q++] = 255
        }
        const img = new ImageData(rgba, w, h)
        const bmp = tw === w && th === h ? img : await createImageBitmap(img, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' })
        jpeg = await encodeJpeg(bmp, tw, th, opts.jpegQuality)
        if (bmp instanceof ImageBitmap) bmp.close()
      } else {
        skipped++
        continue
      }
      if (!jpeg || jpeg.length >= original * 0.95) {
        skipped++
        continue
      }
      // Replace the stream data + dictionary entries (colour space becomes DeviceRGB, matching the JPEG we wrote).
      d.set(PDFName.of('Width'), PDFNumber.of(tw))
      d.set(PDFName.of('Height'), PDFNumber.of(th))
      d.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
      d.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
      d.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
      d.delete(PDFName.of('DecodeParms'))
      d.set(PDFName.of('Length'), PDFNumber.of(jpeg.length))
      ;(stream as unknown as { contents: Uint8Array }).contents = jpeg
      recompressed++
    } catch {
      skipped++
    }
  }
  if (opts.removeMetadata) {
    const info = ctx.lookup(ctx.trailerInfo.Info)
    if (info instanceof PDFDict) for (const [k] of info.entries()) info.delete(k)
    doc.catalog.delete(PDFName.of('Metadata'))
  }
  const removed = collectGarbage(doc)
  onProgress(0.92, 'Packing objects')
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false })
  onProgress(1)
  return { bytes, imagesTotal: images.length, imagesRecompressed: recompressed, imagesSkipped: skipped, objectsRemoved: removed }
}
