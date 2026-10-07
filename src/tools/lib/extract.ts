import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, PDFHexString, decodePDFRawStream } from 'pdf-lib'
import { escapeHtml } from '@/lib/html'
import { canvasBlob, closePdf, groupLines, loadDoc, openPdfjs, pageText, paragraphs, renderPage, type Line, type TextRun } from './pdf'

/* ------------------------------------------------------- embedded images */

export interface ExtractedImage { name: string; blob: Blob; width: number; height: number; page: number; format: string }

const nm = (o: unknown) => (o instanceof PDFName ? o.asString() : '')
const n = (o: unknown) => (o instanceof PDFNumber ? o.asNumber() : 0)

function filters(dict: PDFDict): string[] {
  const f = dict.lookup(PDFName.of('Filter'))
  if (f instanceof PDFName) return [f.asString()]
  if (f instanceof PDFArray) return f.asArray().map(nm)
  return []
}

interface CS { comps: number; palette?: Uint8Array; base?: number; cmyk?: boolean }
function colourSpace(cs: unknown, lookup: (o: unknown) => unknown): CS | null {
  const v = lookup(cs)
  const name = nm(v)
  if (name === '/DeviceRGB' || name === '/CalRGB') return { comps: 3 }
  if (name === '/DeviceGray' || name === '/CalGray') return { comps: 1 }
  if (name === '/DeviceCMYK') return { comps: 4, cmyk: true }
  if (v instanceof PDFArray) {
    const kind = nm(v.lookup(0))
    if (kind === '/ICCBased') {
      const s = v.lookup(1)
      const comps = s instanceof PDFRawStream ? n(s.dict.lookup(PDFName.of('N'))) : 3
      return { comps, cmyk: comps === 4 }
    }
    if (kind === '/CalRGB' || kind === '/Lab') return { comps: 3 }
    if (kind === '/CalGray') return { comps: 1 }
    if (kind === '/Indexed') {
      const base = colourSpace(v.get(1), lookup)
      const tbl = v.lookup(3)
      let palette: Uint8Array | undefined
      if (tbl instanceof PDFString || tbl instanceof PDFHexString) palette = tbl.asBytes()
      else if (tbl instanceof PDFRawStream) palette = decodePDFRawStream(tbl).decode()
      if (!base || !palette) return null
      return { comps: 1, palette, base: base.comps }
    }
  }
  return null
}

function toRgba(data: Uint8Array, w: number, h: number, bpc: number, cs: CS, alpha?: Uint8Array): ImageData | null {
  const out = new ImageData(w, h)
  const d = out.data
  const rowBytes = Math.ceil((w * cs.comps * bpc) / 8)
  const sample = (row: number, idx: number) => {
    if (bpc === 8) return data[row * rowBytes + idx]
    if (bpc === 16) return data[row * rowBytes + idx * 2]
    const bit = idx * bpc
    const byte = data[row * rowBytes + (bit >> 3)]
    return (byte >> (8 - bpc - (bit & 7))) & ((1 << bpc) - 1)
  }
  const max = bpc === 16 ? 255 : (1 << Math.min(bpc, 8)) - 1
  if (data.length < rowBytes * h) return null
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      if (cs.palette) {
        const i = sample(y, x) * (cs.base ?? 3)
        if (cs.base === 1) d[o] = d[o + 1] = d[o + 2] = cs.palette[i]
        else if (cs.base === 4) {
          const [c, m, yy, k] = [cs.palette[i], cs.palette[i + 1], cs.palette[i + 2], cs.palette[i + 3]].map((v) => v / 255)
          d[o] = 255 * (1 - c) * (1 - k); d[o + 1] = 255 * (1 - m) * (1 - k); d[o + 2] = 255 * (1 - yy) * (1 - k)
        } else {
          d[o] = cs.palette[i]; d[o + 1] = cs.palette[i + 1]; d[o + 2] = cs.palette[i + 2]
        }
      } else if (cs.comps === 1) {
        d[o] = d[o + 1] = d[o + 2] = (sample(y, x) * 255) / max
      } else if (cs.comps === 3) {
        d[o] = (sample(y, x * 3) * 255) / max; d[o + 1] = (sample(y, x * 3 + 1) * 255) / max; d[o + 2] = (sample(y, x * 3 + 2) * 255) / max
      } else if (cs.comps === 4) {
        const [c, m, yy, k] = [0, 1, 2, 3].map((q) => sample(y, x * 4 + q) / max)
        d[o] = 255 * (1 - c) * (1 - k); d[o + 1] = 255 * (1 - m) * (1 - k); d[o + 2] = 255 * (1 - yy) * (1 - k)
      } else return null
      d[o + 3] = alpha ? alpha[y * w + x] ?? 255 : 255
    }
  }
  return out
}

async function imageDataPng(img: ImageData): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  c.getContext('2d')!.putImageData(img, 0, 0)
  return canvasBlob(c, 'image/png')
}

/** Pulls the embedded image streams out of a PDF. JPEG/JPEG 2000 images are saved byte-for-byte (original quality). */
export async function extractImages(bytes: Uint8Array, opts: { minSize: number; onProgress?: (f: number) => void }): Promise<{ images: ExtractedImage[]; skipped: number }> {
  const doc = await loadDoc(bytes)
  const ctx = doc.context
  const lookup = (o: unknown) => (o instanceof PDFRef ? ctx.lookup(o) : o)
  // map image refs to the first page that uses them
  const firstPage = new Map<string, number>()
  doc.getPages().forEach((p, pi) => {
    const visit = (res: unknown, depth: number) => {
      const r = lookup(res)
      if (!(r instanceof PDFDict) || depth > 4) return
      const xo = lookup(r.get(PDFName.of('XObject')))
      if (!(xo instanceof PDFDict)) return
      for (const [, ref] of xo.entries()) {
        const key = String(ref)
        if (!firstPage.has(key)) firstPage.set(key, pi)
        const obj = lookup(ref)
        if (obj instanceof PDFRawStream && nm(obj.dict.lookup(PDFName.of('Subtype'))) === '/Form') visit(obj.dict.get(PDFName.of('Resources')), depth + 1)
      }
    }
    visit(p.node.Resources(), 0)
  })
  const smasks = new Set<string>()
  const all = ctx.enumerateIndirectObjects()
  for (const [, obj] of all) if (obj instanceof PDFRawStream) {
    const sm = obj.dict.get(PDFName.of('SMask'))
    if (sm) smasks.add(String(sm))
  }
  const images: ExtractedImage[] = []
  let skipped = 0
  let k = 0
  for (const [ref, obj] of all) {
    k++
    if (!(obj instanceof PDFRawStream) || nm(obj.dict.lookup(PDFName.of('Subtype'))) !== '/Image') continue
    if (smasks.has(String(ref))) continue
    const w = n(obj.dict.lookup(PDFName.of('Width')))
    const h = n(obj.dict.lookup(PDFName.of('Height')))
    if (w < opts.minSize || h < opts.minSize) continue
    const page = (firstPage.get(String(ref)) ?? -1) + 1
    const f = filters(obj.dict)
    const base = `page${page || 'x'}-image${images.length + 1}`
    try {
      if (f.length === 1 && f[0] === '/DCTDecode') {
        images.push({ name: `${base}.jpg`, blob: new Blob([obj.contents as BlobPart], { type: 'image/jpeg' }), width: w, height: h, page, format: 'JPEG' })
        continue
      }
      if (f.length === 1 && f[0] === '/JPXDecode') {
        images.push({ name: `${base}.jp2`, blob: new Blob([obj.contents as BlobPart], { type: 'image/jp2' }), width: w, height: h, page, format: 'JPEG 2000' })
        continue
      }
      if (f.some((x) => ['/CCITTFaxDecode', '/JBIG2Decode', '/DCTDecode', '/JPXDecode'].includes(x))) {
        skipped++
        continue
      }
      const isMask = obj.dict.lookup(PDFName.of('ImageMask'))
      const bpc = isMask ? 1 : n(obj.dict.lookup(PDFName.of('BitsPerComponent'))) || 8
      const cs: CS | null = isMask ? { comps: 1 } : colourSpace(obj.dict.get(PDFName.of('ColorSpace')), lookup)
      if (!cs) {
        skipped++
        continue
      }
      const data = decodePDFRawStream(obj).decode()
      let alpha: Uint8Array | undefined
      const sm = lookup(obj.dict.get(PDFName.of('SMask')))
      if (sm instanceof PDFRawStream && n(sm.dict.lookup(PDFName.of('Width'))) === w && n(sm.dict.lookup(PDFName.of('Height'))) === h && n(sm.dict.lookup(PDFName.of('BitsPerComponent'))) === 8 && !filters(sm.dict).includes('/DCTDecode')) {
        alpha = decodePDFRawStream(sm).decode()
      }
      const rgba = toRgba(data, w, h, bpc, cs, alpha)
      if (!rgba) {
        skipped++
        continue
      }
      if (isMask) for (let i = 0; i < rgba.data.length; i += 4) {
        const v = rgba.data[i]
        rgba.data[i] = rgba.data[i + 1] = rgba.data[i + 2] = 0
        rgba.data[i + 3] = 255 - v
      }
      images.push({ name: `${base}.png`, blob: await imageDataPng(rgba), width: w, height: h, page, format: 'PNG' })
    } catch {
      skipped++
    }
    if (k % 20 === 0) opts.onProgress?.(k / all.length)
  }
  images.sort((a, b) => a.page - b.page)
  return { images, skipped }
}

/* ---------------------------------------------------------------- tables */

export type Cell = string | number
export interface PageTable { page: number; rows: Cell[][] }

interface Seg { x: number; right: number; text: string; size: number }

function segments(line: Line): Seg[] {
  const out: Seg[] = []
  for (const r of line.runs) {
    const last = out[out.length - 1]
    const gap = last ? r.x - last.right : Infinity
    if (last && gap < Math.max(r.size, last.size) * 1.1) {
      last.text += (gap > r.size * 0.15 && !last.text.endsWith(' ') && !r.str.startsWith(' ') ? ' ' : '') + r.str
      last.right = Math.max(last.right, r.x + r.w)
    } else if (r.str.trim()) out.push({ x: r.x, right: r.x + r.w, text: r.str, size: r.size })
  }
  return out.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() })).filter((s) => s.text)
}

export function toNumber(s: string): Cell {
  const t = s.replace(/[₹$€£,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  if (/^-?\d+(\.\d+)?%?$/.test(t) && t.length < 16) return t.endsWith('%') ? Number(t.slice(0, -1)) / 100 : Number(t)
  return s
}

/** Detects table-like rows by clustering cell positions into columns. */
export function detectTable(runs: TextRun[], opts: { numbers: boolean; onlyTables: boolean }): Cell[][] {
  const lines = groupLines(runs)
  const segs = lines.map(segments)
  const anchors: number[] = []
  const tol = 8
  for (const ss of segs) if (ss.length >= 2) for (const s of ss) {
    const hit = anchors.findIndex((a) => Math.abs(a - s.x) < tol)
    if (hit < 0) anchors.push(s.x)
  }
  anchors.sort((a, b) => a - b)
  const rows: Cell[][] = []
  for (const ss of segs) {
    if (!ss.length) continue
    if (ss.length < 2) {
      if (!opts.onlyTables) rows.push([ss[0].text])
      continue
    }
    const row: Cell[] = new Array(Math.max(1, anchors.length)).fill('')
    for (const s of ss) {
      let col = 0
      let best = Infinity
      anchors.forEach((a, i) => {
        // right-aligned numbers: also allow the segment's right edge to fall inside the column
        const next = anchors[i + 1] ?? Infinity
        const d = s.x >= a - tol && s.x < next - tol ? 0 : Math.abs(a - s.x)
        if (d < best) {
          best = d
          col = i
        }
      })
      const v = opts.numbers ? toNumber(s.text) : s.text
      row[col] = row[col] === '' ? v : `${row[col]} ${s.text}`
    }
    while (row.length > 1 && row[row.length - 1] === '') row.pop()
    rows.push(row)
  }
  return rows
}

export async function extractTables(bytes: Uint8Array, opts: { numbers: boolean; onlyTables: boolean; onProgress?: (f: number) => void }): Promise<PageTable[]> {
  const doc = await openPdfjs(bytes)
  const out: PageTable[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const t = await pageText(page)
    out.push({ page: i, rows: detectTable(t.runs, opts) })
    page.cleanup()
    opts.onProgress?.(i / doc.numPages)
  }
  await closePdf(doc)
  return out
}

export function toCsv(rows: Cell[][], sep = ','): string {
  const q = (c: Cell) => {
    const s = String(c)
    return /[",\n\r;]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(q).join(sep)).join('\r\n')
}

export function parseCsv(text: string, sep?: string): string[][] {
  const delim = sep ?? ([',', ';', '\t', '|'].map((d) => [d, (text.split('\n')[0].match(new RegExp(`\\${d}`, 'g')) ?? []).length] as const).sort((a, b) => b[1] - a[1])[0][0])
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') inQ = false
      else cell += c
    } else if (c === '"' && cell === '') inQ = true
    else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/* ------------------------------------------------------------ PDF → HTML */

const CSS_BASE = 'body{margin:0;background:#e5e7eb;font-family:system-ui,sans-serif}.page{position:relative;margin:16px auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);overflow:hidden}.page img.bg{position:absolute;inset:0;width:100%;height:100%}.t{position:absolute;white-space:pre;color:transparent;transform-origin:0 0;line-height:1}.t::selection{background:rgba(0,90,255,.3)}a.l{position:absolute;display:block}'

/** Pixel-accurate HTML: each page image with a transparent, selectable text layer and clickable links. */
export async function pdfToHtmlVisual(bytes: Uint8Array, opts: { scale: number; title: string; onProgress?: (f: number) => void }): Promise<string> {
  const doc = await openPdfjs(bytes)
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const canvas = await renderPage(page, opts.scale)
    const url = canvas.toDataURL('image/jpeg', 0.88)
    const t = await pageText(page)
    const spans = t.runs.filter((r) => r.str.trim()).map((r) => `<span class="t" style="left:${r.x.toFixed(1)}px;top:${r.y.toFixed(1)}px;font-size:${r.size.toFixed(1)}px;font-family:${escapeHtml(r.font)}" data-w="${r.w.toFixed(1)}">${escapeHtml(r.str)}</span>`).join('')
    const annots = await page.getAnnotations()
    const links = annots.filter((a: { subtype: string; url?: string }) => a.subtype === 'Link' && a.url).map((a: { rect: number[]; url: string }) => {
      const [x1, y1] = vp.convertToViewportPoint(a.rect[0], a.rect[1])
      const [x2, y2] = vp.convertToViewportPoint(a.rect[2], a.rect[3])
      return `<a class="l" href="${escapeHtml(a.url)}" rel="noopener noreferrer" style="left:${Math.min(x1, x2)}px;top:${Math.min(y1, y2)}px;width:${Math.abs(x2 - x1)}px;height:${Math.abs(y2 - y1)}px"></a>`
    }).join('')
    parts.push(`<div class="page" id="page-${i}" style="width:${vp.width}px;height:${vp.height}px"><img class="bg" alt="Page ${i}" src="${url}">${spans}${links}</div>`)
    page.cleanup()
    opts.onProgress?.(i / doc.numPages)
  }
  await closePdf(doc)
  // stretch each transparent span to the measured run width so selection lines up with the image
  const fit = '<script>for(const s of document.querySelectorAll(".t")){const w=+s.dataset.w,r=s.getBoundingClientRect().width;if(w&&r)s.style.transform="scaleX("+(w/r)+")"}</script>'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.title)}</title><style>${CSS_BASE}</style></head><body>${parts.join('\n')}${fit}</body></html>`
}

/** Semantic HTML: headings, paragraphs, detected tables and links – reflows on any screen. */
export async function pdfToHtmlSemantic(bytes: Uint8Array, opts: { title: string; tables: boolean; onProgress?: (f: number) => void }): Promise<string> {
  const doc = await openPdfjs(bytes)
  const body: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const t = await pageText(page)
    const lines = groupLines(t.runs)
    const tableRows = opts.tables ? detectTable(t.runs, { numbers: false, onlyTables: true }) : []
    if (tableRows.length >= 3 && tableRows.length > lines.length * 0.5) {
      body.push(`<table>${tableRows.map((r, ri) => `<tr>${r.map((c) => (ri === 0 ? `<th>${escapeHtml(String(c))}</th>` : `<td>${escapeHtml(String(c))}</td>`)).join('')}</tr>`).join('')}</table>`)
    } else {
      for (const p of paragraphs(lines)) {
        const tag = p.heading ? `h${p.heading}` : 'p'
        const html = escapeHtml(p.text).replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}" rel="noopener noreferrer">${u}</a>`)
        body.push(`<${tag}>${html}</${tag}>`)
      }
    }
    body.push(`<hr aria-label="End of page ${i}">`)
    page.cleanup()
    opts.onProgress?.(i / doc.numPages)
  }
  await closePdf(doc)
  const css = 'body{max-width:46rem;margin:2rem auto;padding:0 1rem;font:16px/1.6 Georgia,serif;color:#111}h1,h2,h3{font-family:system-ui,sans-serif;line-height:1.25}table{border-collapse:collapse;width:100%;margin:1rem 0;font:14px system-ui,sans-serif}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}hr{border:0;border-top:1px dashed #ccc;margin:2rem 0}'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.title)}</title><style>${css}</style></head><body>${body.join('\n')}</body></html>`
}
