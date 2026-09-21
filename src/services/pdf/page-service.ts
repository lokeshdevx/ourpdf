import { AppError } from '@/lib/errors'
import { cloneObject } from '@/lib/object-factory'
import { PAGE_SIZES, normRotation } from '@/lib/geometry'
import { applyOps, invertOps, opsAdd } from '@/lib/object-ops'
import { execute } from '@/services/history'
import { getObjects, useAnnotationStore } from '@/stores/annotation-store'
import { getPages, usePageStore } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import type { PageModel, PageLabelRange, Rotation } from '@/types'
import { uid } from '@/utils/id'
import { openSource } from './sources'
import { getSource } from './sources'

/**
 * Structural page state restored by undo/redo. Measured geometry (size, view) is kept from the current list so a
 * background measurement pass is never reverted.
 */
function restore(docId: string, target: PageModel[]) {
  const cur = new Map(getPages(docId).map((p) => [p.id, p]))
  const merged = target.map((p) => {
    const c = cur.get(p.id)
    // Base geometry only ever changes through measurement, so the current (measured) values always win.
    return c && c.sizeKnown ? { ...p, width: c.width, height: c.height, intrinsic: c.intrinsic, view: c.view, sizeKnown: true } : p
  })
  usePageStore.getState().setPages(docId, merged)
}

function commit(docId: string, label: string, next: PageModel[], extra?: { doObjs?: () => void; undoObjs?: () => void }) {
  const before = getPages(docId)
  execute(
    docId,
    label,
    () => {
      restore(docId, next)
      extra?.doObjs?.()
    },
    () => {
      restore(docId, before)
      extra?.undoObjs?.()
    },
    { scope: 'page' },
  )
}

export function blankPage(width = PAGE_SIZES.A4[0], height = PAGE_SIZES.A4[1]): PageModel {
  return { id: uid('pg'), sourceId: null, sourceIndex: 0, width, height, intrinsic: 0, view: [0, 0, width, height], rotation: 0, crop: null, frame: null, sizeKnown: true }
}

const indexOfId = (pages: PageModel[], id: string) => pages.findIndex((p) => p.id === id)

export function addBlankPage(docId: string, at: number, size?: [number, number]): string {
  const pages = getPages(docId)
  const ref = pages[Math.min(Math.max(0, at - 1), pages.length - 1)]
  const [w, h] = size ?? (ref ? [ref.frame?.w ?? ref.crop?.w ?? ref.width, ref.frame?.h ?? ref.crop?.h ?? ref.height] : PAGE_SIZES.A4)
  const page = blankPage(w, h)
  const next = pages.slice()
  next.splice(Math.min(Math.max(0, at), pages.length), 0, page)
  commit(docId, 'Add blank page', next)
  return page.id
}

export function deletePages(docId: string, ids: string[]): void {
  const pages = getPages(docId)
  if (ids.length >= pages.length) throw new AppError('invalid-input', 'A document needs at least one page.')
  const set = new Set(ids)
  commit(docId, ids.length > 1 ? `Delete ${ids.length} pages` : 'Delete page', pages.filter((p) => !set.has(p.id)))
}

export function duplicatePages(docId: string, ids: string[]): string[] {
  const pages = getPages(docId)
  const set = new Set(ids)
  const objs = getObjects(docId)
  const copies: PageModel[] = []
  const objCopies = [] as ReturnType<typeof cloneObject>[]
  const next: PageModel[] = []
  for (const p of pages) {
    next.push(p)
    if (set.has(p.id)) {
      const np = { ...p, id: uid('pg') }
      copies.push(np)
      next.push(np)
      for (const o of objs.filter((x) => x.pageId === p.id)) objCopies.push(cloneObject(o, { x: 0, y: 0 }, np.id))
    }
  }
  const ops = opsAdd(objs, objCopies)
  const inv = invertOps(ops)
  const store = useAnnotationStore.getState()
  commit(docId, 'Duplicate pages', next, {
    doObjs: () => store.setObjects(docId, applyOps(getObjects(docId), ops)),
    undoObjs: () => store.setObjects(docId, applyOps(getObjects(docId), inv)),
  })
  return copies.map((c) => c.id)
}

/** Moves the given pages (kept in their relative order) so the first lands at `toIndex` of the remaining pages. */
export function movePages(docId: string, ids: string[], toIndex: number): void {
  const pages = getPages(docId)
  const set = new Set(ids)
  const moving = pages.filter((p) => set.has(p.id))
  const rest = pages.filter((p) => !set.has(p.id))
  const at = Math.min(Math.max(0, toIndex), rest.length)
  const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)]
  if (next.every((p, i) => p === pages[i])) return
  commit(docId, 'Move pages', next)
}

export function reorderPages(docId: string, order: string[]): void {
  const pages = getPages(docId)
  const byId = new Map(pages.map((p) => [p.id, p]))
  const next = order.map((id) => byId.get(id)).filter((p): p is PageModel => !!p)
  if (next.length !== pages.length) return
  commit(docId, 'Reorder pages', next)
}

export function rotatePages(docId: string, ids: string[], delta: number): void {
  const set = new Set(ids)
  commit(docId, 'Rotate pages', getPages(docId).map((p) => (set.has(p.id) ? { ...p, rotation: normRotation(p.rotation + delta) as Rotation } : p)))
}
export function resetRotation(docId: string, ids: string[]): void {
  const set = new Set(ids)
  commit(docId, 'Reset rotation', getPages(docId).map((p) => (set.has(p.id) ? { ...p, rotation: 0 } : p)))
}

export function reversePages(docId: string): void {
  commit(docId, 'Reverse page order', getPages(docId).slice().reverse())
}

export type SortKey = 'original' | 'width' | 'height' | 'area'
export function sortPages(docId: string, key: SortKey, descending = false): void {
  const pages = getPages(docId)
  const order = new Map(pages.map((p, i) => [p.id, i]))
  const val = (p: PageModel) => (key === 'width' ? p.frame?.w ?? p.width : key === 'height' ? p.frame?.h ?? p.height : key === 'area' ? (p.frame?.w ?? p.width) * (p.frame?.h ?? p.height) : 0)
  const srcIds = new Map<string, number>()
  const next = pages.slice().sort((a, b) => {
    if (key === 'original') {
      const sa = a.sourceId ? (srcIds.get(a.sourceId) ?? srcIds.set(a.sourceId, srcIds.size).get(a.sourceId)!) : 1e9
      const sb = b.sourceId ? (srcIds.get(b.sourceId) ?? srcIds.set(b.sourceId, srcIds.size).get(b.sourceId)!) : 1e9
      return sa - sb || a.sourceIndex - b.sourceIndex
    }
    return val(a) - val(b) || order.get(a.id)! - order.get(b.id)!
  })
  commit(docId, 'Sort pages', descending ? next.reverse() : next)
}

/** Applies a partial geometry change (crop / frame) to pages. */
export function setPageGeometry(docId: string, patches: Record<string, Partial<Pick<PageModel, 'crop' | 'frame' | 'rotation'>>>, label: string): void {
  commit(docId, label, getPages(docId).map((p) => (patches[p.id] ? { ...p, ...patches[p.id] } : p)))
}

/** Inserts pages from a PDF blob after `atIndex` (0 = at start, pages.length = at end). */
export async function insertPdfPages(docId: string, blob: Blob, name: string, atIndex: number, only?: number[], password?: string): Promise<number> {
  const src = await openSource(blob, name, { password })
  const indices = only ?? Array.from({ length: src.numPages }, (_, i) => i)
  const models: PageModel[] = []
  for (const i of indices) {
    const page = await src.proxy.getPage(i + 1)
    const vp = page.getViewport({ scale: 1 })
    models.push({
      id: uid('pg'),
      sourceId: src.id,
      sourceIndex: i,
      width: vp.width,
      height: vp.height,
      intrinsic: (((page.rotate % 360) + 360) % 360) as Rotation,
      view: page.view as [number, number, number, number],
      rotation: 0,
      crop: null,
      frame: null,
      sizeKnown: true,
    })
    page.cleanup()
  }
  const pages = getPages(docId)
  const next = pages.slice()
  next.splice(Math.min(Math.max(0, atIndex), pages.length), 0, ...models)
  commit(docId, `Insert ${models.length} page(s)`, next)
  usePdfStore.getState().updateDoc(docId, { size: (usePdfStore.getState().docs.find((d) => d.id === docId)?.size ?? 0) + src.size })
  return models.length
}

/** Replaces one page with a page from another PDF. */
export async function replacePage(docId: string, pageId: string, blob: Blob, name: string, sourcePage = 0): Promise<void> {
  const pages = getPages(docId)
  const at = indexOfId(pages, pageId)
  if (at < 0) return
  const src = await openSource(blob, name)
  if (sourcePage < 0 || sourcePage >= src.numPages) throw new AppError('invalid-input', `The file has only ${src.numPages} page(s).`)
  const page = await src.proxy.getPage(sourcePage + 1)
  const vp = page.getViewport({ scale: 1 })
  const model: PageModel = {
    id: uid('pg'),
    sourceId: src.id,
    sourceIndex: sourcePage,
    width: vp.width,
    height: vp.height,
    intrinsic: (((page.rotate % 360) + 360) % 360) as Rotation,
    view: page.view as [number, number, number, number],
    rotation: 0,
    crop: null,
    frame: null,
    sizeKnown: true,
  }
  page.cleanup()
  const next = pages.slice()
  next[at] = model
  commit(docId, 'Replace page', next)
}

/* ---- page clipboard (works across documents because sources are global) ---- */
let pageClipboard: { pages: PageModel[]; objects: ReturnType<typeof cloneObject>[] } | null = null

export function copyPages(docId: string, ids: string[]): number {
  const set = new Set(ids)
  const pages = getPages(docId).filter((p) => set.has(p.id))
  const objs = getObjects(docId).filter((o) => set.has(o.pageId))
  pageClipboard = { pages: structuredClone(pages), objects: structuredClone(objs) as ReturnType<typeof cloneObject>[] }
  return pages.length
}
export const hasPageClipboard = () => !!pageClipboard

export function pastePages(docId: string, atIndex: number): number {
  if (!pageClipboard) return 0
  const idMap = new Map<string, string>()
  const models = pageClipboard.pages.map((p) => {
    const id = uid('pg')
    idMap.set(p.id, id)
    return { ...p, id }
  })
  const objs = pageClipboard.objects.map((o) => cloneObject(o, { x: 0, y: 0 }, idMap.get(o.pageId)!))
  const pages = getPages(docId)
  const next = pages.slice()
  next.splice(Math.min(Math.max(0, atIndex), pages.length), 0, ...models)
  const ops = opsAdd(getObjects(docId), objs)
  const inv = invertOps(ops)
  const store = useAnnotationStore.getState()
  commit(docId, 'Paste pages', next, {
    doObjs: () => store.setObjects(docId, applyOps(getObjects(docId), ops)),
    undoObjs: () => store.setObjects(docId, applyOps(getObjects(docId), inv)),
  })
  return models.length
}

/* ---- page labels ---- */
export function setPageLabels(docId: string, ranges: PageLabelRange[]): void {
  const doc = usePdfStore.getState().docs.find((d) => d.id === docId)
  if (!doc) return
  const before = doc.pageLabels
  execute(
    docId,
    'Page labels',
    () => usePdfStore.getState().updateDoc(docId, { pageLabels: ranges }),
    () => usePdfStore.getState().updateDoc(docId, { pageLabels: before }),
    { scope: 'page' },
  )
}

export function pageLabelFor(ranges: PageLabelRange[], index: number, toRoman: (n: number) => string, toAlpha: (n: number) => string): string {
  const sorted = ranges.slice().sort((a, b) => a.from - b.from)
  let active: PageLabelRange | null = null
  for (const r of sorted) if (r.from <= index) active = r
  if (!active) return String(index + 1)
  const n = active.start + (index - active.from)
  let body = ''
  switch (active.style) {
    case 'decimal':
      body = String(n)
      break
    case 'roman':
      body = toRoman(n)
      break
    case 'ROMAN':
      body = toRoman(n).toUpperCase()
      break
    case 'alpha':
      body = toAlpha(n)
      break
    case 'ALPHA':
      body = toAlpha(n).toUpperCase()
      break
    default:
      body = ''
  }
  return `${active.prefix}${body}`
}

export { getSource }
