import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { canEncode } from '@/engine/fonts'
import { canvasBytes, closePdf, loadDoc, openPdfjs, pageText, renderPage, saveDoc, type TextRun } from './pdf'

export type ColourMode = 'invert' | 'dark' | 'night' | 'sepia' | 'grayscale' | 'high-contrast' | 'custom'

/** Pixel transforms used by Invert PDF Colours. All are pure functions over RGBA data. */
export function transformPixels(d: Uint8ClampedArray, mode: ColourMode, custom?: { fg: [number, number, number]; bg: [number, number, number] }) {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    switch (mode) {
      case 'invert':
        d[i] = 255 - r; d[i + 1] = 255 - g; d[i + 2] = 255 - b
        break
      case 'dark': {
        // invert lightness but keep hue and chroma (colours stay recognisable)
        const shift = 255 - Math.max(r, g, b) - Math.min(r, g, b)
        d[i] = r + shift; d[i + 1] = g + shift; d[i + 2] = b + shift
        break
      }
      case 'night': {
        const shift = 255 - Math.max(r, g, b) - Math.min(r, g, b)
        // dark-grey paper instead of pure black, softer white text
        d[i] = 30 + (r + shift) * 0.8; d[i + 1] = 30 + (g + shift) * 0.8; d[i + 2] = 32 + (b + shift) * 0.8
        break
      }
      case 'sepia':
        d[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189)
        d[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168)
        d[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131)
        break
      case 'grayscale':
        d[i] = d[i + 1] = d[i + 2] = lum
        break
      case 'high-contrast': {
        const v = lum < 150 ? 0 : 255
        d[i] = d[i + 1] = d[i + 2] = v
        break
      }
      case 'custom': {
        const t = lum / 255
        const { fg, bg } = custom ?? { fg: [255, 255, 255], bg: [0, 0, 0] }
        d[i] = fg[0] + (bg[0] - fg[0]) * t; d[i + 1] = fg[1] + (bg[1] - fg[1]) * t; d[i + 2] = fg[2] + (bg[2] - fg[2]) * t
        break
      }
    }
  }
}

/** Adds invisible (but selectable / searchable) text over a rasterised page. */
export function drawInvisibleText(page: PDFPage, font: PDFFont, runs: TextRun[], pageH: number, skip?: (r: TextRun) => boolean) {
  for (const r of runs) {
    if (!r.str.trim() || skip?.(r)) continue
    const text = [...r.str].map((c) => (canEncode(font, c) ? c : ' ')).join('')
    if (!text.trim()) continue
    const natural = font.widthOfTextAtSize(text, r.size) || 1
    const size = Math.max(1, r.size * Math.min(3, Math.max(0.3, r.w / natural)))
    page.drawText(text, { x: r.x, y: pageH - r.y - r.h * 0.8, size, font, opacity: 0 })
  }
}

export interface RasterOptions {
  /** Pixels per point (2 ≈ 144 dpi). */
  scale: number
  jpegQuality: number
  /** Pages to rasterise (0-based). Others are copied unchanged as vectors. Default: all. */
  pages?: Set<number>
  keepText: boolean
  /** Edits the rendered page canvas (pixel transform, burned-in boxes…). */
  paint: (ctx: CanvasRenderingContext2D, page: number, scale: number, runs: TextRun[]) => void
  /** Text runs to drop from the invisible text layer (e.g. redacted words). */
  dropRun?: (page: number, r: TextRun) => boolean
  onProgress?: (f: number, label: string) => void
  png?: boolean
  /** Pass page text runs to `paint` even without a text layer. */
  needText?: boolean
}

/** Renders pages, lets `paint` modify the pixels, and rebuilds a PDF from the images. */
export async function rasterRebuild(bytes: Uint8Array, o: RasterOptions): Promise<Uint8Array> {
  const js = await openPdfjs(bytes)
  const src = o.pages ? await loadDoc(bytes) : null
  const out = await PDFDocument.create({ updateMetadata: false })
  const font = await out.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < js.numPages; i++) {
    if (o.pages && !o.pages.has(i) && src) {
      const [p] = await out.copyPages(src, [i])
      out.addPage(p)
      continue
    }
    const page = await js.getPage(i + 1)
    const vp = page.getViewport({ scale: 1 })
    const canvas = await renderPage(page, o.scale)
    const text = o.keepText || o.needText ? await pageText(page) : null
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    o.paint(ctx, i, o.scale, text?.runs ?? [])
    const img = o.png ? await out.embedPng(await canvasBytes(canvas, 'image/png')) : await out.embedJpg(await canvasBytes(canvas, 'image/jpeg', o.jpegQuality))
    const p = out.addPage([vp.width, vp.height])
    p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height })
    if (o.keepText && text) drawInvisibleText(p, font, text.runs, vp.height, o.dropRun ? (r) => o.dropRun!(i, r) : undefined)
    page.cleanup()
    canvas.width = canvas.height = 0
    o.onProgress?.((i + 1) / js.numPages, `Page ${i + 1} of ${js.numPages}`)
  }
  await closePdf(js)
  return saveDoc(out)
}

export async function invertColours(bytes: Uint8Array, mode: ColourMode, opts: { scale: number; quality: number; keepText: boolean; custom?: { fg: [number, number, number]; bg: [number, number, number] }; onProgress?: (f: number, l: string) => void }): Promise<Uint8Array> {
  return rasterRebuild(bytes, {
    scale: opts.scale, jpegQuality: opts.quality, keepText: opts.keepText, onProgress: opts.onProgress,
    paint: (ctx) => {
      const { width, height } = ctx.canvas
      const img = ctx.getImageData(0, 0, width, height)
      transformPixels(img.data, mode, opts.custom)
      ctx.putImageData(img, 0, 0)
    },
  })
}

/** Converts a PDF to grayscale (rasterised). */
export const grayscalePdf = (bytes: Uint8Array, onProgress?: (f: number, l: string) => void) => invertColours(bytes, 'grayscale', { scale: 2, quality: 0.85, keepText: true, onProgress })

/**
 * True redaction: pages with boxes are re-rendered with the boxes burned into the pixels, the original page content is
 * discarded, and the invisible text layer is rebuilt without any run touching a box. Other pages stay vector.
 */
export async function applyRedactions(bytes: Uint8Array, boxes: Map<number, { x: number; y: number; w: number; h: number }[]>, opts: { colour: string; scale?: number; onProgress?: (f: number, l: string) => void }): Promise<Uint8Array> {
  const hit = (b: { x: number; y: number; w: number; h: number }, r: TextRun) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y
  return rasterRebuild(bytes, {
    scale: opts.scale ?? 2.5, jpegQuality: 0.9, keepText: true, pages: new Set(boxes.keys()), onProgress: opts.onProgress,
    paint: (ctx, page, scale) => {
      ctx.fillStyle = opts.colour
      for (const b of boxes.get(page) ?? []) ctx.fillRect(Math.floor(b.x * scale), Math.floor(b.y * scale), Math.ceil(b.w * scale) + 1, Math.ceil(b.h * scale) + 1)
    },
    dropRun: (page, r) => (boxes.get(page) ?? []).some((b) => hit(b, r)),
  })
}
