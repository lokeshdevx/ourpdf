import { toast } from 'sonner'
import { applyCrop, cropByMargins, resetCrop, type Margins } from '@/lib/frame'
import { effectiveCrop } from '@/lib/geometry'
import { getPages, usePageStore } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import type { PageModel, Rect } from '@/types'
import { renderPageToCanvas } from './renderer'
import { setPageGeometry } from './page-service'

export type CropScope = 'current' | 'selected' | 'all'

export function pagesForScope(docId: string, scope: CropScope): PageModel[] {
  const pages = getPages(docId)
  if (scope === 'all') return pages
  if (scope === 'selected') {
    const sel = new Set(useSelectionStore.getState().pageIds)
    const chosen = pages.filter((p) => sel.has(p.id))
    if (chosen.length) return chosen
  }
  const cur = usePageStore.getState().byDoc[docId]?.current ?? 0
  return pages[cur] ? [pages[cur]] : []
}

/** Applies the on-page crop rectangle to the chosen pages (scaled proportionally for differently sized pages). */
export function applyCropFromDraft(scope: CropScope) {
  const docId = usePdfStore.getState().activeId
  const draft = useUiStore.getState().cropDraft
  if (!docId || !draft) return
  const src = getPages(docId).find((p) => p.id === draft.pageId)
  if (!src) return
  const base = effectiveCrop(src)
  const fx = (draft.rect.x - base.x) / base.w
  const fy = (draft.rect.y - base.y) / base.h
  const fw = draft.rect.w / base.w
  const fh = draft.rect.h / base.h
  const targets = scope === 'current' ? [src] : pagesForScope(docId, scope)
  const patches: Record<string, Pick<PageModel, 'crop' | 'frame'>> = {}
  for (const p of targets) {
    const b = effectiveCrop(p)
    patches[p.id] = applyCrop(p, { x: b.x + fx * b.w, y: b.y + fy * b.h, w: fw * b.w, h: fh * b.h })
  }
  setPageGeometry(docId, patches, `Crop ${targets.length} page(s)`)
  useUiStore.getState().set({ cropDraft: null })
  useToolStore.getState().setTool('select')
  toast.success(`Cropped ${targets.length} page${targets.length > 1 ? 's' : ''}`)
}

export function cropMargins(docId: string, scope: CropScope, m: Margins) {
  const targets = pagesForScope(docId, scope)
  const patches: Record<string, Pick<PageModel, 'crop' | 'frame'>> = {}
  for (const p of targets) patches[p.id] = cropByMargins(p, m)
  setPageGeometry(docId, patches, `Crop margins on ${targets.length} page(s)`)
}

export function resetCropFor(docId: string, scope: CropScope) {
  const targets = pagesForScope(docId, scope)
  const patches: Record<string, Pick<PageModel, 'crop' | 'frame'>> = {}
  for (const p of targets) patches[p.id] = resetCrop()
  setPageGeometry(docId, patches, `Reset crop on ${targets.length} page(s)`)
}

/** Finds the content bounding box of a page by scanning a low-res render for non-white pixels. */
export async function contentBounds(page: PageModel, threshold = 250): Promise<Rect | null> {
  const scale = Math.min(1.2, 900 / Math.max(page.width, page.height))
  const canvas = await renderPageToCanvas(page, scale, { annotationMode: 'storage' })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let x1 = width, y1 = height, x2 = -1, y2 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) {
        if (x < x1) x1 = x
        if (x > x2) x2 = x
        if (y < y1) y1 = y
        if (y > y2) y2 = y
      }
    }
  }
  canvas.width = canvas.height = 0
  if (x2 < 0) return null
  const k = canvas.width ? width / page.width : scale
  return { x: x1 / k, y: y1 / k, w: (x2 - x1 + 1) / k, h: (y2 - y1 + 1) / k }
}

/** "Remove margins": crops every page (in scope) to its content plus a small padding. */
export async function trimWhitespace(scope: CropScope = 'all', pad = 8) {
  const docId = usePdfStore.getState().activeId
  if (!docId) return
  const targets = pagesForScope(docId, scope)
  const patches: Record<string, Pick<PageModel, 'crop' | 'frame'>> = {}
  for (const p of targets) {
    const b = await contentBounds(p)
    if (!b) continue
    const c = effectiveCrop(p)
    const r = { x: Math.max(c.x, b.x - pad), y: Math.max(c.y, b.y - pad), w: 0, h: 0 }
    r.w = Math.min(c.x + c.w, b.x + b.w + pad) - r.x
    r.h = Math.min(c.y + c.h, b.y + b.h + pad) - r.y
    patches[p.id] = applyCrop(p, r)
  }
  if (Object.keys(patches).length) {
    setPageGeometry(docId, patches, 'Trim white margins')
    toast.success(`Trimmed margins on ${Object.keys(patches).length} page(s)`)
  } else toast.info('No content found to trim to.')
}
