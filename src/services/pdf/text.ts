import type { TextItem as PdfTextItem } from 'pdfjs-dist/types/src/display/api'
import { LruCache } from '@/lib/lru'
import { buildTextIndex, type PageTextIndex, type TextSpanItem } from '@/lib/search-engine'
import type { PageModel, Rect } from '@/types'
import { loadPdfjs } from './pdfjs'
import { getSource } from './sources'

export interface PageTextItem extends TextSpanItem {
  family: 'helvetica' | 'times' | 'courier'
  bold: boolean
  italic: boolean
  fontName: string
  /** pdf.js internal font id (key into the page's font objects). */
  fontId: string
}
export interface PageText {
  items: PageTextItem[]
  index: PageTextIndex
}

const cache = new LruCache<string, PageText>(400, () => 1)
const inflight = new Map<string, Promise<PageText>>()

export function clearTextCache(sourceId?: string) {
  if (!sourceId) cache.clear()
  else cache.deleteWhere((k) => k.startsWith(sourceId + ':'))
}

/** Extracts positioned text runs for a source page, in base space (points, y down). */
export function getPageText(page: Pick<PageModel, 'sourceId' | 'sourceIndex'>): Promise<PageText> {
  if (!page.sourceId) return Promise.resolve({ items: [], index: { text: '', spans: [] } })
  const key = `${page.sourceId}:${page.sourceIndex}`
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(key)
  if (pending) return pending
  const p = extract(page.sourceId, page.sourceIndex)
    .then((r) => {
      cache.set(key, r)
      return r
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

async function extract(sourceId: string, sourceIndex: number): Promise<PageText> {
  const src = getSource(sourceId)
  if (!src) throw new Error('Source not loaded')
  const pdfjs = await loadPdfjs()
  const page = await src.proxy.getPage(sourceIndex + 1)
  const viewport = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  const items: PageTextItem[] = []
  for (const raw of tc.items) {
    if (!('str' in raw)) continue
    const it = raw as PdfTextItem
    if (it.str === '' && !it.hasEOL) continue
    const t = pdfjs.Util.transform(viewport.transform, it.transform) as number[]
    const [a, b, c, d, e, f] = t
    const size = Math.hypot(a, b) || Math.hypot(c, d) || 1
    const ux = a / size
    const uy = b / size
    const vx = c / (Math.hypot(c, d) || 1)
    const vy = d / (Math.hypot(c, d) || 1)
    const width = it.width * (viewport.scale || 1)
    // corners: baseline start p0, advance p1, ascent goes along (vx,vy) (which points "up" in y-down space)
    const asc = 0.92 * size
    const desc = 0.23 * size
    const p = [
      [e - vx * desc, f - vy * desc],
      [e + ux * width - vx * desc, f + uy * width - vy * desc],
      [e + ux * width + vx * asc, f + uy * width + vy * asc],
      [e + vx * asc, f + vy * asc],
    ]
    const xs = p.map((q) => q[0])
    const ys = p.map((q) => q[1])
    const rect: Rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    const angle = Math.round((Math.atan2(uy, ux) * 180) / Math.PI)
    const style = tc.styles[it.fontName]
    const fam = (style?.fontFamily ?? '').toLowerCase()
    const real = realFontName(page, it.fontName)
    const lower = `${real} ${fam}`.toLowerCase()
    items.push({
      str: it.str,
      rect,
      size,
      angle,
      eol: !!it.hasEOL,
      fontName: real || it.fontName,
      fontId: it.fontName,
      family: /mono|courier|consolas/.test(lower) ? 'courier' : /serif(?!.*sans)|times|georgia|garamond|palatino|minion|cambria/.test(lower) && !/sans/.test(lower) ? 'times' : 'helvetica',
      bold: /bold|black|heavy|semibold|demi/.test(lower),
      italic: /italic|oblique/.test(lower),
    })
  }
  page.cleanup()
  return { items, index: buildTextIndex(items) }
}

function realFontName(page: { commonObjs: { has: (id: string) => boolean; get: (id: string) => unknown } }, id: string): string {
  try {
    if (page.commonObjs.has(id)) {
      const f = page.commonObjs.get(id) as { name?: string } | undefined
      return f?.name ?? ''
    }
  } catch {
    /* font object not resolved yet */
  }
  return ''
}

/** Text of a page as plain string (reading order as extracted). */
export async function getPlainPageText(page: Pick<PageModel, 'sourceId' | 'sourceIndex'>): Promise<string> {
  return (await getPageText(page)).index.text
}

/** Groups items into lines (items sharing a baseline band). Returns arrays of item indices. */
export function groupLines(items: PageTextItem[]): number[][] {
  const order = items.map((_, i) => i)
  const lines: { y: number; h: number; idx: number[] }[] = []
  for (const i of order) {
    const it = items[i]
    if (!it.str.trim()) continue
    const cy = it.rect.y + it.rect.h / 2
    const line = lines.find((l) => Math.abs(l.y - cy) < Math.max(l.h, it.rect.h) * 0.4)
    if (line) line.idx.push(i)
    else lines.push({ y: cy, h: it.rect.h, idx: [i] })
  }
  lines.sort((a, b) => a.y - b.y)
  for (const l of lines) l.idx.sort((a, b) => items[a].rect.x - items[b].rect.x)
  return lines.map((l) => l.idx)
}
