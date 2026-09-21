import { createRedact } from '@/lib/object-factory'
import { findInText, rectsForRange, type MatchOptions } from '@/lib/search-engine'
import { addObjects } from '@/services/pdf/annotation-service'
import { useAnnotationStore } from '@/stores/annotation-store'
import { getPages } from '@/stores/page-store'
import { getDoc } from '@/stores/pdf-store'
import { DEFAULT_LAYER_ID, type EditObject, type Rect } from '@/types'
import { buildTextIndex } from '@/lib/search-engine'
import { getPageText } from './text'

export interface RedactMatch {
  pageId: string
  pageIndex: number
  rects: Rect[]
  text: string
}

/** Finds text (extracted or OCR) and returns rectangles that would be redacted. */
export async function findRedactions(docId: string, query: string, opts: MatchOptions, pageIds?: string[], regex = false): Promise<RedactMatch[]> {
  const doc = getDoc(docId)
  const pages = getPages(docId)
  const out: RedactMatch[] = []
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    if (pageIds && !pageIds.includes(page.id)) continue
    const pt = await getPageText(page)
    const find = (text: string) => (regex ? matchRegex(text, query, opts.caseSensitive) : findInText(text, query, opts))
    for (const m of find(pt.index.text)) out.push({ pageId: page.id, pageIndex: i, rects: rectsForRange(pt.index, pt.items, m.start, m.end), text: pt.index.text.slice(m.start, m.end) })
    const ocr = doc?.ocr[page.id]
    if (ocr?.words.length) {
      const items = ocr.words.map((w, k) => ({ str: w.text, rect: { x: w.x, y: w.y, w: w.w, h: w.h }, size: w.h, angle: 0, eol: k === ocr.words.length - 1 }))
      const idx = buildTextIndex(items)
      for (const m of find(idx.text)) out.push({ pageId: page.id, pageIndex: i, rects: rectsForRange(idx, items, m.start, m.end), text: idx.text.slice(m.start, m.end) })
    }
  }
  return out
}

function matchRegex(text: string, pattern: string, cs: boolean) {
  let re: RegExp
  try {
    re = new RegExp(pattern, `g${cs ? '' : 'i'}u`)
  } catch {
    return []
  }
  const out: { start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) && out.length < 5000) {
    if (!m[0]) re.lastIndex++
    else out.push({ start: m.index, end: m.index + m[0].length })
  }
  return out
}

/** Adds redaction marks over each match (padded slightly). Applying them is a separate, confirmed step. */
export function markRedactions(docId: string, matches: RedactMatch[], style: { color: string; reason: string; overlayText: string }): number {
  const layerId = useAnnotationStore.getState().byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID
  const objs: EditObject[] = []
  for (const m of matches) for (const r of m.rects) objs.push(createRedact(m.pageId, layerId, { x: r.x - 1, y: r.y - 0.5, w: r.w + 2, h: r.h + 1 }, style))
  addObjects(docId, objs, `Mark ${objs.length} redaction(s)`)
  return objs.length
}
