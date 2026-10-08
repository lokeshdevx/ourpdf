import { esc, packageDocx, type DocxMedia } from './docx'
import { canvasBytes, closePdf, groupLines, openPdfjs, pageText, renderPage, type Line, type PdfJsPage, type TextRun } from './pdf'

/**
 * PDF → Word that looks like the PDF: every page becomes a Word section of the same size, every text line is placed at
 * its original position (exact line heights, indents and tab stops) in the PDF's own font, size, weight and colour,
 * and the page's pictures and graphics sit behind the text as one background image. The text stays fully editable.
 */

const SCALE = 2
const tw = (pt: number) => Math.round(pt * 20)

interface FontInfo { family: string; generic: 'serif' | 'sans-serif' | 'monospace'; bold: boolean; italic: boolean; descent: number }
/** `base` = the run's baseline (page points from the top). */
interface Piece { text: string; size: number; font: FontInfo; colour: string; base: number }
interface Seg { x: number; right: number; pieces: Piece[] }

/** Glyph extents above / below the baseline used to stack lines (cap height plus accents; font descent). */
const ASCENT = 0.8
const segTop = (s: Seg) => Math.min(...s.pieces.map((p) => p.base - ASCENT * p.size))
const segBottom = (s: Seg) => Math.max(...s.pieces.map((p) => p.base + p.font.descent * p.size))

/** Common PDF font names → the family Word knows (base-14 fonts get their metric-compatible Office twin). */
const FAMILIES: [RegExp, string][] = [
  [/^arialnarrow/, 'Arial Narrow'], [/^arialblack/, 'Arial Black'],
  [/^(helvetica|helv|arial|liberationsans|nimbussans|arimo)/, 'Arial'],
  [/^(times|liberationserif|nimbusroman|tinos)/, 'Times New Roman'],
  [/^(courier|liberationmono|nimbusmono|cousine)/, 'Courier New'],
  [/^(calibri|carlito)/, 'Calibri'], [/^(cambria|caladea)/, 'Cambria'], [/^georgia/, 'Georgia'], [/^verdana/, 'Verdana'], [/^tahoma/, 'Tahoma'],
  [/^segoeui/, 'Segoe UI'], [/^trebuchet/, 'Trebuchet MS'], [/^garamond/, 'Garamond'], [/^bookantiqua/, 'Book Antiqua'], [/^centurygothic/, 'Century Gothic'],
  [/^palatino/, 'Palatino Linotype'], [/^consolas/, 'Consolas'], [/^symbol/, 'Symbol'], [/^(zapfdingbats|dingbats)/, 'Wingdings'],
]
const GENERIC_FAMILY = { serif: 'Times New Roman', 'sans-serif': 'Arial', monospace: 'Courier New' } as const
const DESCENT: Record<string, number> = { Arial: 0.212, 'Times New Roman': 0.216, 'Courier New': 0.3, Calibri: 0.25, Cambria: 0.22 }

/** "SourceSansPro" → "Source Sans Pro", "DejaVuSerif" → "DejaVu Serif": split only before the usual family words. */
const familyName = (base: string) => base.replace(/(?<=[A-Za-z0-9])(Sans|Serif|Mono|Code|Pro|Std|Text|Display|Neue|Gothic|Slab|Condensed|Rounded|Round|Book|Grotesk|Grotesque)(?=[A-Z]|$)/g, ' $1').replace(/(?<= (?:Sans|Serif|Mono|Neue))(?=[A-Z][a-z])/g, ' ').trim()

interface PdfJsFont { name?: string; bold?: boolean; black?: boolean; italic?: boolean; isSerifFont?: boolean; isMonospace?: boolean }

function fontInfo(page: PdfJsPage, r: TextRun): FontInfo {
  const objs = (page as unknown as { commonObjs: { has(id: string): boolean; get(id: string): PdfJsFont } }).commonObjs
  let f: PdfJsFont | null = null
  try {
    if (r.fontId && objs.has(r.fontId)) f = objs.get(r.fontId)
  } catch { /* font not resolved – fall back to the generic family */ }
  const name = (f?.name ?? '').replace(/^[A-Z]{6}\+/, '')
  const generic: FontInfo['generic'] = f?.isMonospace || r.font === 'monospace' ? 'monospace' : f?.isSerifFont || r.font === 'serif' ? 'serif' : 'sans-serif'
  const base = name.split(/[-,]/)[0].replace(/(PSMT|PS|MT)$/, '')
  const key = base.replace(/[\s_]/g, '').toLowerCase()
  const known = FAMILIES.find(([re]) => re.test(key))?.[1]
  // unknown embedded fonts keep their own family name ("SourceSansPro" → "Source Sans Pro") so Word uses it when installed
  const family = known ?? (/^[a-z]/i.test(base) && base.length > 2 && !/^g_d\d/.test(base) ? familyName(base) : GENERIC_FAMILY[generic])
  return {
    family, generic,
    bold: !!(f?.bold || f?.black) || /bold|black|heavy|semibold|demi/i.test(name) || (!f && r.bold),
    italic: !!f?.italic || /italic|oblique/i.test(name) || r.italic,
    descent: DESCENT[family] ?? (generic === 'monospace' ? 0.3 : 0.22),
  }
}

/**
 * Text colour of a run: the pixels where the full render differs from the text-less render are its glyphs. `null` when
 * the run leaves no ink of its own – invisible OCR layers, or glyphs pdf.js draws as paths, which the background
 * image already shows (writing them again would print the text twice).
 */
function inkColour(full: ImageData, bg: ImageData, r: TextRun): string | null {
  const x0 = Math.max(0, Math.floor(r.x * SCALE)), x1 = Math.min(full.width, Math.ceil((r.x + r.w) * SCALE))
  const y0 = Math.max(0, Math.floor(r.y * SCALE)), y1 = Math.min(full.height, Math.ceil((r.y + r.h * 1.25) * SCALE))
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)))
  const hits: [number, number, number, number][] = []
  let max = 0
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const o = (y * full.width + x) * 4
    const d = Math.abs(full.data[o] - bg.data[o]) + Math.abs(full.data[o + 1] - bg.data[o + 1]) + Math.abs(full.data[o + 2] - bg.data[o + 2])
    if (d > 40) {
      hits.push([d, full.data[o], full.data[o + 1], full.data[o + 2]])
      if (d > max) max = d
    }
  }
  // only the most strongly inked pixels: glyph edges are blended with the background
  if (!hits.length) return null
  const core = hits.filter((h) => h[0] >= max * 0.9)
  let avg = [1, 2, 3].map((i) => core.reduce((s, h) => s + h[i], 0) / core.length)
  if (avg.every((v) => v < 48)) return '000000'
  if (avg.every((v) => v > 244)) return 'FFFFFF'
  // near-neutral → true grey (anti-aliasing adds a slight tint)
  if (Math.max(...avg) - Math.min(...avg) < 20) avg = avg.map(() => (avg[0] + avg[1] + avg[2]) / 3)
  return avg.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
}

function isBlank(img: ImageData): boolean {
  const d = img.data
  let ink = 0
  for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) ink++
  return ink < (d.length / 28) * 0.0005
}

let measureCtx: CanvasRenderingContext2D | null = null
function measure(p: Piece): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')!
  measureCtx.font = `${p.font.italic ? 'italic ' : ''}${p.font.bold ? 'bold ' : ''}${p.size}px "${p.font.family}", ${GENERIC_FAMILY[p.font.generic]}, ${p.font.generic}`
  return measureCtx.measureText(p.text).width
}

/** Word only knows half-point sizes. */
const wordSize = (s: number) => Math.max(1, Math.round(s * 2) / 2)

/** Splits a line into segments at wide gaps (columns, tabbed values); nearby runs join with a space. */
function segmentsOf(line: Line, page: PdfJsPage, ink: (r: TextRun) => string | null): Seg[] {
  const segs: Seg[] = []
  for (const r of line.runs) {
    // rotated text stays in the background picture (Word lines are horizontal)
    if (r.rotated) continue
    const colour = ink(r)
    if (colour === null) continue
    const text = r.str.replace(/\s+/g, ' ')
    const piece: Piece = { text, size: wordSize(r.size), font: fontInfo(page, r), colour, base: r.y + r.size }
    const last = segs[segs.length - 1]
    const gap = last ? r.x - last.right : Infinity
    if (last && gap < Math.max(r.size, 4) * 1.2) {
      const prev = last.pieces[last.pieces.length - 1]
      if (gap > r.size * 0.15 && !prev.text.endsWith(' ') && !text.startsWith(' ')) prev.text += ' '
      last.pieces.push(piece)
      last.right = Math.max(last.right, r.x + r.w)
    } else segs.push({ x: r.x, right: r.x + r.w, pieces: [piece] })
  }
  for (const s of segs) {
    s.pieces[0].text = s.pieces[0].text.trimStart()
    const end = s.pieces[s.pieces.length - 1]
    end.text = end.text.trimEnd()
  }
  return segs.filter((s) => s.pieces.some((p) => p.text))
}

function runXml(p: Piece, spacing: number, baseline: number) {
  const f = esc(p.font.family)
  const sz = Math.round(p.size * 2)
  // raised (in half points) from the paragraph's baseline to the run's own one: side-by-side columns, superscripts
  const rise = Math.round((baseline - p.base) * 2)
  const rpr = `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>${p.font.bold ? '<w:b/><w:bCs/>' : ''}${p.font.italic ? '<w:i/><w:iCs/>' : ''}${p.colour !== '000000' ? `<w:color w:val="${p.colour}"/>` : ''}${spacing ? `<w:spacing w:val="${spacing}"/>` : ''}${rise ? `<w:position w:val="${rise}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`
  return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${esc(p.text)}</w:t></w:r>`
}

/** The segment's runs, letter-spaced so the line is as wide in Word as in the PDF (keeps columns and right edges). */
function segXml(s: Seg, baseline: number) {
  const pieces = s.pieces.filter((p) => p.text)
  const chars = pieces.reduce((n, p) => n + p.text.length, 0)
  const measured = pieces.reduce((n, p) => n + measure(p), 0)
  const size = Math.max(...pieces.map((p) => p.size))
  let spacing = 0
  if (chars > 1 && measured > 0) {
    const perChar = Math.max(-0.2 * size, Math.min(0.25 * size, (s.right - s.x - measured) / chars))
    spacing = Math.round(perChar * 20)
  }
  return pieces.map((p) => runXml(p, spacing, baseline)).join('')
}

function anchorXml(id: number, wPt: number, hPt: number) {
  const cx = Math.round(wPt * 12700), cy = Math.round(hPt * 12700)
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="Page background ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="page-${id}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
}

const sectXml = (wPt: number, hPt: number, top: number) =>
  `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${tw(wPt)}" w:h="${tw(hPt)}"${wPt > hPt ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${top}" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`

interface PagePara { tabs: number[]; before: number; line: number; indent: number; content: string }

/**
 * Places each line at its PDF position: exact line height, space before = the gap to the previous line. Lines that sit
 * side by side (columns with different line spacing) share one paragraph, each run raised to its own baseline, so one
 * column never pushes the other down.
 */
function layoutPage(lines: Line[], hPt: number, segsOf: (l: Line) => Seg[]): { top: number; paras: PagePara[] } {
  const bands: Seg[][] = []
  for (const l of lines) {
    const segs = segsOf(l)
    if (!segs.length) continue
    const band = bands[bands.length - 1]
    const beside = band && Math.min(...segs.map(segTop)) < Math.max(...band.map(segBottom)) && segs.every((s) => band.every((o) => s.right + 2 < o.x || o.right + 2 < s.x))
    if (beside) band.push(...segs)
    else bands.push(segs)
  }
  const paras: PagePara[] = []
  const pageH = tw(hPt) - 10
  let first = 0
  let cursor: number | null = null
  for (const band of bands) {
    band.sort((a, b) => a.x - b.x)
    const pieces = band.flatMap((s) => s.pieces)
    // the lowest baseline is the paragraph's; everything else is raised to its own
    const main = pieces.reduce((a, b) => (b.base > a.base + 0.01 || (Math.abs(b.base - a.base) <= 0.01 && b.size > a.size) ? b : a))
    const bottom = tw(main.base + main.font.descent * main.size)
    const want = tw(Math.min(...band.map(segTop)))
    if (cursor === null) {
      first = Math.max(0, want)
      cursor = first
    }
    const top = Math.max(want, cursor)
    let before = top - cursor
    let line = Math.max(20, bottom - top)
    if (cursor + before + line > pageH) {
      before = Math.max(0, pageH - line - cursor)
      line = Math.max(20, Math.min(line, pageH - cursor - before))
    }
    cursor += before + line
    paras.push({ tabs: band.slice(1).map((s) => tw(s.x)), before, line, indent: Math.max(0, tw(band[0].x)), content: band.map((s) => segXml(s, main.base)).join('<w:r><w:tab/></w:r>') })
  }
  return { top: first, paras }
}

function paraXml(p: PagePara, extra = '', sect = '') {
  const tabs = p.tabs.length ? `<w:tabs>${p.tabs.map((t) => `<w:tab w:val="left" w:pos="${t}"/>`).join('')}</w:tabs>` : ''
  return `<w:p><w:pPr><w:widowControl w:val="0"/>${tabs}<w:snapToGrid w:val="0"/><w:spacing w:before="${p.before}" w:after="0" w:line="${p.line}" w:lineRule="exact"/><w:ind w:left="${p.indent}" w:right="0" w:firstLine="0"/>${sect}</w:pPr>${extra}${p.content}</w:p>`
}

export async function pdfToDocxLayout(bytes: Uint8Array, opts: { title: string; graphics: boolean; onProgress?: (f: number) => void }): Promise<Blob> {
  const doc = await openPdfjs(bytes)
  const media: DocxMedia[] = []
  const body: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    // both renders also load the page's fonts, so their real names can be read for the text runs
    const fullCanvas = await renderPage(page, SCALE)
    const bgCanvas = await renderPage(page, SCALE, { noText: 'upright' })
    const full = fullCanvas.getContext('2d')!.getImageData(0, 0, fullCanvas.width, fullCanvas.height)
    const bg = bgCanvas.getContext('2d')!.getImageData(0, 0, bgCanvas.width, bgCanvas.height)
    const t = await pageText(page)
    const lines = groupLines(t.runs)
    const { top, paras } = layoutPage(lines, vp.height, (l) => segmentsOf(l, page, (r) => inkColour(full, bg, r)))

    let background = ''
    if (opts.graphics && !isBlank(bg)) {
      media.push({ name: `image${media.length + 1}.jpg`, bytes: await canvasBytes(bgCanvas, 'image/jpeg', 0.88) })
      background = anchorXml(media.length, vp.width, vp.height)
    }
    fullCanvas.width = bgCanvas.width = 0
    if (!paras.length) paras.push({ tabs: [], before: 0, line: 20, indent: 0, content: '' })
    const sect = sectXml(vp.width, vp.height, top)
    // a section's properties live in its last paragraph, except the final section's, which closes the body
    const final = i === doc.numPages
    body.push(...paras.map((p, k) => paraXml(p, k === 0 ? background : '', !final && k === paras.length - 1 ? sect : '')))
    if (final) body.push(sect)
    page.cleanup()
    opts.onProgress?.(i / doc.numPages)
  }
  await closePdf(doc)
  return packageDocx(body.join(''), media, opts.title)
}
