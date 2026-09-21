import { initMeasurer } from '@/engine/fonts'
import { createImage, createText } from '@/lib/object-factory'
import { naturalSize } from '@/lib/text-object'
import { addObjects, removeObjects } from '@/services/pdf/annotation-service'
import { getAssetInfo } from '@/services/assets'
import { getObjects, useAnnotationStore } from '@/stores/annotation-store'
import { getPages } from '@/stores/page-store'
import { DEFAULT_LAYER_ID, type EditObject, type FontFamilyKey, type PageModel, type TextObj } from '@/types'
import { effectiveCrop } from '@/lib/geometry'
import { uid } from '@/utils/id'

export type Position = 'center' | 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right'

function layerFor(docId: string) {
  return useAnnotationStore.getState().byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID
}
/** Usable region of a page in base space (its visible crop). */
const areaOf = (p: PageModel) => effectiveCrop(p)

function place(area: { x: number; y: number; w: number; h: number }, w: number, h: number, pos: Position, margin: number) {
  let x = area.x + (area.w - w) / 2
  let y = area.y + (area.h - h) / 2
  if (pos.includes('left')) x = area.x + margin
  if (pos.includes('right')) x = area.x + area.w - w - margin
  if (pos.startsWith('top')) y = area.y + margin
  if (pos.startsWith('bottom')) y = area.y + area.h - h - margin
  if (pos === 'left') x = area.x + margin
  if (pos === 'right') x = area.x + area.w - w - margin
  return { x, y }
}

export interface TextWatermark {
  text: string
  font: FontFamilyKey
  fontSize: number
  color: string
  opacity: number
  rotation: number
  position: Position
  tile: boolean
  bold: boolean
  pageIds: string[]
}

export async function applyTextWatermark(docId: string, w: TextWatermark): Promise<string> {
  const measure = await initMeasurer()
  const group = uid('wm')
  const objs: EditObject[] = []
  for (const page of getPages(docId).filter((p) => w.pageIds.includes(p.id))) {
    const probe = createText(page.id, layerFor(docId), { x: 0, y: 0, w: 10, h: 10 }, { text: w.text, font: w.font, fontSize: w.fontSize, bold: w.bold, lineHeight: 1.1 })
    const s = naturalSize(probe, measure)
    const pos = place(areaOf(page), s.w, s.h, w.position, 24)
    objs.push(
      createText(page.id, layerFor(docId), { x: pos.x, y: pos.y, w: s.w, h: s.h }, {
        text: w.text,
        font: w.font,
        fontSize: w.fontSize,
        bold: w.bold,
        color: w.color,
        opacity: w.opacity,
        rotation: w.rotation,
        lineHeight: 1.1,
        tile: w.tile ? { gapX: w.fontSize * 2, gapY: w.fontSize * 3 } : null,
        decoration: { group, kind: 'watermark' },
        tokens: true,
      } as Partial<TextObj>),
    )
  }
  addObjects(docId, objs, 'Add watermark')
  return group
}

export interface ImageWatermark {
  assetId: string
  /** Width as a fraction of the page width. */
  scale: number
  opacity: number
  rotation: number
  position: Position
  tile: boolean
  pageIds: string[]
}

export function applyImageWatermark(docId: string, w: ImageWatermark): string {
  const info = getAssetInfo(w.assetId)
  const group = uid('wm')
  const objs: EditObject[] = []
  if (!info) return group
  for (const page of getPages(docId).filter((p) => w.pageIds.includes(p.id))) {
    const area = areaOf(page)
    const iw = area.w * w.scale
    const ih = (iw * info.height) / info.width
    const make = (x: number, y: number) =>
      createImage(page.id, layerFor(docId), { x, y, w: iw, h: ih }, w.assetId, { opacity: w.opacity, rotation: w.rotation, decoration: { group, kind: 'watermark' }, role: 'image' })
    if (w.tile) {
      const gx = iw * 1.5
      const gy = ih * 1.5
      let n = 0
      for (let y = area.y; y < area.y + area.h && n < 120; y += gy) for (let x = area.x; x < area.x + area.w && n < 120; x += gx, n++) objs.push(make(x, y))
    } else {
      const p = place(area, iw, ih, w.position, 24)
      objs.push(make(p.x, p.y))
    }
  }
  addObjects(docId, objs, 'Add image watermark')
  return group
}

export interface HeaderFooter {
  kind: 'header' | 'footer'
  left: string
  center: string
  right: string
  font: FontFamilyKey
  fontSize: number
  color: string
  margin: number
  skipFirst: boolean
  pageIds: string[]
}

/** Creates header/footer text objects using {page} {total} {label} {date} {time} tokens (resolved per page at render/export). */
export async function applyHeaderFooter(docId: string, hf: HeaderFooter): Promise<string> {
  const group = uid(hf.kind)
  const pages = getPages(docId)
  const objs: EditObject[] = []
  const slots: { text: string; align: 'left' | 'center' | 'right' }[] = [
    { text: hf.left, align: 'left' },
    { text: hf.center, align: 'center' },
    { text: hf.right, align: 'right' },
  ]
  for (const page of pages.filter((p) => hf.pageIds.includes(p.id))) {
    if (hf.skipFirst && pages[0]?.id === page.id) continue
    const area = areaOf(page)
    const usable = area.w - 2 * hf.margin
    const boxW = usable / 3
    const h = hf.fontSize * 1.3 + 4
    const y = hf.kind === 'header' ? area.y + hf.margin * 0.6 : area.y + area.h - hf.margin * 0.6 - h
    slots.forEach((s, i) => {
      if (!s.text.trim()) return
      objs.push(
        createText(page.id, layerFor(docId), { x: area.x + hf.margin + i * boxW, y, w: boxW, h }, {
          text: s.text,
          font: hf.font,
          fontSize: hf.fontSize,
          color: hf.color,
          align: s.align,
          lineHeight: 1.2,
          tokens: true,
          decoration: { group, kind: hf.kind },
        } as Partial<TextObj>),
      )
    })
  }
  addObjects(docId, objs, hf.kind === 'header' ? 'Add header' : 'Add footer')
  return group
}

export interface BatesSettings {
  prefix: string
  suffix: string
  start: number
  digits: number
  position: 'bottom-right' | 'bottom-left' | 'bottom' | 'top-right' | 'top-left' | 'top'
  fontSize: number
  pageIds: string[]
}

export function applyBates(docId: string, b: BatesSettings): string {
  const group = uid('bates')
  const objs: EditObject[] = []
  const pages = getPages(docId)
  for (const page of pages.filter((p) => b.pageIds.includes(p.id))) {
    const area = areaOf(page)
    const w = 200
    const h = b.fontSize * 1.3 + 4
    const pos = place(area, w, h, b.position, 24)
    objs.push(
      createText(page.id, layerFor(docId), { x: pos.x, y: pos.y, w, h }, {
        text: '{bates}',
        fontSize: b.fontSize,
        align: b.position.includes('right') ? 'right' : b.position.includes('left') ? 'left' : 'center',
        tokens: true,
        bates: { prefix: b.prefix, suffix: b.suffix, start: b.start, digits: b.digits },
        decoration: { group, kind: 'bates' },
      } as Partial<TextObj>),
    )
  }
  addObjects(docId, objs, 'Add Bates numbering')
  return group
}

export function decorationGroups(docId: string, kind?: 'watermark' | 'header' | 'footer' | 'bates') {
  const map = new Map<string, { group: string; kind: string; count: number; sample: string }>()
  for (const o of getObjects(docId)) {
    if (!o.decoration || (kind && o.decoration.kind !== kind)) continue
    const cur = map.get(o.decoration.group)
    if (cur) cur.count++
    else map.set(o.decoration.group, { group: o.decoration.group, kind: o.decoration.kind, count: 1, sample: o.type === 'text' ? o.text : o.type })
  }
  return [...map.values()]
}

export function removeDecoration(docId: string, group: string) {
  const ids = getObjects(docId).filter((o) => o.decoration?.group === group).map((o) => o.id)
  if (ids.length) removeObjects(docId, ids, 'Remove watermark/header/footer')
}
