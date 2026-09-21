import {
  DEFAULT_FILTERS,
  type Brush,
  type EditObject,
  type FieldObj,
  type FieldType,
  type ImageObj,
  type InkObj,
  type LinkObj,
  type LinkTarget,
  type MarkupKind,
  type MarkupObj,
  type NoteObj,
  type ObjBase,
  type Pt,
  type RedactObj,
  type Rect,
  type ShapeKind,
  type ShapeObj,
  type StampObj,
  type TextObj,
} from '@/types'
import { uid } from '@/utils/id'
import { unionRects } from './geometry'

export function baseProps(pageId: string, layerId: string, box: Rect): ObjBase {
  return { id: uid('obj'), pageId, layerId, x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0, opacity: 1 }
}

export function createText(pageId: string, layerId: string, box: Rect, over: Partial<TextObj> = {}): TextObj {
  return {
    ...baseProps(pageId, layerId, box),
    type: 'text',
    text: '',
    font: 'helvetica',
    fontSize: 14,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: '#111111',
    align: 'left',
    lineHeight: 1.25,
    letterSpacing: 0,
    bg: null,
    cover: null,
    autoFit: false,
    list: 'none',
    border: null,
    radius: 0,
    callout: null,
    link: null,
    heading: 0,
    ...over,
  }
}

export function createMarkup(pageId: string, layerId: string, kind: MarkupKind, color: string, absRects: Rect[], over: Partial<MarkupObj> = {}): MarkupObj {
  const box = unionRects(absRects)
  const w = box.w || 1
  const h = box.h || 1
  return {
    ...baseProps(pageId, layerId, box),
    type: 'markup',
    kind,
    color,
    rects: absRects.map((r) => ({ x: (r.x - box.x) / w, y: (r.y - box.y) / h, w: r.w / w, h: r.h / h })),
    opacity: kind === 'highlight' ? 0.4 : 1,
    ...over,
  }
}

export function createNote(pageId: string, layerId: string, x: number, y: number, over: Partial<NoteObj> = {}): NoteObj {
  return { ...baseProps(pageId, layerId, { x, y, w: 24, h: 24 }), type: 'note', text: '', author: '', color: '#facc15', ...over }
}

/** Builds an ink object from absolute points (base space); normalises to the bounding box. */
export function createInk(pageId: string, layerId: string, pts: Pt[], brush: Brush, color: string, width: number, opacity = 1): InkObj {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const [x, y] of pts) {
    x1 = Math.min(x1, x)
    y1 = Math.min(y1, y)
    x2 = Math.max(x2, x)
    y2 = Math.max(y2, y)
  }
  const pad = width / 2
  const box = { x: x1 - pad, y: y1 - pad, w: Math.max(1, x2 - x1) + 2 * pad, h: Math.max(1, y2 - y1) + 2 * pad }
  return {
    ...baseProps(pageId, layerId, box),
    type: 'ink',
    brush,
    color,
    width,
    opacity,
    pts: pts.map(([x, y]) => [(x - box.x) / box.w, (y - box.y) / box.h] as Pt),
  }
}

export function createShape(pageId: string, layerId: string, shape: ShapeKind, box: Rect, over: Partial<ShapeObj> = {}): ShapeObj {
  const line = shape === 'line' || shape === 'arrow' || shape === 'darrow'
  return {
    ...baseProps(pageId, layerId, box),
    type: 'shape',
    shape,
    stroke: '#e11d48',
    fill: null,
    strokeWidth: 2,
    dash: 'solid',
    pts: line ? [[0, 0], [1, 1]] : [],
    radius: shape === 'rrect' ? 10 : undefined,
    sides: shape === 'star' ? 5 : undefined,
    ...over,
  }
}

/** Builds a polygon/path object from absolute points. */
export function createPointShape(pageId: string, layerId: string, shape: 'polygon' | 'path' | 'line' | 'arrow' | 'darrow', abs: Pt[], over: Partial<ShapeObj> = {}): ShapeObj {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const [x, y] of abs) {
    x1 = Math.min(x1, x)
    y1 = Math.min(y1, y)
    x2 = Math.max(x2, x)
    y2 = Math.max(y2, y)
  }
  const sw = over.strokeWidth ?? 2
  const box = { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) }
  void sw
  return createShape(pageId, layerId, shape, box, {
    ...over,
    pts: abs.map(([x, y]) => [(x - box.x) / box.w, (y - box.y) / box.h] as Pt),
    closed: shape === 'polygon',
  })
}

export function createStamp(pageId: string, layerId: string, box: Rect, over: Partial<StampObj> = {}): StampObj {
  return { ...baseProps(pageId, layerId, box), type: 'stamp', label: 'APPROVED', color: '#16a34a', showDate: false, dynamic: false, ...over }
}

export function createImage(pageId: string, layerId: string, box: Rect, assetId: string, over: Partial<ImageObj> = {}): ImageObj {
  return {
    ...baseProps(pageId, layerId, box),
    type: 'image',
    assetId,
    role: 'image',
    flipH: false,
    flipV: false,
    filters: { ...DEFAULT_FILTERS },
    crop: null,
    quality: 1,
    ...over,
  }
}

export function createRedact(pageId: string, layerId: string, box: Rect, over: Partial<RedactObj> = {}): RedactObj {
  return { ...baseProps(pageId, layerId, box), type: 'redact', color: '#000000', reason: '', overlayText: '', ...over }
}

export function createLink(pageId: string, layerId: string, box: Rect, target: LinkTarget, over: Partial<LinkObj> = {}): LinkObj {
  return { ...baseProps(pageId, layerId, box), type: 'link', target, border: { color: '#2563eb', width: 1, style: 'solid' }, ...over }
}

const FIELD_SIZES: Record<FieldType, [number, number]> = {
  text: [160, 24],
  checkbox: [16, 16],
  radio: [16, 16],
  dropdown: [140, 24],
  listbox: [140, 70],
  button: [100, 28],
  date: [110, 24],
  signature: [180, 50],
}

export function createField(ftype: FieldType, pageId: string, layerId: string, at: { x: number; y: number; w?: number; h?: number }, over: Partial<FieldObj> = {}): FieldObj {
  const [dw, dh] = FIELD_SIZES[ftype]
  const w = at.w && at.w > 4 ? at.w : dw
  const h = at.h && at.h > 4 ? at.h : dh
  return {
    ...baseProps(pageId, layerId, { x: at.x, y: at.y, w, h }),
    type: 'field',
    ftype,
    fieldName: '',
    value: ftype === 'checkbox' || ftype === 'radio' ? false : '',
    defaultValue: ftype === 'checkbox' || ftype === 'radio' ? false : '',
    options: ftype === 'dropdown' || ftype === 'listbox' ? ['Option 1', 'Option 2', 'Option 3'] : [],
    exportValue: ftype === 'radio' ? 'Choice1' : 'Yes',
    required: false,
    readOnly: false,
    multiline: false,
    tooltip: '',
    fontSize: 11,
    label: ftype === 'button' ? 'Button' : '',
    validation: { kind: ftype === 'date' ? 'regex' : 'none', pattern: ftype === 'date' ? '^\\d{4}-\\d{2}-\\d{2}$' : undefined, message: ftype === 'date' ? 'Use YYYY-MM-DD' : undefined },
    tabIndex: 0,
    native: false,
    ...over,
  }
}

/** Generates a unique field name like "text_3" given the names already used in the document. */
export function uniqueFieldName(base: string, existing: Iterable<string>): string {
  const used = new Set(existing)
  let i = 1
  while (used.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

export function cloneObject<T extends EditObject>(o: T, offset = { x: 12, y: 12 }, pageId = o.pageId): T {
  const copy = structuredClone(o)
  copy.id = uid('obj')
  copy.pageId = pageId
  copy.x += offset.x
  copy.y += offset.y
  if (copy.type === 'field') {
    copy.native = false
    copy.fieldName = copy.fieldName ? `${copy.fieldName}_copy` : ''
  }
  return copy
}
