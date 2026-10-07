import { PDFDocument, PDFPage, concatTransformationMatrix, degrees, popGraphicsState, pushGraphicsState, rgb, type PDFFont, type PDFImage } from 'pdf-lib'
import { hexToUnit } from '@/utils/color'
import { invert, rotationMatrix } from './pages'
import { loadDoc, saveDoc } from './pdf'
import { safe, standardFonts, unicodeFonts } from './fonts'

export type Position = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export const POSITIONS: Position[] = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']

const color = (hex: string) => {
  const [r, g, b] = hexToUnit(hex)
  return rgb(r, g, b)
}

/** Runs `draw` in the page's *visual* coordinate system (rotation and crop box applied, origin bottom-left). */
export function inVisualSpace(page: PDFPage, draw: (w: number, h: number) => void) {
  const box = page.getCropBox()
  const rot = page.getRotation().angle
  const Ri = invert(rotationMatrix(rot, box.width, box.height))
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, 1, box.x, box.y), concatTransformationMatrix(...Ri))
  draw(rot % 180 ? box.height : box.width, rot % 180 ? box.width : box.height)
  page.pushOperators(popGraphicsState())
}

export interface TokenCtx { n: number; total: number; file: string; now: Date }
export function fillTokens(template: string, c: TokenCtx): string {
  const d = c.now
  const pad = (x: number) => String(x).padStart(2, '0')
  return template
    .replace(/\{n\}|\{page\}/g, String(c.n))
    .replace(/\{total\}|\{pages\}/g, String(c.total))
    .replace(/\{file\}/g, c.file)
    .replace(/\{date\}/g, `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`)
    .replace(/\{iso\}/g, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    .replace(/\{time\}/g, `${pad(d.getHours())}:${pad(d.getMinutes())}`)
}

function drawAt(page: PDFPage, font: PDFFont, text: string, pos: Position, o: { size: number; margin: number; color: string; opacity?: number; bold?: boolean }) {
  inVisualSpace(page, (w, h) => {
    const t = safe(font, text)
    const tw = font.widthOfTextAtSize(t, o.size)
    const col = pos.endsWith('left') ? 0 : pos.endsWith('right') ? 2 : 1
    const row = pos.startsWith('top') ? 0 : pos.startsWith('bottom') ? 2 : 1
    const x = col === 0 ? o.margin : col === 2 ? w - o.margin - tw : (w - tw) / 2
    const y = row === 0 ? h - o.margin - o.size * 0.8 : row === 2 ? o.margin : (h - o.size) / 2
    page.drawText(t, { x, y, size: o.size, font, color: color(o.color), opacity: o.opacity ?? 1 })
  })
}

async function fontsFor(doc: PDFDocument, unicode: boolean) {
  return unicode ? unicodeFonts(doc) : standardFonts(doc)
}

/* --------------------------------------------------------- page numbers */

export interface PageNumberOptions {
  template: string
  position: Position
  start: number
  size: number
  margin: number
  color: string
  skipFirst: boolean
  pages?: number[]
}

export async function addPageNumbers(bytes: Uint8Array, o: PageNumberOptions, file = 'document'): Promise<Uint8Array> {
  const doc = await loadDoc(bytes)
  const { regular } = await fontsFor(doc, /[^\x20-\x7e]/.test(o.template))
  const pages = doc.getPages()
  const only = o.pages ? new Set(o.pages) : null
  const numbered = pages.map((_, i) => i).filter((i) => !(o.skipFirst && i === 0) && (!only || only.has(i)))
  const total = numbered.length + o.start - 1
  const now = new Date()
  numbered.forEach((idx, k) => drawAt(pages[idx], regular, fillTokens(o.template, { n: o.start + k, total, file, now }), o.position, o))
  return saveDoc(doc)
}

/* ------------------------------------------------------ headers/footers */

export interface HeaderFooterOptions {
  header: [string, string, string]
  footer: [string, string, string]
  size: number
  margin: number
  color: string
  skipFirst: boolean
  start: number
}

export async function addHeaderFooter(bytes: Uint8Array, o: HeaderFooterOptions, file = 'document'): Promise<Uint8Array> {
  const doc = await loadDoc(bytes)
  const all = [...o.header, ...o.footer].join('')
  const { regular } = await fontsFor(doc, /[^\x20-\x7e]/.test(all))
  const pages = doc.getPages()
  const now = new Date()
  const slots: [string, Position][] = [
    [o.header[0], 'top-left'], [o.header[1], 'top-center'], [o.header[2], 'top-right'],
    [o.footer[0], 'bottom-left'], [o.footer[1], 'bottom-center'], [o.footer[2], 'bottom-right'],
  ]
  pages.forEach((p, i) => {
    if (o.skipFirst && i === 0) return
    for (const [tpl, pos] of slots) if (tpl.trim()) drawAt(p, regular, fillTokens(tpl, { n: i + o.start, total: pages.length + o.start - 1, file, now }), pos, o)
  })
  return saveDoc(doc)
}

/* ---------------------------------------------------------------- Bates */

export interface BatesOptions { prefix: string; suffix: string; start: number; digits: number; position: Position; size: number; margin: number; color: string }

/** Stamps Bates numbers across several files, continuing the sequence from one file to the next. */
export async function batesNumber(files: { name: string; bytes: Uint8Array }[], o: BatesOptions): Promise<{ name: string; bytes: Uint8Array; first: string; last: string }[]> {
  let n = o.start
  const out = []
  for (const f of files) {
    const doc = await loadDoc(f.bytes)
    const { bold } = await standardFonts(doc)
    const label = (k: number) => `${o.prefix}${String(k).padStart(o.digits, '0')}${o.suffix}`
    const first = label(n)
    for (const p of doc.getPages()) drawAt(p, bold, label(n++), o.position, o)
    out.push({ name: f.name, bytes: await saveDoc(doc), first, last: label(n - 1) })
  }
  return out
}

/* ------------------------------------------------------------ watermark */

export interface WatermarkOptions {
  kind: 'text' | 'image'
  text: string
  image?: { bytes: Uint8Array; mime: string }
  size: number
  color: string
  opacity: number
  rotation: number
  position: Position
  tiled: boolean
  /** Image width as a fraction of page width. */
  scale: number
  bold: boolean
  pages?: number[]
}

export async function addWatermark(bytes: Uint8Array, o: WatermarkOptions): Promise<Uint8Array> {
  const doc = await loadDoc(bytes)
  const fonts = await fontsFor(doc, /[^\x20-\x7e]/.test(o.text))
  const font = o.bold ? fonts.bold : fonts.regular
  let img: PDFImage | null = null
  if (o.kind === 'image') {
    if (!o.image) throw new Error('Choose a watermark image')
    img = o.image.mime === 'image/png' ? await doc.embedPng(o.image.bytes) : await doc.embedJpg(o.image.bytes)
  }
  const only = o.pages ? new Set(o.pages) : null
  doc.getPages().forEach((page, i) => {
    if (only && !only.has(i)) return
    inVisualSpace(page, (w, h) => {
      const iw = img ? w * o.scale : font.widthOfTextAtSize(safe(font, o.text), o.size)
      const ih = img ? (iw * img.height) / img.width : o.size
      const stamp = (cx: number, cy: number) => {
        const rad = (o.rotation * Math.PI) / 180
        // rotate around the item's centre
        const x = cx - (Math.cos(rad) * iw) / 2 + (Math.sin(rad) * ih) / 2
        const y = cy - (Math.sin(rad) * iw) / 2 - (Math.cos(rad) * ih) / 2
        if (img) page.drawImage(img, { x, y, width: iw, height: ih, opacity: o.opacity, rotate: degrees(o.rotation) })
        else page.drawText(safe(font, o.text), { x, y: y + ih * 0.2, size: o.size, font, color: color(o.color), opacity: o.opacity, rotate: degrees(o.rotation) })
      }
      if (o.tiled) {
        const stepX = Math.max(iw, ih) * 1.6 + 40
        const stepY = Math.max(ih * 4, stepX * 0.6)
        let row = 0
        for (let y = -stepY; y < h + stepY; y += stepY, row++) for (let x = -stepX + (row % 2) * (stepX / 2); x < w + stepX; x += stepX) stamp(x, y)
      } else {
        const col = o.position.endsWith('left') ? 0 : o.position.endsWith('right') ? 2 : 1
        const row = o.position.startsWith('top') ? 0 : o.position.startsWith('bottom') ? 2 : 1
        const m = 36
        const cx = col === 0 ? m + iw / 2 : col === 2 ? w - m - iw / 2 : w / 2
        const cy = row === 0 ? h - m - ih / 2 : row === 2 ? m + ih / 2 : h / 2
        stamp(cx, cy)
      }
    })
  })
  return saveDoc(doc)
}
