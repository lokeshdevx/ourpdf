import type { PDFDocumentProxy } from 'pdfjs-dist'
import { toUserError } from '@/lib/errors'
import { getPages, usePageStore } from '@/stores/page-store'
import { getObjects, useAnnotationStore, defaultLayers } from '@/stores/annotation-store'
import { useHistoryStore } from '@/stores/history-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useSearchStore } from '@/stores/search-store'
import { useFormStore } from '@/stores/form-store'
import { EMPTY_METADATA, usePdfStore } from '@/stores/pdf-store'
import type { AttachmentInfo, Bookmark, DocInfo, DocMetadata, EditObject, FieldObj, PageModel, Rotation } from '@/types'
import { DEFAULT_LAYER_ID } from '@/types'
import { uid } from '@/utils/id'
import { stripExtension } from '@/utils/file'
import { createField } from '@/lib/object-factory'
import { clearRenderCaches, dropOcConfig } from './renderer'
import { clearTextCache } from './text'
import { destroySource, getSource, openSource, totalSourceBytes, type PdfSource } from './sources'

/** Native (source-file) form fields discovered per document, so deletions can be detected at export time. */
const nativeRegistry = new Map<string, Map<string, { sourceId: string; name: string }>>()
export const getNativeRegistry = (docId: string) => nativeRegistry.get(docId) ?? new Map<string, { sourceId: string; name: string }>()
export function setNativeRegistry(docId: string, entries: [string, { sourceId: string; name: string }][]) {
  nativeRegistry.set(docId, new Map(entries))
}

/** Creates the page model list for a source. Sizes come from page 1 first (estimate) and are refined progressively. */
async function initialPages(src: PdfSource, firstOnly: boolean): Promise<PageModel[]> {
  const pages: PageModel[] = []
  const first = await measurePage(src.proxy, 0)
  const n = src.numPages
  const eager = firstOnly ? 1 : n
  for (let i = 0; i < n; i++) {
    const m = i < eager && i > 0 ? await measurePage(src.proxy, i) : i === 0 ? first : null
    pages.push({
      id: uid('pg'),
      sourceId: src.id,
      sourceIndex: i,
      width: (m ?? first).width,
      height: (m ?? first).height,
      intrinsic: (m ?? first).intrinsic,
      view: (m ?? first).view,
      rotation: 0,
      crop: null,
      frame: null,
      sizeKnown: !!m,
    })
  }
  return pages
}

async function measurePage(proxy: PDFDocumentProxy, index: number) {
  const page = await proxy.getPage(index + 1)
  const vp = page.getViewport({ scale: 1 })
  const rot = (((page.rotate % 360) + 360) % 360) as Rotation
  const out = { width: vp.width, height: vp.height, intrinsic: rot, view: page.view as [number, number, number, number] }
  page.cleanup()
  return out
}

/** Reads real page geometry for all pages in the background (yielding to the UI between batches). */
async function refineAndScan(docId: string, src: PdfSource, pages: PageModel[]) {
  const BATCH = 24
  let patches: Record<string, Partial<PageModel>> = {}
  const fields: EditObject[] = []
  for (let i = 0; i < pages.length; i++) {
    if (!usePdfStore.getState().docs.some((d) => d.id === docId)) return
    const p = pages[i]
    if (p.sourceId !== src.id) continue
    try {
      if (!p.sizeKnown) {
        const m = await measurePage(src.proxy, p.sourceIndex)
        patches[p.id] = { ...m, sizeKnown: true }
      }
      const found = await readWidgets(src.proxy, p.sourceIndex, { ...p, ...(patches[p.id] ?? {}) } as PageModel)
      fields.push(...found)
      let reg = nativeRegistry.get(docId)
      if (!reg) nativeRegistry.set(docId, (reg = new Map()))
      for (const f of found) reg.set(f.id, { sourceId: src.id, name: (f as FieldObj).fieldName })
    } catch {
      /* a broken page must not stop the scan */
    }
    if ((i + 1) % BATCH === 0 || i === pages.length - 1) {
      if (Object.keys(patches).length) usePageStore.getState().patchMany(docId, patches)
      patches = {}
      if (fields.length) {
        const cur = getObjects(docId)
        const known = new Set(cur.filter((o) => o.type === 'field' && o.native).map((o) => o.id))
        const add = fields.filter((f) => !known.has(f.id))
        if (add.length) useAnnotationStore.getState().setObjects(docId, [...cur, ...add])
        fields.length = 0
      }
      await new Promise((r) => setTimeout(r, 0))
    }
  }
}

/** Existing AcroForm widgets become editable field objects (value / delete supported, geometry locked). */
async function readWidgets(proxy: PDFDocumentProxy, index: number, model: PageModel): Promise<EditObject[]> {
  const page = await proxy.getPage(index + 1)
  const annots = (await page.getAnnotations({ intent: 'display' })) as Array<Record<string, unknown>>
  const vp = page.getViewport({ scale: 1 })
  const out: EditObject[] = []
  let tab = 0
  for (const a of annots) {
    if (a.subtype !== 'Widget' || !a.fieldName || !a.rect) continue
    const rr = a.rect as number[]
    const p1 = vp.convertToViewportPoint(rr[0], rr[1])
    const p2 = vp.convertToViewportPoint(rr[2], rr[3])
    const x = Math.min(p1[0], p2[0])
    const y = Math.min(p1[1], p2[1])
    const w = Math.abs(p2[0] - p1[0])
    const h = Math.abs(p2[1] - p1[1])
    const type = a.fieldType as string
    let ftype: FieldObj['ftype'] | null = null
    if (type === 'Tx') ftype = 'text'
    else if (type === 'Btn') ftype = a.checkBox ? 'checkbox' : a.radioButton ? 'radio' : 'button'
    else if (type === 'Ch') ftype = a.combo ? 'dropdown' : 'listbox'
    else if (type === 'Sig') ftype = 'signature'
    if (!ftype) continue
    const raw = a.fieldValue as string | string[] | undefined
    const strVal = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
    const opts = ((a.options as Array<{ exportValue: string; displayValue: string }>) ?? []).map((o) => o.displayValue ?? o.exportValue)
    const f = createField(ftype, model.id, DEFAULT_LAYER_ID, { x, y, w, h })
    f.id = `nf-${String(a.id ?? '')}-${model.id}`
    f.fieldName = String(a.fieldName)
    f.native = true
    f.readOnly = !!a.readOnly
    f.required = !!(a as { required?: boolean }).required
    f.multiline = !!a.multiLine
    f.tooltip = String((a as { alternativeText?: string }).alternativeText ?? '')
    f.options = opts
    f.tabIndex = tab++
    f.exportValue = String((a as { buttonValue?: string; exportValue?: string }).buttonValue ?? (a as { exportValue?: string }).exportValue ?? '')
    if (ftype === 'checkbox') {
      f.value = !!strVal && strVal !== 'Off'
      f.defaultValue = f.value
    } else if (ftype === 'radio') {
      f.value = !!strVal && strVal === f.exportValue
      f.defaultValue = f.value
    } else {
      f.value = strVal
      f.defaultValue = strVal
    }
    out.push(f)
  }
  page.cleanup()
  return out
}

function parsePdfDate(s?: string | null): string | null {
  if (!s) return null
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s)
  if (!m) return null
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00'] = m
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

async function readMetadata(proxy: PDFDocumentProxy): Promise<DocMetadata> {
  try {
    const md = await proxy.getMetadata()
    const info = (md.info ?? {}) as Record<string, string>
    return {
      title: info.Title ?? '',
      author: info.Author ?? '',
      subject: info.Subject ?? '',
      keywords: info.Keywords ?? '',
      creator: info.Creator ?? '',
      producer: info.Producer ?? '',
      creationDate: parsePdfDate(info.CreationDate),
      modificationDate: parsePdfDate(info.ModDate),
      strip: false,
    }
  } catch {
    return { ...EMPTY_METADATA }
  }
}

async function readOutline(src: PdfSource, pages: PageModel[]): Promise<Bookmark[]> {
  type OutlineItem = { title: string; dest: unknown; items?: OutlineItem[] }
  let outline: OutlineItem[] | null = null
  try {
    outline = (await src.proxy.getOutline()) as OutlineItem[] | null
  } catch {
    return []
  }
  if (!outline) return []
  const byIndex = new Map<number, PageModel>()
  for (const p of pages) if (p.sourceId === src.id) byIndex.set(p.sourceIndex, p)
  const resolve = async (dest: unknown): Promise<{ pageId: string | null; y: number }> => {
    try {
      let d = dest
      if (typeof d === 'string') d = await src.proxy.getDestination(d)
      if (!Array.isArray(d)) return { pageId: null, y: 0 }
      const ref = d[0]
      const idx = typeof ref === 'object' && ref !== null ? await src.proxy.getPageIndex(ref as never) : Number(ref)
      const model = byIndex.get(idx)
      if (!model) return { pageId: null, y: 0 }
      let y = 0
      const top = d[3]
      if (typeof top === 'number') y = Math.max(0, model.view[3] - top)
      return { pageId: model.id, y }
    } catch {
      return { pageId: null, y: 0 }
    }
  }
  const walk = async (items: OutlineItem[]): Promise<Bookmark[]> => {
    const out: Bookmark[] = []
    for (const it of items) {
      const { pageId, y } = await resolve(it.dest)
      out.push({ id: uid('bm'), title: it.title || '(untitled)', pageId, y, children: it.items?.length ? await walk(it.items) : [] })
    }
    return out
  }
  return walk(outline)
}

async function readAttachments(proxy: PDFDocumentProxy): Promise<AttachmentInfo[]> {
  try {
    const att = (await proxy.getAttachments()) as Record<string, { filename: string; content: Uint8Array }> | null
    if (!att) return []
    return Object.values(att).map((a) => ({ id: uid('att'), name: a.filename, size: a.content?.byteLength ?? 0, staged: false }))
  } catch {
    return []
  }
}

export interface OpenPdfOptions {
  password?: string
  onProgress?: (loaded: number, total: number) => void
  /** Reuse ids when restoring a saved project. */
  docId?: string
  sourceId?: string
  activate?: boolean
}

/** Opens a PDF blob as a new document tab. */
export async function openPdfBlob(blob: Blob, name: string, opts: OpenPdfOptions = {}): Promise<string> {
  const src = await openSource(blob, name, { password: opts.password, id: opts.sourceId, onProgress: opts.onProgress })
  try {
    const big = src.numPages > 80
    const pages = await initialPages(src, big)
    const docId = opts.docId ?? uid('doc')
    const metadata = await readMetadata(src.proxy)
    const [bookmarks, attachments] = await Promise.all([readOutline(src, pages), readAttachments(src.proxy)])
    const info: DocInfo = {
      id: docId,
      name: name || 'Untitled.pdf',
      size: src.size,
      createdAt: Date.now(),
      modified: false,
      metadata,
      originalMetadata: metadata,
      bookmarks,
      pageLabels: [],
      attachments,
      ocr: {},
      hasForms: false,
      encrypted: src.encrypted,
    }
    usePageStore.getState().init(docId, pages)
    useAnnotationStore.getState().init(docId, [], defaultLayers())
    useHistoryStore.getState().clear(docId)
    usePdfStore.getState().addDoc(info, opts.activate !== false)
    void refineAndScan(docId, src, pages).then(() => {
      const has = getObjects(docId).some((o) => o.type === 'field' && o.native)
      if (has) usePdfStore.getState().updateDoc(docId, { hasForms: true })
    })
    return docId
  } catch (e) {
    await destroySource(src.id)
    throw toUserError(e)
  }
}

/** Sources referenced by a document's current page list. */
export function docSourceIds(docId: string): string[] {
  return [...new Set(getPages(docId).map((p) => p.sourceId).filter((x): x is string => !!x))]
}

export function docSizeBytes(docId: string): number {
  return totalSourceBytes(docSourceIds(docId))
}

export async function closeDoc(docId: string): Promise<void> {
  const ids = docSourceIds(docId)
  const doc = usePdfStore.getState()
  const others = new Set<string>()
  for (const d of doc.docs) if (d.id !== docId) docSourceIds(d.id).forEach((s) => others.add(s))
  usePdfStore.getState().removeDoc(docId)
  usePageStore.getState().drop(docId)
  useAnnotationStore.getState().drop(docId)
  useHistoryStore.getState().drop(docId)
  useSelectionStore.getState().clear()
  useSearchStore.getState().reset()
  useFormStore.getState().clearErrors()
  nativeRegistry.delete(docId)
  for (const id of ids) {
    if (others.has(id)) continue
    clearRenderCaches(id)
    clearTextCache(id)
    dropOcConfig(id)
    await destroySource(id)
  }
}

export function docBaseName(docId: string): string {
  const d = usePdfStore.getState().docs.find((x) => x.id === docId)
  return stripExtension(d?.name ?? 'document')
}

export { getSource }

export interface ReplaceOptions {
  password?: string
  /** Keep the current metadata instead of re-reading it from the new bytes. */
  keepMetadata?: boolean
  label?: string
}

/**
 * Replaces a document's content in place (same tab) with new PDF bytes – used when an operation must be
 * *committed* into the file: apply redactions, flatten, compress, encrypt. History is cleared (the old state
 * remains available as a project-history snapshot when the caller saved one).
 */
export async function replaceDocContent(docId: string, blob: Blob, opts: ReplaceOptions = {}): Promise<void> {
  const oldIds = docSourceIds(docId)
  const doc = usePdfStore.getState().docs.find((d) => d.id === docId)
  if (!doc) throw new Error('Document is not open')
  const src = await openSource(blob, doc.name, { password: opts.password })
  try {
    const pages = await initialPages(src, src.numPages > 80)
    const metadata = opts.keepMetadata ? doc.metadata : await readMetadata(src.proxy)
    const [bookmarks, attachments] = await Promise.all([readOutline(src, pages), readAttachments(src.proxy)])
    usePageStore.getState().init(docId, pages)
    useAnnotationStore.getState().init(docId, [], defaultLayers())
    useHistoryStore.getState().clear(docId)
    useSelectionStore.getState().clear()
    nativeRegistry.delete(docId)
    usePdfStore.getState().updateDoc(docId, {
      size: src.size,
      metadata,
      originalMetadata: metadata,
      bookmarks,
      attachments,
      pageLabels: [],
      ocr: {},
      hasForms: false,
      encrypted: src.encrypted,
      modified: true,
    })
    void refineAndScan(docId, src, pages).then(() => {
      if (getObjects(docId).some((o) => o.type === 'field' && o.native)) usePdfStore.getState().updateDoc(docId, { hasForms: true })
    })
  } catch (e) {
    await destroySource(src.id)
    throw toUserError(e)
  }
  const others = new Set<string>()
  for (const d of usePdfStore.getState().docs) if (d.id !== docId) docSourceIds(d.id).forEach((s) => others.add(s))
  for (const id of oldIds) {
    if (others.has(id)) continue
    clearRenderCaches(id)
    clearTextCache(id)
    dropOcConfig(id)
    await destroySource(id)
  }
}
