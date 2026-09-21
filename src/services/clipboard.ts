import { toast } from 'sonner'
import { cloneObject, createImage, createText } from '@/lib/object-factory'
import { addObjects } from '@/services/pdf/annotation-service'
import { importImageAsset } from '@/services/pdf/image-service'
import { getObjects, useAnnotationStore } from '@/stores/annotation-store'
import { getPages, usePageStore } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useToolStore } from '@/stores/tool-store'
import type { EditObject } from '@/types'
import { DEFAULT_LAYER_ID } from '@/types'

let objectClipboard: EditObject[] = []
export const hasObjectClipboard = () => objectClipboard.length > 0

export function copyObjects(docId: string, ids: string[]): number {
  objectClipboard = structuredClone(getObjects(docId).filter((o) => ids.includes(o.id)))
  return objectClipboard.length
}

export function cutObjects(docId: string, ids: string[]): number {
  const n = copyObjects(docId, ids)
  if (n) void import('@/services/pdf/annotation-service').then((m) => m.removeObjects(docId, ids, 'Cut'))
  return n
}

function currentPage(docId: string) {
  const st = usePageStore.getState().byDoc[docId]
  return st?.pages[st.current] ?? getPages(docId)[0]
}

/** Pastes internally copied objects onto the current page, offset so they are visible. */
export function pasteObjects(docId: string): EditObject[] {
  if (!objectClipboard.length) return []
  const page = currentPage(docId)
  if (!page) return []
  const layers = useAnnotationStore.getState().byDoc[docId]?.layers ?? []
  const layerIds = new Set(layers.map((l) => l.id))
  const copies = objectClipboard.map((o) => {
    const c = cloneObject(o, { x: 14, y: 14 }, page.id)
    if (!layerIds.has(c.layerId)) c.layerId = layers[0]?.id ?? DEFAULT_LAYER_ID
    return c
  })
  // successive pastes keep cascading
  objectClipboard = structuredClone(copies)
  addObjects(docId, copies, 'Paste')
  useSelectionStore.getState().setObjects(copies.map((c) => c.id))
  return copies
}

/** Handles the browser `paste` event: internal objects first, then images, then text. */
export async function handlePasteEvent(e: ClipboardEvent, docId: string): Promise<boolean> {
  const dt = e.clipboardData
  if (!dt) return false
  const page = currentPage(docId)
  if (!page) return false
  const layerId = useAnnotationStore.getState().byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID
  const imageFile = Array.from(dt.files).find((f) => f.type.startsWith('image/'))
  if (imageFile) {
    e.preventDefault()
    try {
      const info = await importImageAsset(imageFile, imageFile.name || 'pasted-image')
      const w = Math.min(page.width * 0.5, info.width * 0.75)
      const h = (w * info.height) / info.width
      const obj = createImage(page.id, layerId, { x: (page.width - w) / 2, y: (page.height - h) / 2, w, h }, info.id)
      addObjects(docId, [obj], 'Paste image')
      useSelectionStore.getState().setObjects([obj.id])
    } catch (err) {
      toast.error('Could not paste the image', { description: (err as Error).message })
    }
    return true
  }
  if (hasObjectClipboard() && !dt.getData('text/plain')) {
    e.preventDefault()
    pasteObjects(docId)
    return true
  }
  const text = dt.getData('text/plain')
  if (text.trim() && (hasObjectClipboard() === false)) {
    e.preventDefault()
    const o = useToolStore.getState().options
    const lines = text.split('\n')
    const longest = Math.max(...lines.map((l) => l.length))
    const w = Math.min(page.width - 72, Math.max(80, longest * o.fontSize * 0.55 + 8))
    const h = lines.length * o.fontSize * o.lineHeight + 8
    const obj = createText(page.id, layerId, { x: 48, y: 72, w, h }, { text, font: o.font, fontSize: o.fontSize, color: o.textColor })
    addObjects(docId, [obj], 'Paste text')
    useSelectionStore.getState().setObjects([obj.id])
    return true
  }
  if (hasObjectClipboard()) {
    e.preventDefault()
    pasteObjects(docId)
    return true
  }
  return false
}

export function activeDoc(): string | null {
  return usePdfStore.getState().activeId
}
