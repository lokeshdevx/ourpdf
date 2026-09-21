import { toast } from 'sonner'
import { createText } from '@/lib/object-factory'
import { normRotation } from '@/lib/geometry'
import { addObjects, patchObjects, updateObjects } from '@/services/pdf/annotation-service'
import { importImageAsset } from '@/services/pdf/image-service'
import { pickFiles } from '@/services/import'
import { getAssetInfo } from '@/services/assets'
import { getObjects, useAnnotationStore } from '@/stores/annotation-store'
import { getPages, usePageStore } from '@/stores/page-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_LAYER_ID, type ImageObj, type TextObj } from '@/types'
import { formatDate } from '@/utils/format'
import { activeId } from './actions'

/** Arms the image tool with an asset: the next click/drag on a page places it. */
export function armImage(assetId: string, role: ImageObj['role'], width = 180) {
  const info = getAssetInfo(assetId)
  useToolStore.getState().setOptions({ pendingAssetId: assetId, pendingRole: role, pendingWidth: Math.min(width, info?.width ?? width) })
  useToolStore.getState().setTool('image')
  toast.info(role === 'image' ? 'Click or drag on a page to place the image' : 'Click on the page to place it – you can move, resize and rotate it afterwards')
}

export async function insertImageFromFile() {
  const files = await pickFiles({ accept: 'image/png,image/jpeg,image/webp,image/tiff,.png,.jpg,.jpeg,.webp,.tif,.tiff', multiple: false })
  if (!files[0]) return
  try {
    const info = await importImageAsset(files[0], files[0].name)
    armImage(info.id, 'image', 240)
  } catch (e) {
    toast.error('Could not insert the image', { description: (e as Error).message })
  }
}

export async function replaceSelectedImage() {
  const docId = activeId()
  const sel = useSelectionStore.getState().objectIds
  if (!docId) return
  const img = getObjects(docId).find((o) => sel.includes(o.id) && o.type === 'image') as ImageObj | undefined
  if (!img) return toast.info('Select an image first')
  const files = await pickFiles({ accept: 'image/*', multiple: false })
  if (!files[0]) return
  try {
    const info = await importImageAsset(files[0], files[0].name)
    // keep the box width, adapt height to the new aspect ratio
    updateObjects(docId, { [img.id]: { assetId: info.id, h: (img.w * info.height) / info.width, crop: null } }, 'Replace image')
  } catch (e) {
    toast.error('Could not replace the image', { description: (e as Error).message })
  }
}

export function rotateSelected(delta: number) {
  const docId = activeId()
  if (!docId) return
  const ids = useSelectionStore.getState().objectIds
  const objs = getObjects(docId).filter((o) => ids.includes(o.id) && !o.locked)
  const patches: Record<string, { rotation: number }> = {}
  for (const o of objs) patches[o.id] = { rotation: normRotation(o.rotation + delta) === 0 && delta % 360 ? (o.rotation + delta + 360) % 360 : (o.rotation + delta + 360) % 360 }
  if (Object.keys(patches).length) updateObjects(docId, patches, 'Rotate')
}

export function flipSelected(axis: 'h' | 'v') {
  const docId = activeId()
  if (!docId) return
  const ids = useSelectionStore.getState().objectIds
  const imgs = getObjects(docId).filter((o): o is ImageObj => ids.includes(o.id) && o.type === 'image' && !o.locked)
  const patches: Record<string, Partial<ImageObj>> = {}
  for (const i of imgs) patches[i.id] = axis === 'h' ? { flipH: !i.flipH } : { flipV: !i.flipV }
  if (imgs.length) updateObjects(docId, patches, axis === 'h' ? 'Flip horizontal' : 'Flip vertical')
}

export function lockSelected(locked: boolean) {
  const docId = activeId()
  if (!docId) return
  const ids = useSelectionStore.getState().objectIds
  if (ids.length) patchObjects(docId, ids, { locked }, locked ? 'Lock' : 'Unlock')
}

/** Text quick-insert for the Sign category: today's date or the author's name. */
export function insertQuickText(kind: 'date' | 'name' | 'text', text?: string) {
  const docId = activeId()
  if (!docId) return
  const st = usePageStore.getState().byDoc[docId]
  const page = st?.pages[st.current] ?? getPages(docId)[0]
  if (!page) return
  const o = useToolStore.getState().options
  const value = text ?? (kind === 'date' ? formatDate(new Date()) : useUiStore.getState().author || 'Your name')
  const fs = o.fontSize
  const w = Math.max(90, value.length * fs * 0.6 + 8)
  const layerId = useAnnotationStore.getState().byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID
  const obj = createText(page.id, layerId, { x: (page.width - w) / 2, y: page.height * 0.4, w, h: fs * 1.25 + 4 }, { text: value, font: o.font, fontSize: fs, color: o.textColor } as Partial<TextObj>)
  addObjects(docId, [obj], kind === 'date' ? 'Insert date' : 'Insert name')
  useSelectionStore.getState().setObjects([obj.id])
  useToolStore.getState().setTool('select')
}
