import { buildTextIndex, findInText, rectsForRange, snippet, type MatchOptions } from '@/lib/search-engine'
import { createText } from '@/lib/object-factory'
import { addObjects } from '@/services/pdf/annotation-service'
import { getPages } from '@/stores/page-store'
import { getDoc } from '@/stores/pdf-store'
import { getObjects, useAnnotationStore } from '@/stores/annotation-store'
import { useSearchStore, type SearchHit } from '@/stores/search-store'
import { DEFAULT_LAYER_ID, type EditObject, type OcrPage, type PageModel, type Rect, type TextObj } from '@/types'
import { baselineOffset } from '@/engine/fonts'
import { TEXT_PAD } from '@/lib/text-object'
import { getPageText } from './text'
import { renderPageToCanvas } from './renderer'
import { sampleColors } from './sample'
import { revealRect } from '@/services/viewer-bus'

let currentRun: AbortController | null = null

function ocrIndex(ocr: OcrPage) {
  const items = ocr.words.map((w, i) => ({ str: w.text, rect: { x: w.x, y: w.y, w: w.w, h: w.h }, size: w.h, angle: 0, eol: i === ocr.words.length - 1 }))
  return { items, index: buildTextIndex(items) }
}

/** Searches all pages (extracted text and OCR text). Results stream into the search store. */
export async function runSearch(docId: string, query: string, options: MatchOptions & { includeOcr: boolean }): Promise<void> {
  currentRun?.abort()
  const ctrl = new AbortController()
  currentRun = ctrl
  const store = useSearchStore.getState()
  if (!query.trim()) {
    store.reset()
    return
  }
  const doc = getDoc(docId)
  const pages = getPages(docId)
  const hits: SearchHit[] = []
  store.setResults([], 'running', 0)
  for (let i = 0; i < pages.length; i++) {
    if (ctrl.signal.aborted) return
    const page = pages[i]
    try {
      const pt = await getPageText(page)
      for (const m of findInText(pt.index.text, query, options)) {
        hits.push({ pageId: page.id, pageIndex: i, rects: rectsForRange(pt.index, pt.items, m.start, m.end), ...snippet(pt.index.text, m.start, m.end), fromOcr: false })
      }
      const ocr = options.includeOcr ? doc?.ocr[page.id] : undefined
      if (ocr?.words.length) {
        const oi = ocrIndex(ocr)
        for (const m of findInText(oi.index.text, query, options)) {
          hits.push({ pageId: page.id, pageIndex: i, rects: rectsForRange(oi.index, oi.items, m.start, m.end), ...snippet(oi.index.text, m.start, m.end), fromOcr: true })
        }
      }
    } catch {
      /* unreadable page: skip */
    }
    if (i % 6 === 5 || i === pages.length - 1) {
      useSearchStore.getState().setResults(hits.slice(), i === pages.length - 1 ? 'done' : 'running', (i + 1) / pages.length)
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  if (!ctrl.signal.aborted) useSearchStore.getState().setResults(hits, 'done', 1)
}

export function cancelSearch() {
  currentRun?.abort()
}

export function goToHit(index: number) {
  const s = useSearchStore.getState()
  if (!s.hits.length) return
  const i = ((index % s.hits.length) + s.hits.length) % s.hits.length
  s.setCurrent(i)
  const h = s.hits[i]
  if (h.rects[0]) revealRect(h.pageIndex, h.rects[0])
}
export const nextHit = () => goToHit(useSearchStore.getState().current + 1)
export const prevHit = () => goToHit(useSearchStore.getState().current - 1)

/**
 * "Replace text where supported": each match is covered and the replacement is overlaid at the same position.
 * The original text remains in the file beneath the cover – use Redact for permanent removal.
 */
export async function replaceHits(docId: string, hits: SearchHit[], replacement: string): Promise<number> {
  const pages = new Map(getPages(docId).map((p) => [p.id, p]))
  const byPage = new Map<string, SearchHit[]>()
  for (const h of hits) byPage.set(h.pageId, [...(byPage.get(h.pageId) ?? []), h])
  const layerId = useAnnotationStore.getState().byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID
  const objs: EditObject[] = []
  for (const [pageId, list] of byPage) {
    const page = pages.get(pageId) as PageModel
    const pt = await getPageText(page)
    const canvas = page.sourceId ? await renderPageToCanvas(page, 2) : null
    for (const h of list) {
      for (const [ri, r] of h.rects.entries()) {
        const item = pt.items.find((it) => r.x < it.rect.x + it.rect.w && r.x + r.w > it.rect.x && r.y < it.rect.y + it.rect.h && r.y + r.h > it.rect.y)
        const size = Math.round(((item?.size ?? r.h / 1.15) as number) * 10) / 10
        const col = canvas ? sampleColors(canvas, page, r) : { bg: '#ffffff', fg: '#000000' }
        const lh = 1.2
        const cover: Rect = { x: r.x - 0.5, y: r.y, w: r.w + 1, h: r.h }
        const family = item?.family ?? 'helvetica'
        const asc = baselineOffset(family, size, lh)
        const baseline = r.y + 0.92 * size
        const text = ri === 0 ? replacement : ''
        objs.push(
          createText(pageId, layerId, { x: r.x - TEXT_PAD, y: baseline - asc - TEXT_PAD, w: Math.max(r.w, replacement.length * size * 0.55) + 2 * TEXT_PAD + 4, h: size * lh + 2 * TEXT_PAD }, {
            text,
            font: family,
            bold: item?.bold ?? false,
            italic: item?.italic ?? false,
            fontSize: size,
            lineHeight: lh,
            color: col.fg,
            cover: { color: col.bg, rect: cover },
          } as Partial<TextObj>),
        )
      }
    }
    if (canvas) canvas.width = canvas.height = 0
  }
  addObjects(docId, objs, `Replace ${hits.length} match${hits.length === 1 ? '' : 'es'}`)
  return hits.length
}

export { getObjects }
