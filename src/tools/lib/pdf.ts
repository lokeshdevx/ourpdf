import { PDFDocument } from 'pdf-lib'
import { loadPdfjs, PDFJS_ASSETS } from '@/services/pdf/pdfjs'

/** Shared helpers for the standalone tools: everything works on plain bytes, in the browser, with no upload. */

export type PdfJsDoc = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>
export type PdfJsPage = Awaited<ReturnType<PdfJsDoc['getPage']>>

export async function fileBytes(f: Blob): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer())
}

export function isPasswordError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e)
  return /password|encrypt/i.test(msg) || (e as { name?: string })?.name === 'PasswordException'
}

/** Loads with pdf-lib. Encrypted files need the password (owner-only encryption opens with an empty one). */
export async function loadDoc(bytes: Uint8Array, password?: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { password: password ?? '', updateMetadata: false, throwOnInvalidObject: false })
  } catch (e) {
    if (isPasswordError(e)) throw new Error(password ? 'Wrong password for this PDF.' : 'This PDF is password-protected. Enter its password first.')
    throw new Error(`Could not read this PDF (${(e as Error).message}). Try the Repair PDF tool.`)
  }
}

export async function saveDoc(doc: PDFDocument, opts: { objectStreams?: boolean } = {}): Promise<Uint8Array> {
  doc.setProducer('OurPDF')
  return doc.save({ useObjectStreams: opts.objectStreams ?? true, addDefaultPage: false })
}

/** Copies the given page indices of `src` into a new document (pdf-lib keeps links/annotations of copied pages). */
export async function subset(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create({ updateMetadata: false })
  const pages = await out.copyPages(src, indices)
  pages.forEach((p) => out.addPage(p))
  const title = src.getTitle()
  if (title) out.setTitle(title)
  return saveDoc(out)
}

/** Opens bytes with pdf.js (rendering, text, outline). The input is copied because pdf.js transfers the buffer. */
export async function openPdfjs(bytes: Uint8Array, password?: string): Promise<PdfJsDoc> {
  const pdfjs = await loadPdfjs()
  try {
    return await pdfjs.getDocument({ data: bytes.slice(), password, ...PDFJS_ASSETS, enableXfa: false }).promise
  } catch (e) {
    if (isPasswordError(e)) throw new Error(password ? 'Wrong password for this PDF.' : 'This PDF is password-protected. Enter its password first.')
    throw e
  }
}

/** Releases a pdf.js document (and its worker-side resources). */
export async function closePdf(doc: PdfJsDoc): Promise<void> {
  await doc.loadingTask.destroy()
}

/**
 * Renders a page into a new canvas at `scale` (1 = 72 dpi). `noText` leaves out the text; `'upright'` leaves out only
 * horizontal text, so vertical and rotated labels stay in the picture.
 */
export async function renderPage(page: PdfJsPage, scale: number, opts: { forms?: boolean; noText?: boolean | 'upright' } = {}): Promise<HTMLCanvasElement> {
  const pdfjs = await loadPdfjs()
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  if (opts.noText) {
    // pdf.js paints glyphs with fillText/strokeText: silencing them leaves only graphics and images (a clean
    // background to put editable text boxes on). getContext returns this same patched context to pdf.js.
    const ctx = canvas.getContext('2d')!
    const keep = (draw: CanvasRenderingContext2D['fillText']): CanvasRenderingContext2D['fillText'] => function (this: CanvasRenderingContext2D, ...args) {
      if (opts.noText !== 'upright') return
      const m = this.getTransform()
      if (Math.abs(m.b) > 0.02 * Math.abs(m.a) || m.a <= 0) draw.apply(this, args)
    }
    ctx.fillText = keep(ctx.fillText)
    ctx.strokeText = keep(ctx.strokeText)
  }
  await page.render({ canvas, viewport, background: '#ffffff', annotationMode: opts.forms === false ? pdfjs.AnnotationMode.DISABLE : pdfjs.AnnotationMode.ENABLE_FORMS }).promise
  return canvas
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, quality))
}

export async function canvasBytes(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Uint8Array> {
  return fileBytes(await canvasBlob(canvas, type, quality))
}

/** A positioned run of text in top-left-origin page points. */
export interface TextRun {
  str: string
  x: number
  y: number
  w: number
  h: number
  size: number
  font: string
  bold: boolean
  italic: boolean
  eol: boolean
  /** pdf.js font id – resolves to the PDF's real font (name, bold, italic) via `page.commonObjs` after a render. */
  fontId?: string
  /** Not left-to-right horizontal on the page (vertical or upside-down text). */
  rotated?: boolean
}

export interface PageText {
  width: number
  height: number
  runs: TextRun[]
  /** Plain text in reading order with line breaks. */
  text: string
}

interface RawItem { str: string; transform: number[]; width: number; height: number; fontName: string; hasEOL: boolean }

/** Synthetic italics: an upright font sheared by the text matrix (what browsers do when no italic face exists). */
const slanted = (t: number[]) => Math.abs(t[1]) < 1e-3 * Math.abs(t[0]) && Math.abs(t[2]) > 0.1 * Math.abs(t[3])

export async function pageText(page: PdfJsPage): Promise<PageText> {
  const pdfjs = await loadPdfjs()
  const viewport = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  const styles = (tc as unknown as { styles: Record<string, { fontFamily: string }> }).styles ?? {}
  const runs: TextRun[] = []
  for (const raw of tc.items as unknown as RawItem[]) {
    if (!('str' in raw)) continue
    const t = pdfjs.Util.transform(viewport.transform, raw.transform) as number[]
    const size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 1
    const fam = `${raw.fontName} ${styles[raw.fontName]?.fontFamily ?? ''}`
    runs.push({
      str: raw.str, x: t[4], y: t[5] - size, w: raw.width, h: size, size, font: styles[raw.fontName]?.fontFamily ?? 'sans-serif',
      bold: /bold|black|heavy|semibold/i.test(fam), italic: /italic|oblique/i.test(fam) || slanted(t), rotated: Math.abs(t[1]) > 0.02 * Math.abs(t[0]) || t[0] <= 0, eol: raw.hasEOL, fontId: raw.fontName,
    })
  }
  return { width: viewport.width, height: viewport.height, runs, text: runsToText(runs) }
}

export interface Line { y: number; h: number; size: number; runs: TextRun[]; text: string; x: number; right: number; bold: boolean }

/** Groups runs into visual lines (top to bottom, left to right). */
export function groupLines(runs: TextRun[]): Line[] {
  const sorted = runs.filter((r) => r.str.trim() !== '').sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Line[] = []
  for (const r of sorted) {
    const mid = r.y + r.h / 2
    const line = lines.find((l) => Math.abs(l.y + l.h / 2 - mid) < Math.max(2, Math.min(l.h, r.h) * 0.5))
    if (line) line.runs.push(r)
    else lines.push({ y: r.y, h: r.h, size: r.size, runs: [r], text: '', x: r.x, right: r.x + r.w, bold: r.bold })
  }
  for (const l of lines) {
    l.runs.sort((a, b) => a.x - b.x)
    let s = ''
    let end = -Infinity
    for (const r of l.runs) {
      if (s && r.x - end > r.size * 0.2 && !s.endsWith(' ') && !r.str.startsWith(' ')) s += ' '
      s += r.str
      end = r.x + r.w
    }
    l.text = s.replace(/\s+/g, ' ').trim()
    l.x = Math.min(...l.runs.map((r) => r.x))
    l.right = Math.max(...l.runs.map((r) => r.x + r.w))
    l.size = Math.max(...l.runs.map((r) => r.size))
    l.h = Math.max(...l.runs.map((r) => r.h))
    l.y = Math.min(...l.runs.map((r) => r.y))
    l.bold = l.runs.every((r) => r.bold)
  }
  return lines.sort((a, b) => a.y - b.y)
}

export function runsToText(runs: TextRun[]): string {
  return groupLines(runs).map((l) => l.text).join('\n')
}

export interface Paragraph { text: string; size: number; bold: boolean; heading: 0 | 1 | 2 | 3; top: number }

/** Joins lines into paragraphs and guesses headings from font size relative to the body size. */
export function paragraphs(lines: Line[]): Paragraph[] {
  if (!lines.length) return []
  const sizes = lines.map((l) => Math.round(l.size)).sort((a, b) => a - b)
  const body = sizes[Math.floor(sizes.length / 2)] || 11
  const out: Paragraph[] = []
  let cur: (Paragraph & { bottom: number }) | null = null
  for (const l of lines) {
    const ratio = l.size / body
    const heading: Paragraph['heading'] = ratio > 1.6 ? 1 : ratio > 1.3 ? 2 : ratio > 1.12 || (l.bold && l.text.length < 90 && ratio >= 1) ? 3 : 0
    const gap = cur ? l.y - cur.bottom : 0
    const join = cur && !heading && !cur.heading && Math.abs(cur.size - l.size) < 1 && gap < l.h * 0.9
    if (join && cur) {
      cur.text = cur.text.endsWith('-') ? cur.text.slice(0, -1) + l.text : `${cur.text} ${l.text}`
      cur.bottom = l.y + l.h
    } else {
      if (cur) out.push(cur)
      cur = { text: l.text, size: l.size, bold: l.bold, heading, top: l.y, bottom: l.y + l.h }
    }
  }
  if (cur) out.push(cur)
  return out.map(({ text, size, bold, heading, top }) => ({ text, size, bold, heading, top }))
}

/** Text of every page (1 entry per page). */
export async function allPageText(doc: PdfJsDoc, onProgress?: (f: number) => void): Promise<PageText[]> {
  const out: PageText[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    out.push(await pageText(page))
    page.cleanup()
    onProgress?.(i / doc.numPages)
  }
  return out
}

/** Parses "1-3, 5, 8-" (1-based, inclusive) into 0-based indices. Empty = all pages. */
export function parseRanges(spec: string, count: number): number[] {
  const s = spec.trim()
  if (!s) return Array.from({ length: count }, (_, i) => i)
  const out: number[] = []
  for (const part of s.split(/[,;]+/)) {
    const p = part.trim().toLowerCase()
    if (!p) continue
    if (p === 'odd' || p === 'even') {
      for (let i = p === 'odd' ? 0 : 1; i < count; i += 2) out.push(i)
      continue
    }
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(p)
    if (m) {
      const a = m[1] ? Number(m[1]) : 1
      const b = m[2] ? Number(m[2]) : count
      if (a < 1 || b < a) throw new Error(`Invalid range "${part.trim()}"`)
      for (let i = a; i <= Math.min(b, count); i++) out.push(i - 1)
    } else if (/^\d+$/.test(p)) {
      const n = Number(p)
      if (n < 1 || n > count) throw new Error(`Page ${n} does not exist (the PDF has ${count} pages)`)
      out.push(n - 1)
    } else throw new Error(`Could not understand "${part.trim()}"`)
  }
  return out
}

/** Groups of page ranges for splitting: "1-3, 4-6" → [[0,1,2],[3,4,5]]. */
export function parseRangeGroups(spec: string, count: number): number[][] {
  return spec.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).map((g) => parseRanges(g, count))
}

export const baseName = (name: string) => name.replace(/\.[^.]+$/, '') || 'document'

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export async function zipFiles(files: { name: string; data: Blob | Uint8Array | string }[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const used = new Set<string>()
  for (const f of files) {
    let name = f.name
    for (let i = 2; used.has(name); i++) name = f.name.replace(/(\.[^.]+)?$/, ` (${i})$1`)
    used.add(name)
    zip.file(name, f.data)
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    img.onload = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => reject(new Error('Could not decode this image'))
    img.src = url
  })
}

export const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' })
