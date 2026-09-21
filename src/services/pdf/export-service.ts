import { canEncodeText, spacelessExtra } from '@/engine/fonts'
import type { ExportPlan, InvisibleTextRun, PlanBookmark, PlanPage } from '@/engine/types'
import { AppError } from '@/lib/errors'
import { rectsIntersect, inflate } from '@/lib/geometry'
import { layoutTextObject, displayText, TEXT_PAD, type MeasureFn } from '@/lib/text-object'
import { baselineOffset } from '@/engine/fonts'
import { cssFontFamily } from '@/lib/fonts'
import { getLayers, getObjects } from '@/stores/annotation-store'
import { getPages } from '@/stores/page-store'
import { getDoc } from '@/stores/pdf-store'
import { customFontNames, getCustomFontBytes } from '@/services/fonts'
import { getAsset } from '@/services/assets'
import type { AttachmentInfo, Bookmark, EditObject, FieldObj, PageModel, Rect, SecuritySettings, TextObj } from '@/types'
import { toRoman, toAlpha } from '@/utils/pages'
import { getNativeRegistry } from './document-service'
import { bakeImage, imageKey } from './image-service'
import { canvasToBlob, MAX_CANVAS_PIXELS, MAX_CANVAS_SIDE, renderPageToCanvas } from './renderer'
import { getSourceBytes, getSource } from './sources'
import { getPageText } from './text'
import { pageLabelFor } from './page-service'
import { runEngine } from './worker-client'
import { isCustomFont } from '@/lib/fonts'

export interface ExportOptions {
  /** Export only these pages (in document order). */
  pageIds?: string[]
  /** Draw annotation/edit objects (default true). */
  annotations?: boolean
  /** Include form fields and their values (default true). */
  forms?: boolean
  flattenForms?: boolean
  security?: SecuritySettings | null
  removeMetadata?: boolean
  /** Replace every page with a raster (max compression). scale = px per pt. */
  rasterAll?: { scale: number; quality: number } | null
  /** Scale (px per pt) used to burn in redactions. 2.5 ≈ 180 dpi. */
  redactionScale?: number
  includeOcr?: boolean
  objectStreams?: boolean
  onProgress?: (fraction: number, label?: string) => void
  signal?: AbortSignal
  measure?: MeasureFn
}

const isField = (o: EditObject): o is FieldObj => o.type === 'field'

/** Converts a native form field into plain text on pages that get rasterised (fields can't live on a raster). */
function nativeFieldToText(f: FieldObj): TextObj {
  const value = f.ftype === 'checkbox' || f.ftype === 'radio' ? (f.value ? 'X' : '') : String(f.value ?? '')
  return {
    ...(f as unknown as TextObj),
    type: 'text',
    text: value,
    font: 'helvetica',
    fontSize: Math.max(6, Math.min(f.fontSize || 11, f.h * 0.72)),
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: '#000000',
    align: f.ftype === 'checkbox' || f.ftype === 'radio' ? 'center' : 'left',
    lineHeight: 1.1,
    letterSpacing: 0,
    bg: null,
    cover: null,
    autoFit: false,
    list: 'none',
    border: null,
    radius: 0,
    callout: null,
    link: null,
    heading: 0,
  }
}

export function planBookmarks(items: Bookmark[], pageIndexById: Map<string, number>): PlanBookmark[] {
  return items.map((b) => ({
    title: b.title,
    pageIndex: b.pageId != null ? (pageIndexById.get(b.pageId) ?? null) : null,
    y: b.y,
    children: planBookmarks(b.children, pageIndexById),
  }))
}

/** Rasterises a page with redaction rectangles burned into the pixels; nothing underneath survives. */
async function rasterizePage(page: PageModel, rects: Rect[], color: (r: Rect) => string, scale: number, quality: number, includeForms: boolean) {
  // Clamp to the browser's canvas limits; rectangles below use the clamped scale.
  const max = Math.sqrt(MAX_CANVAS_PIXELS / (page.width * page.height))
  scale = Math.max(0.5, Math.min(scale, max, MAX_CANVAS_SIDE / Math.max(page.width, page.height)))
  const canvas = await renderPageToCanvas(page, scale, { annotationMode: includeForms ? 'forms' : 'forms' })
  const ctx = canvas.getContext('2d')!
  for (const r of rects) {
    ctx.fillStyle = color(r)
    ctx.fillRect(Math.floor(r.x * scale), Math.floor(r.y * scale), Math.ceil(r.w * scale) + 1, Math.ceil(r.h * scale) + 1)
  }
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  const out = { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' as const, width: canvas.width, height: canvas.height }
  canvas.width = canvas.height = 0
  return out
}

/** Rasterises a text object (used when the PDF standard fonts cannot encode its characters). */
async function rasterizeText(o: TextObj, text: string, measure: MeasureFn): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const S = 3
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(o.w * S))
  c.height = Math.max(1, Math.ceil(o.h * S))
  const ctx = c.getContext('2d')!
  const { layout, fontSize } = layoutTextObject({ ...o, tile: null }, text, measure)
  ctx.fillStyle = o.color
  ctx.textBaseline = 'alphabetic'
  const face = !isCustomFont(o.font)
  ctx.font = `${face && o.italic ? 'italic ' : ''}${face && o.bold ? '700 ' : ''}${fontSize * S}px ${cssFontFamily(o.font, customFontNames())}`
  if ('fontKerning' in ctx) (ctx as unknown as { fontKerning: string }).fontKerning = 'none'
  if ('wordSpacing' in ctx) (ctx as unknown as { wordSpacing: string }).wordSpacing = `${spacelessExtra(o.font, fontSize) * S}px`
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${o.letterSpacing * S}px`
  const base = baselineOffset(o.font, fontSize, o.lineHeight)
  for (const ln of layout.lines) {
    const y = (TEXT_PAD + ln.y + base) * S
    const x = (TEXT_PAD + ln.x) * S
    if (ln.marker) ctx.fillText(ln.marker, (TEXT_PAD + (ln.markerX ?? 0)) * S, y)
    if (ln.text) {
      ctx.fillText(ln.text, x, y)
      const w = ctx.measureText(ln.text).width
      if (o.underline) ctx.fillRect(x, y + fontSize * 0.12 * S, w, Math.max(1, fontSize * 0.06 * S))
      if (o.strike) ctx.fillRect(x, y - fontSize * 0.3 * S, w, Math.max(1, fontSize * 0.06 * S))
    }
  }
  const blob = await canvasToBlob(c, 'image/png')
  const out = { bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height }
  c.width = c.height = 0
  return out
}

/** Collects everything the engine needs. Heavy pixel work (rasters, image filters) happens here on the main thread. */
export async function buildPlan(docId: string, o: ExportOptions = {}): Promise<{ plan: ExportPlan; transfer: Transferable[] }> {
  const doc = getDoc(docId)
  if (!doc) throw new AppError('unknown', 'Document is not open.')
  const allPages = getPages(docId)
  const wanted = o.pageIds ? new Set(o.pageIds) : null
  const pages = allPages.filter((p) => !wanted || wanted.has(p.id))
  if (!pages.length) throw new AppError('invalid-input', 'No pages selected.')
  const layers = getLayers(docId)
  const hiddenLayers = new Set(layers.filter((l) => !l.visible).map((l) => l.id))
  const objects = getObjects(docId)
  const byPage = new Map<string, EditObject[]>()
  for (const ob of objects) {
    if (hiddenLayers.has(ob.layerId)) continue
    if (o.annotations === false && !isField(ob) && ob.type !== 'link') continue
    if (o.forms === false && isField(ob)) continue
    const arr = byPage.get(ob.pageId) ?? []
    arr.push(ob)
    byPage.set(ob.pageId, arr)
  }
  const measure: MeasureFn = o.measure ?? ((f, b, i, s, t) => t.length * s * 0.55 + 0 * Number(b) + 0 * Number(i) + 0 * f.length)
  const report = o.onProgress ?? (() => {})
  const includeOcr = o.includeOcr !== false
  const transfer: Transferable[] = []
  const track = (u: Uint8Array) => {
    if (u.buffer instanceof ArrayBuffer) transfer.push(u.buffer)
    return u
  }
  const now = Date.now()
  const docIndex = new Map(allPages.map((p, i) => [p.id, i]))
  const images: ExportPlan['images'] = {}
  const imageKeys: Record<string, string> = {}
  const textRasters: ExportPlan['textRasters'] = {}
  const fontsUsed: Record<string, Uint8Array> = {}
  const planPages: PlanPage[] = []

  for (let i = 0; i < pages.length; i++) {
    if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const page = pages[i]
    let objs = (byPage.get(page.id) ?? []).slice()
    const redacts = objs.filter((x) => x.type === 'redact')
    const label = pageLabelFor(doc.pageLabels, docIndex.get(page.id) ?? i, toRoman, toAlpha)
    const pp: PlanPage = { page, objects: objs, label }
    const needRaster = redacts.length > 0 || !!o.rasterAll
    if (needRaster && (page.sourceId !== null || redacts.length > 0)) {
      const rects: Rect[] = redacts.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }))
      const zone = rects.map((r) => inflate(r, 1))
      // Overlay objects sitting under a redaction are removed as well (they could contain the sensitive content).
      objs = objs.filter((x) => x.type === 'redact' || x.type === 'link' || !zone.some((z) => rectsIntersect(z, { x: x.x, y: x.y, w: x.w, h: x.h })))
      objs = objs.map((x) => (isField(x) && x.native ? nativeFieldToText(x) : x))
      const scale = o.rasterAll?.scale ?? o.redactionScale ?? 2.5
      const quality = o.rasterAll?.quality ?? 0.92
      const colorFor = (r: Rect) => (redacts.find((d) => d.x === r.x && d.y === r.y && d.w === r.w && d.h === r.h) as { color: string } | undefined)?.color ?? '#000000'
      pp.raster = await rasterizePage(page, rects, colorFor, scale, quality, true)
      // Search layer: keep text that is NOT under a redaction.
      const runs: InvisibleTextRun[] = []
      if (page.sourceId) {
        const pt = await getPageText(page)
        for (const it of pt.items) {
          if (!it.str.trim()) continue
          if (zone.some((z) => rectsIntersect(z, it.rect))) continue
          runs.push({ text: it.str, x: it.rect.x, y: it.rect.y, w: it.rect.w, h: it.rect.h })
        }
      }
      const ocr = includeOcr ? doc.ocr[page.id] : undefined
      if (ocr) for (const w of ocr.words) if (!zone.some((z) => rectsIntersect(z, w))) runs.push({ text: w.text, x: w.x, y: w.y, w: w.w, h: w.h })
      pp.invisibleText = runs
    } else if (includeOcr && doc.ocr[page.id]?.words.length) {
      pp.invisibleText = doc.ocr[page.id].words.map((w) => ({ text: w.text, x: w.x, y: w.y, w: w.w, h: w.h }))
    }
    pp.objects = objs

    // images / text rasters / custom fonts
    for (const ob of objs) {
      if (ob.type === 'image') {
        const key = imageKey(ob)
        if (!images[key]) {
          const baked = await bakeImage(ob)
          images[key] = { bytes: track(baked.bytes), mime: baked.mime }
        }
        imageKeys[ob.id] = key
      } else if (ob.type === 'text') {
        if (isCustomFont(ob.font)) {
          const bytes = getCustomFontBytes(ob.font)
          if (bytes && !fontsUsed[ob.font]) fontsUsed[ob.font] = track(bytes.slice())
        }
        const text = displayText(ob, { page: i + 1, total: pages.length, label, date: new Date(now), batesIndex: i })
        // Characters the font has no glyph for (standard fonts: non-WinAnsi; embedded subsets: unused letters) are
        // rasterised with the same browser font instead of being exported as missing-glyph boxes.
        if (text.trim() && !(await canEncodeText(ob.font, ob.bold, ob.italic, text.replace(/\n/g, ' ')))) {
          const r = await rasterizeText(ob, text, measure)
          textRasters[ob.id] = { bytes: track(r.bytes), width: r.width, height: r.height }
        }
      }
    }
    planPages.push(pp)
    report(((i + 1) / pages.length) * 0.4, `Preparing page ${i + 1} of ${pages.length}`)
  }

  // sources
  const sources: ExportPlan['sources'] = {}
  for (const pp of planPages) {
    const sid = pp.page.sourceId
    if (!sid || pp.raster || sources[sid]) continue
    const src = getSource(sid)
    if (!src) throw new AppError('unknown', 'A source file was released from memory. Re-open the document.')
    sources[sid] = { bytes: track(await getSourceBytes(sid)), password: src.password }
  }

  // native fields deleted in the editor
  const reg = getNativeRegistry(docId)
  const alive = new Set(objects.filter((x) => isField(x) && x.native).map((x) => x.id))
  const stillNamed = new Set<string>()
  for (const [id, e] of reg) if (alive.has(id)) stillNamed.add(`${e.sourceId}\u0000${e.name}`)
  const removedFields: ExportPlan['removedFields'] = []
  const seenRemoved = new Set<string>()
  for (const [id, e] of reg) {
    const k = `${e.sourceId}\u0000${e.name}`
    if (!alive.has(id) && !stillNamed.has(k) && !seenRemoved.has(k)) {
      seenRemoved.add(k)
      removedFields.push({ sourceId: e.sourceId, name: e.name })
    }
  }

  const pageIndexById = new Map(pages.map((p, i) => [p.id, i]))
  const attachments = await collectAttachments(doc.attachments)
  for (const a of attachments) track(a.bytes)
  const meta = doc.metadata

  const plan: ExportPlan = {
    sources,
    pages: planPages,
    images,
    imageKeys,
    textRasters,
    fonts: fontsUsed,
    metadata: {
      title: meta.title,
      author: meta.author,
      subject: meta.subject,
      keywords: meta.keywords,
      creator: meta.creator,
      producer: meta.producer,
      creationDate: meta.creationDate,
      modificationDate: null,
    },
    removeMetadata: o.removeMetadata ?? meta.strip,
    bookmarks: planBookmarks(doc.bookmarks, pageIndexById),
    pageLabels: wanted ? [] : doc.pageLabels,
    attachments,
    ocr: {},
    removedFields,
    options: {
      flattenForms: !!o.flattenForms,
      security: o.security ?? null,
      producer: 'OurPDF',
      objectStreams: o.objectStreams ?? true,
      nativeLinks: true,
      nativeNotes: true,
    },
    now,
  }
  return { plan, transfer }
}

async function collectAttachments(list: AttachmentInfo[]): Promise<{ name: string; bytes: Uint8Array }[]> {
  const out: { name: string; bytes: Uint8Array }[] = []
  for (const a of list) {
    if (!a.staged || !a.blobKey) continue
    const rec = getAsset(a.blobKey)
    if (rec) out.push({ name: a.name, bytes: new Uint8Array(await rec.blob.arrayBuffer()) })
  }
  return out
}

/** Builds the complete output PDF for a document (or a subset of its pages). */
export async function exportPdfBytes(docId: string, o: ExportOptions = {}): Promise<Uint8Array> {
  const { initMeasurer } = await import('@/engine/fonts')
  const measurer = await initMeasurer()
  const { plan, transfer } = await buildPlan(docId, { ...o, measure: o.measure ?? measurer })
  o.onProgress?.(0.4, 'Building PDF')
  return runEngine('assemble', { plan }, { transfer, signal: o.signal, onProgress: (f, l) => o.onProgress?.(0.4 + f * 0.6, l) })
}
