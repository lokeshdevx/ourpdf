import { toast } from 'sonner'
import { displayToBase, normRect } from '@/lib/geometry'
import { createMarkup } from '@/lib/object-factory'
import { addObjects } from '@/services/pdf/annotation-service'
import { useAnnotationStore } from '@/stores/annotation-store'
import { getPages } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore, type TextSelection } from '@/stores/selection-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_LAYER_ID, type MarkupKind, type Rect } from '@/types'

/** Reads the current DOM selection inside a page's text layer and converts it to base-space line rectangles. */
export function readTextSelection(): TextSelection | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null
  const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
  const pageEl = node?.closest('[data-testid="pdf-page"]') as HTMLElement | null
  if (!pageEl) return null
  const docId = usePdfStore.getState().activeId
  if (!docId) return null
  const index = Number(pageEl.dataset.pageIndex)
  const page = getPages(docId)[index]
  if (!page) return null
  const outer = pageEl.querySelector('[data-page]') as HTMLElement | null
  if (!outer) return null
  const r0 = outer.getBoundingClientRect()
  const zoom = useUiStore.getState().zoom
  const rects: Rect[] = []
  for (const r of Array.from(sel.getRangeAt(0).getClientRects())) {
    if (r.width < 1 || r.height < 1) continue
    const a = displayToBase(page, (r.left - r0.left) / zoom, (r.top - r0.top) / zoom)
    const b = displayToBase(page, (r.right - r0.left) / zoom, (r.bottom - r0.top) / zoom)
    const rr = normRect(a[0], a[1], b[0], b[1])
    if (rr.h > 60) continue
    const prev = rects[rects.length - 1]
    if (prev && Math.abs(prev.y - rr.y) < 1 && rr.x <= prev.x + prev.w + 1) prev.w = Math.max(prev.w, rr.x + rr.w - prev.x)
    else rects.push(rr)
  }
  return { pageId: page.id, text: sel.toString(), rects }
}

/** Applies a markup kind to the current text selection (used by the context menu). */
export function markupSelection(kind: MarkupKind) {
  const docId = usePdfStore.getState().activeId
  const sel = readTextSelection()
  if (!docId || !sel || !sel.rects.length) return void toast.info('Select some text on the page first')
  const o = useToolStore.getState().options
  const color = kind === 'highlight' ? o.highlightColor : kind === 'underline' ? o.underlineColor : o.strikeColor
  const layerId = useAnnotationStore.getState().byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID
  addObjects(docId, [createMarkup(sel.pageId, layerId, kind, color, sel.rects)], `Add ${kind}`)
  window.getSelection()?.removeAllRanges()
}

/** Mirrors the browser text selection into the selection store (for "bookmark selected text" etc.). */
export function trackTextSelection(): () => void {
  let t: ReturnType<typeof setTimeout> | null = null
  const handler = () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => useSelectionStore.getState().setText(readTextSelection()), 120)
  }
  document.addEventListener('selectionchange', handler)
  return () => {
    document.removeEventListener('selectionchange', handler)
    if (t) clearTimeout(t)
  }
}
