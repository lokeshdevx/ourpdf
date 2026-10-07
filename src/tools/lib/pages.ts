import { PDFDocument, PDFPage, concatTransformationMatrix, degrees, drawObject, popGraphicsState, pushGraphicsState, rgb, type PDFEmbeddedPage } from 'pdf-lib'
import { PAGE_SIZES } from '@/lib/geometry'
import { closePdf, loadDoc, openPdfjs, pageText, renderPage, saveDoc, subset, type PdfJsDoc } from './pdf'

/* ------------------------------------------------------------ matrices */

/** Affine matrix in PDF row-vector form [a b c d e f]. */
export type Mat = [number, number, number, number, number, number]
/** `first` then `then`. */
export function mul(A: Mat, B: Mat): Mat {
  return [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3], A[4] * B[0] + A[5] * B[2] + B[4], A[4] * B[1] + A[5] * B[3] + B[5]]
}
export function invert(m: Mat): Mat {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}
const apply = (m: Mat, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const

/** Maps unrotated page space (w × h) to visual space for a clockwise /Rotate of r degrees (origin bottom-left). */
export function rotationMatrix(r: number, w: number, h: number): Mat {
  switch (((r % 360) + 360) % 360) {
    case 90: return [0, -1, 1, 0, 0, w]
    case 180: return [-1, 0, 0, -1, w, h]
    case 270: return [0, 1, -1, 0, h, 0]
    default: return [1, 0, 0, 1, 0, 0]
  }
}

/** Visual size of a page (after its /Rotate). */
export function visualSize(page: PDFPage): { w: number; h: number } {
  const { width, height } = page.getCropBox()
  return page.getRotation().angle % 180 ? { w: height, h: width } : { w: width, h: height }
}

let xoCounter = 0
/**
 * Draws an embedded page (as it appears visually, rotation included) scaled to fit inside the rect, centred.
 * `flipH` / `flipV` mirror it inside that rect.
 */
export function placePage(target: PDFPage, emb: PDFEmbeddedPage, rotation: number, rect: { x: number; y: number; w: number; h: number }, opts: { flipH?: boolean; flipV?: boolean; fill?: boolean } = {}) {
  const ew = emb.width
  const eh = emb.height
  const rot = rotationMatrix(rotation, ew, eh)
  const vw = rotation % 180 ? eh : ew
  const vh = rotation % 180 ? ew : eh
  const s = opts.fill ? 1 : Math.min(rect.w / vw, rect.h / vh)
  const sx = opts.fill ? rect.w / vw : s
  const sy = opts.fill ? rect.h / vh : s
  const ox = rect.x + (rect.w - vw * sx) / 2
  const oy = rect.y + (rect.h - vh * sy) / 2
  let m = mul(rot, [sx, 0, 0, sy, ox, oy])
  if (opts.flipH) m = mul(m, [-1, 0, 0, 1, 2 * ox + vw * sx, 0])
  if (opts.flipV) m = mul(m, [1, 0, 0, -1, 0, 2 * oy + vh * sy])
  const name = target.node.newXObject(`OP${(xoCounter++).toString(36)}`, emb.ref)
  target.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m), drawObject(name), popGraphicsState())
}

async function embedAll(out: PDFDocument, src: PDFDocument) {
  const pages = src.getPages()
  const embedded = await out.embedPages(pages, pages.map((p) => {
    const b = p.getCropBox()
    return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height }
  }))
  return pages.map((p, i) => ({ emb: embedded[i], rotation: p.getRotation().angle, ...visualSize(p) }))
}

/* ------------------------------------------------------------- merging */

export async function mergePdfs(files: { bytes: Uint8Array; password?: string }[], onProgress?: (f: number) => void): Promise<Uint8Array> {
  const out = await PDFDocument.create({ updateMetadata: false })
  for (let i = 0; i < files.length; i++) {
    const src = await loadDoc(files[i].bytes, files[i].password)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
    onProgress?.((i + 1) / files.length)
  }
  return saveDoc(out)
}

/** Interleaves pages: `chunk` pages from each file in turn. `reverse[i]` reverses that file first (duplex back sides). */
export async function alternatePdfs(files: Uint8Array[], opts: { chunk: number; reverse: boolean[]; repeatShort?: boolean }): Promise<Uint8Array> {
  const out = await PDFDocument.create({ updateMetadata: false })
  const srcs = await Promise.all(files.map((b) => loadDoc(b)))
  const orders = srcs.map((d, i) => {
    const idx = d.getPageIndices()
    return opts.reverse[i] ? idx.reverse() : idx
  })
  const cursors = orders.map(() => 0)
  const chunk = Math.max(1, opts.chunk)
  while (cursors.some((c, i) => c < orders[i].length)) {
    for (let i = 0; i < srcs.length; i++) {
      const take = orders[i].slice(cursors[i], cursors[i] + chunk)
      cursors[i] += chunk
      if (!take.length) continue
      const pages = await out.copyPages(srcs[i], take)
      pages.forEach((p) => out.addPage(p))
    }
  }
  return saveDoc(out)
}

/* ------------------------------------------------------------ splitting */

export interface Part { name: string; bytes: Uint8Array; pages: number }

export async function splitByGroups(bytes: Uint8Array, groups: number[][], label: (i: number, g: number[]) => string): Promise<Part[]> {
  const src = await loadDoc(bytes)
  const out: Part[] = []
  for (let i = 0; i < groups.length; i++) {
    if (!groups[i].length) continue
    out.push({ name: label(i, groups[i]), bytes: await subset(src, groups[i]), pages: groups[i].length })
  }
  return out
}

/** Starts a new part at every page whose text contains `phrase`. */
export async function splitByText(bytes: Uint8Array, phrase: string, opts: { caseSensitive: boolean; splitAfter: boolean; onProgress?: (f: number) => void }): Promise<{ starts: number[]; titles: string[]; groups: number[][] }> {
  const needle = opts.caseSensitive ? phrase : phrase.toLowerCase()
  const doc = await openPdfjs(bytes)
  const hits: number[] = []
  const titles: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const t = await pageText(page)
    const hay = (opts.caseSensitive ? t.text : t.text.toLowerCase()).replace(/\s+/g, ' ')
    const pos = hay.indexOf(needle.replace(/\s+/g, ' '))
    if (pos >= 0) {
      hits.push(i - 1)
      const line = t.text.split('\n').find((l) => (opts.caseSensitive ? l : l.toLowerCase()).includes(needle)) ?? phrase
      titles.push(line.trim().slice(0, 60))
    }
    page.cleanup()
    opts.onProgress?.(i / doc.numPages)
  }
  const n = doc.numPages
  await closePdf(doc)
  const starts = opts.splitAfter ? [0, ...hits.map((h) => h + 1).filter((h) => h < n)] : hits[0] === 0 ? hits : [0, ...hits]
  const uniq = [...new Set(starts)].sort((a, b) => a - b)
  const groups = uniq.map((s, i) => Array.from({ length: (uniq[i + 1] ?? n) - s }, (_, k) => s + k))
  return { starts: uniq, titles, groups }
}

export interface OutlineEntry { title: string; page: number; level: number }

/** Flattened outline with resolved 0-based page numbers. */
export async function readOutline(doc: PdfJsDoc): Promise<OutlineEntry[]> {
  const outline = await doc.getOutline()
  const out: OutlineEntry[] = []
  const walk = async (items: typeof outline, level: number) => {
    for (const it of items ?? []) {
      let page = -1
      try {
        const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest
        if (Array.isArray(dest) && dest[0]) page = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0])
      } catch {
        /* unresolved destination */
      }
      out.push({ title: it.title || 'Untitled', page, level })
      if (it.items?.length) await walk(it.items, level + 1)
    }
  }
  await walk(outline, 1)
  return out
}

export function bookmarkGroups(entries: OutlineEntry[], level: number, count: number): { title: string; pages: number[] }[] {
  const starts = entries.filter((e) => e.level <= level && e.page >= 0).sort((a, b) => a.page - b.page)
  const dedup: OutlineEntry[] = []
  for (const s of starts) {
    if (dedup.length && dedup[dedup.length - 1].page === s.page) continue
    dedup.push(s)
  }
  const groups: { title: string; pages: number[] }[] = []
  if (dedup.length && dedup[0].page > 0) groups.push({ title: 'Front matter', pages: Array.from({ length: dedup[0].page }, (_, i) => i) })
  dedup.forEach((s, i) => {
    const end = dedup[i + 1]?.page ?? count
    groups.push({ title: s.title, pages: Array.from({ length: end - s.page }, (_, k) => s.page + k) })
  })
  return groups
}

/** Greedy split so each part stays under `limit` bytes (binary search on the number of pages per part). */
export async function splitBySize(bytes: Uint8Array, limit: number, onProgress?: (f: number) => void): Promise<{ parts: Part[]; oversized: number[] }> {
  const src = await loadDoc(bytes)
  const n = src.getPageCount()
  const parts: Part[] = []
  const oversized: number[] = []
  let start = 0
  const build = (a: number, k: number) => subset(src, Array.from({ length: k }, (_, i) => a + i))
  while (start < n) {
    let lo = 1
    let best: Uint8Array | null = null
    let bestK = 0
    let k = 1
    // grow exponentially until too big, then binary search
    let hi = -1
    while (start + k <= n) {
      const b = await build(start, k)
      if (b.length <= limit) {
        best = b
        bestK = k
        lo = k
        if (start + k === n) break
        k = Math.min(n - start, k * 2)
        if (k === lo) break
      } else {
        hi = k
        break
      }
    }
    if (hi > 0) {
      let a = lo
      let z = hi
      while (z - a > 1) {
        const mid = (a + z) >> 1
        const b = await build(start, mid)
        if (b.length <= limit) {
          best = b
          bestK = mid
          a = mid
        } else z = mid
      }
    }
    if (!best) {
      best = await build(start, 1)
      bestK = 1
      oversized.push(start)
    }
    parts.push({ name: '', bytes: best, pages: bestK })
    start += bestK
    onProgress?.(start / n)
  }
  return { parts, oversized }
}

/** Slices every page into two halves (book scans). `order` decides which half comes first. */
export async function splitPagesInHalf(bytes: Uint8Array, opts: { direction: 'vertical' | 'horizontal'; rtl: boolean; skipFirst: boolean; skipLast: boolean }): Promise<Uint8Array> {
  const src = await loadDoc(bytes)
  const out = await PDFDocument.create({ updateMetadata: false })
  const n = src.getPageCount()
  for (let i = 0; i < n; i++) {
    if ((opts.skipFirst && i === 0) || (opts.skipLast && i === n - 1 && n > 1)) {
      const [p] = await out.copyPages(src, [i])
      out.addPage(p)
      continue
    }
    const sp = src.getPage(i)
    const box = sp.getCropBox()
    const rot = sp.getRotation().angle
    const R = rotationMatrix(rot, box.width, box.height)
    const Ri = invert(R)
    const vw = rot % 180 ? box.height : box.width
    const vh = rot % 180 ? box.width : box.height
    const halves = opts.direction === 'vertical'
      ? [[0, 0, vw / 2, vh], [vw / 2, 0, vw, vh]]
      : [[0, vh / 2, vw, vh], [0, 0, vw, vh / 2]]
    if (opts.rtl) halves.reverse()
    for (const [x0, y0, x1, y1] of halves) {
      const pts = [apply(Ri, x0, y0), apply(Ri, x1, y1)]
      const left = box.x + Math.min(pts[0][0], pts[1][0])
      const bottom = box.y + Math.min(pts[0][1], pts[1][1])
      const w = Math.abs(pts[0][0] - pts[1][0])
      const h = Math.abs(pts[0][1] - pts[1][1])
      const [p] = await out.copyPages(src, [i])
      p.setMediaBox(left, bottom, w, h)
      p.setCropBox(left, bottom, w, h)
      p.setTrimBox(left, bottom, w, h)
      p.setBleedBox(left, bottom, w, h)
      out.addPage(p)
    }
  }
  return saveDoc(out)
}

/* --------------------------------------------------------- transforming */

export async function rotatePages(bytes: Uint8Array, indices: number[], angle: number): Promise<Uint8Array> {
  const doc = await loadDoc(bytes)
  const set = new Set(indices)
  doc.getPages().forEach((p, i) => {
    if (!set.has(i)) return
    p.setRotation(degrees((((p.getRotation().angle + angle) % 360) + 360) % 360))
  })
  return saveDoc(doc)
}

export async function flipPdf(bytes: Uint8Array, mode: 'horizontal' | 'vertical' | 'both', indices?: number[]): Promise<Uint8Array> {
  const src = await loadDoc(bytes)
  const out = await PDFDocument.create({ updateMetadata: false })
  const info = await embedAll(out, src)
  const set = indices ? new Set(indices) : null
  for (let i = 0; i < info.length; i++) {
    const it = info[i]
    const page = out.addPage([it.w, it.h])
    const flip = !set || set.has(i)
    placePage(page, it.emb, it.rotation, { x: 0, y: 0, w: it.w, h: it.h }, { flipH: flip && mode !== 'vertical', flipV: flip && mode !== 'horizontal', fill: true })
  }
  return saveDoc(out)
}

export type SheetSize = 'source' | 'A4' | 'Letter' | 'A3' | 'Legal'

export function gridFor(n: number): [number, number] {
  return ({ 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3], 16: [4, 4] } as Record<number, [number, number]>)[n] ?? [2, 2]
}

/** N-up imposition: `perSheet` pages per sheet, in rows (or columns), with optional borders. */
export async function nUp(bytes: Uint8Array, opts: { perSheet: number; sheet: SheetSize; orientation: 'auto' | 'portrait' | 'landscape'; margin: number; gap: number; border: boolean; order: 'rows' | 'columns' }): Promise<Uint8Array> {
  const src = await loadDoc(bytes)
  const out = await PDFDocument.create({ updateMetadata: false })
  const info = await embedAll(out, src)
  if (!info.length) throw new Error('The PDF has no pages')
  let [cols, rows] = gridFor(opts.perSheet)
  const first = info[0]
  let [sw, sh] = opts.sheet === 'source' ? [first.w, first.h] : PAGE_SIZES[opts.sheet]
  // a portrait source page in a 2/6/8-up grid prefers a landscape sheet; 4/9/16 keep the source orientation
  const wantLandscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && ((cols !== rows) === (first.h >= first.w)))
  if (wantLandscape !== sw > sh) [sw, sh] = [sh, sw]
  if (sh > sw && cols > rows) [cols, rows] = [rows, cols]
  if (sw > sh && rows > cols) [cols, rows] = [rows, cols]
  const cellW = (sw - 2 * opts.margin - (cols - 1) * opts.gap) / cols
  const cellH = (sh - 2 * opts.margin - (rows - 1) * opts.gap) / rows
  const per = cols * rows
  for (let s = 0; s < info.length; s += per) {
    const page = out.addPage([sw, sh])
    for (let k = 0; k < per && s + k < info.length; k++) {
      const c = opts.order === 'rows' ? k % cols : Math.floor(k / rows)
      const r = opts.order === 'rows' ? Math.floor(k / cols) : k % rows
      const x = opts.margin + c * (cellW + opts.gap)
      const y = sh - opts.margin - (r + 1) * cellH - r * opts.gap
      const it = info[s + k]
      placePage(page, it.emb, it.rotation, { x, y, w: cellW, h: cellH })
      if (opts.border) page.drawRectangle({ x, y, width: cellW, height: cellH, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 })
    }
  }
  return saveDoc(out)
}

/** Fits every page onto a fixed paper size (centred, aspect kept). */
export async function resizePages(bytes: Uint8Array, size: 'A4' | 'Letter' | 'A3' | 'Legal' | 'A5', margin: number): Promise<Uint8Array> {
  const src = await loadDoc(bytes)
  const out = await PDFDocument.create({ updateMetadata: false })
  const info = await embedAll(out, src)
  for (const it of info) {
    let [w, h] = PAGE_SIZES[size]
    if (it.w > it.h) [w, h] = [h, w]
    const page = out.addPage([w, h])
    placePage(page, it.emb, it.rotation, { x: margin, y: margin, w: w - 2 * margin, h: h - 2 * margin })
  }
  return saveDoc(out)
}

/* ------------------------------------------------------------- cropping */

export interface Margins { top: number; right: number; bottom: number; left: number }

/** Shrinks the visible area (CropBox) by fixed margins in points, measured on the page as displayed. */
export async function cropMargins(bytes: Uint8Array, m: Margins, indices?: number[]): Promise<Uint8Array> {
  const doc = await loadDoc(bytes)
  const set = indices ? new Set(indices) : null
  doc.getPages().forEach((p, i) => {
    if (set && !set.has(i)) return
    const box = p.getCropBox()
    const rot = p.getRotation().angle
    // visual margins → unrotated box edges
    const [t, r, b, l] = rot === 90 ? [m.right, m.bottom, m.left, m.top] : rot === 180 ? [m.bottom, m.left, m.top, m.right] : rot === 270 ? [m.left, m.top, m.right, m.bottom] : [m.top, m.right, m.bottom, m.left]
    const w = Math.max(10, box.width - l - r)
    const h = Math.max(10, box.height - t - b)
    p.setCropBox(box.x + l, box.y + b, w, h)
    p.setTrimBox(box.x + l, box.y + b, w, h)
  })
  return saveDoc(doc)
}

/** Detects the content bounds of every page by rendering it and trims the white margins (plus padding). */
export async function autoTrim(bytes: Uint8Array, padding: number, onProgress?: (f: number) => void): Promise<Uint8Array> {
  const js = await openPdfjs(bytes)
  const doc = await loadDoc(bytes)
  const pages = doc.getPages()
  for (let i = 0; i < js.numPages; i++) {
    const page = await js.getPage(i + 1)
    const vp = page.getViewport({ scale: 1 })
    const k = 0.75
    const c = await renderPage(page, k)
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const o = (y * c.width + x) * 4
      if (d[o] < 235 || d[o + 1] < 235 || d[o + 2] < 235) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    page.cleanup()
    if (x1 >= 0) {
      const m: Margins = {
        left: Math.max(0, x0 / k - padding), top: Math.max(0, y0 / k - padding),
        right: Math.max(0, vp.width - (x1 + 1) / k - padding), bottom: Math.max(0, vp.height - (y1 + 1) / k - padding),
      }
      const p = pages[i]
      const box = p.getCropBox()
      const rot = p.getRotation().angle
      const [t, r, b, l] = rot === 90 ? [m.right, m.bottom, m.left, m.top] : rot === 180 ? [m.bottom, m.left, m.top, m.right] : rot === 270 ? [m.left, m.top, m.right, m.bottom] : [m.top, m.right, m.bottom, m.left]
      p.setCropBox(box.x + l, box.y + b, Math.max(10, box.width - l - r), Math.max(10, box.height - t - b))
    }
    onProgress?.((i + 1) / js.numPages)
  }
  await closePdf(js)
  return saveDoc(doc)
}
