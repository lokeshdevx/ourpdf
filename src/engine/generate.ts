import { PDFDocument, PDFFont, PDFPage, PDFHexString, PDFName, StandardFonts, rgb, type PDFImage } from 'pdf-lib'
import { PAGE_SIZES } from '@/lib/geometry'
import { hexToUnit } from '@/utils/color'
import { collectGarbage } from './assemble'
import { canEncode } from './fonts'
import type { ProgressFn } from './types'

/* ---------------------------------------------------------------- images */

export interface ImageInput {
  bytes: Uint8Array
  mime: 'image/png' | 'image/jpeg'
  width: number
  height: number
  name?: string
}
export interface ImagesToPdfOptions {
  /** 'fit' = page matches the image; otherwise a named size. */
  pageSize: 'fit' | 'A4' | 'Letter' | 'A3' | 'Legal'
  orientation: 'auto' | 'portrait' | 'landscape'
  /** Margin in points (for fixed sizes). */
  margin: number
  /** DPI assumed for 'fit' pages (pixel → point conversion). */
  dpi: number
}

export async function imagesToPdf(images: ImageInput[], opts: ImagesToPdfOptions, onProgress: ProgressFn = () => {}): Promise<Uint8Array> {
  if (!images.length) throw new Error('No images to convert')
  const doc = await PDFDocument.create({ updateMetadata: false })
  for (let i = 0; i < images.length; i++) {
    const im = images[i]
    const img = im.mime === 'image/jpeg' ? await doc.embedJpg(im.bytes) : await doc.embedPng(im.bytes)
    if (opts.pageSize === 'fit') {
      const k = 72 / Math.max(1, opts.dpi)
      const w = Math.max(16, im.width * k)
      const h = Math.max(16, im.height * k)
      const page = doc.addPage([w, h])
      page.drawImage(img, { x: 0, y: 0, width: w, height: h })
    } else {
      let [pw, ph] = PAGE_SIZES[opts.pageSize]
      const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && im.width > im.height)
      if (landscape) [pw, ph] = [ph, pw]
      const page = doc.addPage([pw, ph])
      const availW = pw - 2 * opts.margin
      const availH = ph - 2 * opts.margin
      const k = Math.min(availW / im.width, availH / im.height)
      const w = im.width * k
      const h = im.height * k
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h })
    }
    onProgress((i + 1) / images.length)
  }
  doc.setProducer('OurPDF')
  return doc.save()
}

/* ------------------------------------------------------- rich text blocks */

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  mono?: boolean
  color?: string
  link?: string
}
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; runs: Run[] }
  | { type: 'paragraph'; runs: Run[]; align?: 'left' | 'center' | 'right' }
  | { type: 'list'; ordered: boolean; items: Run[][] }
  | { type: 'pre'; text: string }
  | { type: 'table'; rows: Run[][][]; header: boolean }
  | { type: 'image'; bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; width: number; height: number }
  | { type: 'hr' }
  | { type: 'pagebreak' }
  | { type: 'quote'; runs: Run[] }

export interface BlocksToPdfOptions {
  pageSize: 'A4' | 'Letter' | 'A3' | 'Legal'
  margin: number
  fontSize: number
  title?: string
  /** Monospace for whole doc (plain-text import). */
  mono?: boolean
}

const HEADING_SCALE = { 1: 2, 2: 1.6, 3: 1.35, 4: 1.15, 5: 1.05, 6: 1 } as const

interface Fonts {
  get: (r: Run) => PDFFont
}

interface Word {
  text: string
  width: number
  run: Run
  font: PDFFont
  space: boolean
}

export async function blocksToPdf(blocks: Block[], opts: BlocksToPdfOptions, onProgress: ProgressFn = () => {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  const cache = new Map<string, PDFFont>()
  const names: Record<string, StandardFonts> = {
    'n00': StandardFonts.Helvetica, 'n10': StandardFonts.HelveticaBold, 'n01': StandardFonts.HelveticaOblique, 'n11': StandardFonts.HelveticaBoldOblique,
    'm00': StandardFonts.Courier, 'm10': StandardFonts.CourierBold, 'm01': StandardFonts.CourierOblique, 'm11': StandardFonts.CourierBoldOblique,
  }
  for (const k of Object.keys(names)) cache.set(k, await doc.embedFont(names[k]))
  const fonts: Fonts = {
    get: (r) => cache.get(`${r.mono || opts.mono ? 'm' : 'n'}${r.bold ? 1 : 0}${r.italic ? 1 : 0}`)!,
  }
  const [PW, PH] = PAGE_SIZES[opts.pageSize]
  const M = opts.margin
  const contentW = PW - 2 * M
  let page: PDFPage = doc.addPage([PW, PH])
  let y = PH - M
  const newPage = () => {
    page = doc.addPage([PW, PH])
    y = PH - M
  }
  const ensure = (h: number) => {
    if (y - h < M) newPage()
  }
  const linkRects: { page: PDFPage; x: number; y: number; w: number; h: number; url: string }[] = []

  const wordsOf = (runs: Run[], size: number): Word[] => {
    const out: Word[] = []
    for (const run of runs) {
      const font = fonts.get(run)
      const text = run.text.replace(/\t/g, '    ').replace(/[\r ]/g, ' ')
      for (const tok of text.split(/( +|\n)/)) {
        if (tok === '') continue
        const safe = canEncode(font, tok) ? tok : [...tok].map((c) => (canEncode(font, c) ? c : '?')).join('')
        out.push({ text: safe, width: font.widthOfTextAtSize(safe, size), run, font, space: /^ +$/.test(tok) })
      }
    }
    return out
  }

  const drawRuns = (runs: Run[], size: number, x0: number, width: number, align: 'left' | 'center' | 'right' = 'left', lineGap = 1.3) => {
    const words = wordsOf(runs, size)
    const lines: Word[][] = [[]]
    let lw = 0
    for (const w of words) {
      if (w.text === '\n') {
        lines.push([])
        lw = 0
        continue
      }
      if (lw + w.width > width && !w.space && lines[lines.length - 1].some((q) => !q.space)) {
        while (lines[lines.length - 1].at(-1)?.space) lines[lines.length - 1].pop()
        lines.push([])
        lw = 0
      }
      if (w.space && lw === 0) continue
      lines[lines.length - 1].push(w)
      lw += w.width
    }
    const lh = size * lineGap
    for (const line of lines) {
      ensure(lh)
      const total = line.reduce((s, w) => s + w.width, 0)
      let x = align === 'center' ? x0 + (width - total) / 2 : align === 'right' ? x0 + width - total : x0
      const base = y - size
      for (const w of line) {
        if (!w.space && w.text) {
          const col = w.run.color ? rgb(...hexToUnit(w.run.color)) : w.run.link ? rgb(0.1, 0.3, 0.8) : rgb(0.08, 0.08, 0.1)
          page.drawText(w.text, { x, y: base, size, font: w.font, color: col })
          if (w.run.underline || w.run.link) page.drawLine({ start: { x, y: base - size * 0.12 }, end: { x: x + w.width, y: base - size * 0.12 }, thickness: size * 0.05, color: col })
          if (w.run.link) linkRects.push({ page, x, y: base - size * 0.2, w: w.width, h: size * 1.1, url: w.run.link })
        }
        x += w.width
      }
      y -= lh
    }
  }

  let n = 0
  for (const b of blocks) {
    const size = opts.fontSize
    switch (b.type) {
      case 'heading': {
        const s = size * HEADING_SCALE[b.level]
        ensure(s * 2.4)
        y -= s * 0.5
        drawRuns(b.runs.map((r) => ({ ...r, bold: true })), s, M, contentW, 'left', 1.25)
        y -= s * 0.25
        break
      }
      case 'paragraph':
        drawRuns(b.runs, size, M, contentW, b.align ?? 'left')
        y -= size * 0.7
        break
      case 'quote':
        page.drawRectangle({ x: M, y: y - size * 1.4, width: 2, height: size * 1.4, color: rgb(0.7, 0.7, 0.75) })
        drawRuns(b.runs.map((r) => ({ ...r, italic: true })), size, M + 12, contentW - 12)
        y -= size * 0.7
        break
      case 'list':
        b.items.forEach((item, i) => {
          ensure(size * 1.4)
          const marker = b.ordered ? `${i + 1}.` : '•'
          const f = fonts.get({ text: '' })
          page.drawText(marker, { x: M + 4, y: y - size, size, font: f, color: rgb(0.08, 0.08, 0.1) })
          drawRuns(item, size, M + 22, contentW - 22)
        })
        y -= size * 0.6
        break
      case 'pre':
        for (const line of b.text.split('\n')) drawRuns([{ text: line || ' ', mono: true }], size * 0.9, M, contentW, 'left', 1.25)
        y -= size * 0.6
        break
      case 'hr':
        ensure(size)
        y -= size * 0.4
        page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.7, color: rgb(0.75, 0.75, 0.78) })
        y -= size * 0.6
        break
      case 'pagebreak':
        newPage()
        break
      case 'image': {
        const img: PDFImage = b.mime === 'image/jpeg' ? await doc.embedJpg(b.bytes) : await doc.embedPng(b.bytes)
        const k = Math.min(1, contentW / b.width, (PH - 2 * M) / b.height)
        const w = b.width * k
        const h = b.height * k
        ensure(h)
        page.drawImage(img, { x: M, y: y - h, width: w, height: h })
        y -= h + size * 0.7
        break
      }
      case 'table': {
        const cols = Math.max(1, ...b.rows.map((r) => r.length))
        const cw = contentW / cols
        const pad = 3
        b.rows.forEach((row, ri) => {
          // measure the tallest cell
          const heights = row.map((cell) => estimateHeight(cell, size * 0.9, cw - 2 * pad, fonts))
          const rh = Math.max(size * 1.6, ...heights) + 2 * pad
          ensure(rh)
          const top = y
          row.forEach((cell, ci) => {
            const x = M + ci * cw
            const head = b.header && ri === 0
            page.drawRectangle({ x, y: top - rh, width: cw, height: rh, borderColor: rgb(0.7, 0.7, 0.75), borderWidth: 0.6, color: head ? rgb(0.93, 0.94, 0.97) : undefined })
            const saveY = y
            y = top - pad
            drawRuns(head ? cell.map((r) => ({ ...r, bold: true })) : cell, size * 0.9, x + pad, cw - 2 * pad)
            y = saveY
          })
          y = top - rh
        })
        y -= size * 0.7
        break
      }
    }
    n++
    if (n % 25 === 0) onProgress(n / blocks.length)
  }
  for (const l of linkRects) {
    const ctx = doc.context
    const ok = /^(https?:|mailto:|tel:)/i.test(l.url)
    if (!ok) continue
    const ref = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [l.x, l.y, l.x + l.w, l.y + l.h], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFHexString.fromText(l.url) } } as never))
    l.page.node.addAnnot(ref)
  }
  if (opts.title) doc.setTitle(opts.title)
  doc.setProducer('OurPDF')
  collectGarbage(doc)
  onProgress(1)
  return doc.save()
}

function estimateHeight(cell: Run[], size: number, width: number, fonts: Fonts): number {
  let lines = 1
  let lw = 0
  for (const run of cell) {
    const f = fonts.get(run)
    for (const tok of run.text.split(/( +|\n)/)) {
      if (tok === '') continue
      if (tok === '\n') {
        lines++
        lw = 0
        continue
      }
      const safe = canEncode(f, tok) ? tok : '?'.repeat(tok.length)
      const w = f.widthOfTextAtSize(safe, size)
      if (lw + w > width && lw > 0 && !/^ +$/.test(tok)) {
        lines++
        lw = 0
      }
      lw += w
    }
  }
  return lines * size * 1.3
}

export function textToBlocks(text: string): Block[] {
  return [{ type: 'pre', text }]
}
void PDFName
