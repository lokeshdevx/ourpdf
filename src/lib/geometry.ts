import type { Frame, PageModel, Pt, Rect, Rotation } from '@/types'

export const rectRight = (r: Rect) => r.x + r.w
export const rectBottom = (r: Rect) => r.y + r.h

export function normRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
}
export function unionRects(rs: Rect[]): Rect {
  if (!rs.length) return { x: 0, y: 0, w: 0, h: 0 }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const r of rs) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.w)
    y2 = Math.max(y2, r.y + r.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}
export function pointInRect(p: Pt, r: Rect, pad = 0): boolean {
  return p[0] >= r.x - pad && p[0] <= r.x + r.w + pad && p[1] >= r.y - pad && p[1] <= r.y + r.h + pad
}
export function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d }
}

export const normRotation = (deg: number): Rotation => ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation

type Geo = Pick<PageModel, 'width' | 'height' | 'frame' | 'crop' | 'rotation'>

export function effectiveCrop(p: Pick<PageModel, 'width' | 'height' | 'crop'>): Rect {
  return p.crop ?? { x: 0, y: 0, w: p.width, h: p.height }
}

/** The frame actually used for a page (identity frame around the crop when none is set). */
export function effectiveFrame(p: Pick<PageModel, 'width' | 'height' | 'frame' | 'crop'>): Frame {
  if (p.frame) return p.frame
  const c = effectiveCrop(p)
  return { w: c.w, h: c.h, x: 0, y: 0, s: 1 }
}

/** Size of the page as displayed (frame size, swapped by the user rotation). */
export function displaySize(p: Geo): { w: number; h: number } {
  const f = effectiveFrame(p)
  return p.rotation === 90 || p.rotation === 270 ? { w: f.h, h: f.w } : { w: f.w, h: f.h }
}

/** Maps points from the base page space into the rotated display space of the frame (unit scale). */
export function frameToDisplay(rotation: number, fw: number, fh: number, x: number, y: number): Pt {
  switch (normRotation(rotation)) {
    case 90:
      return [fh - y, x]
    case 180:
      return [fw - x, fh - y]
    case 270:
      return [y, fw - x]
    default:
      return [x, y]
  }
}
/** Inverse of frameToDisplay. */
export function displayToFrame(rotation: number, fw: number, fh: number, x: number, y: number): Pt {
  switch (normRotation(rotation)) {
    case 90:
      return [y, fh - x]
    case 180:
      return [fw - x, fh - y]
    case 270:
      return [fw - y, x]
    default:
      return [x, y]
  }
}
/** Display-space point → base-space point (page space in which objects are stored). */
export function displayToBase(p: Geo, x: number, y: number): Pt {
  const f = effectiveFrame(p)
  const c = effectiveCrop(p)
  const [fx, fy] = displayToFrame(p.rotation, f.w, f.h, x, y)
  return [c.x + (fx - f.x) / f.s, c.y + (fy - f.y) / f.s]
}
/** Base-space point → display-space point (inverse of displayToBase). */
export function baseToDisplay(p: Geo, bx: number, by: number): Pt {
  const f = effectiveFrame(p)
  const c = effectiveCrop(p)
  return frameToDisplay(p.rotation, f.w, f.h, f.x + (bx - c.x) * f.s, f.y + (by - c.y) * f.s)
}

/** Placement of the base page inside the output PDF page (used by the export engine). */
export interface Placement {
  intrinsic: Rotation
  view: [number, number, number, number]
  s: number
  ox: number
  oy: number
}

/** Base-space point → PDF user-space point. */
export function baseToPdf(pl: Placement, bx: number, by: number): Pt {
  const [x0, y0, x1, y1] = pl.view
  const X = pl.ox + pl.s * bx
  const Y = pl.oy + pl.s * by
  switch (pl.intrinsic) {
    case 90:
      return [x0 + Y, y0 + X]
    case 180:
      return [x1 - X, y0 + Y]
    case 270:
      return [x1 - Y, y1 - X]
    default:
      return [x0 + X, y1 - Y]
  }
}
/** Base-space direction vector → PDF direction vector (scaled). */
export function baseVecToPdf(pl: Placement, vx: number, vy: number): Pt {
  const sx = vx * pl.s
  const sy = vy * pl.s
  switch (pl.intrinsic) {
    case 90:
      return [sy, sx]
    case 180:
      return [-sx, sy]
    case 270:
      return [-sy, -sx]
    default:
      return [sx, -sy]
  }
}

export type Matrix = [number, number, number, number, number, number]

/** Matrix mapping an object's local space (origin = centre, x right, y UP, in points) into PDF space. */
export function objectMatrix(pl: Placement, box: Rect, rotationDeg: number): Matrix {
  const th = (rotationDeg * Math.PI) / 180
  const c = Math.cos(th)
  const s = Math.sin(th)
  const [a, b] = baseVecToPdf(pl, c, s)
  const [cc, d] = baseVecToPdf(pl, s, -c)
  const [e, f] = baseToPdf(pl, box.x + box.w / 2, box.y + box.h / 2)
  return [a, b, cc, d, e, f]
}

/** Axis-aligned rectangle in base space → axis-aligned PDF rectangle {x,y,w,h} with y-up origin bottom-left. */
export function baseRectToPdf(pl: Placement, r: Rect): Rect {
  const p1 = baseToPdf(pl, r.x, r.y)
  const p2 = baseToPdf(pl, r.x + r.w, r.y + r.h)
  return { x: Math.min(p1[0], p2[0]), y: Math.min(p1[1], p2[1]), w: Math.abs(p2[0] - p1[0]), h: Math.abs(p2[1] - p1[1]) }
}

/** Bounding box of a rotated rect. */
export function rotatedBounds(r: Rect, deg: number): Rect {
  if (!deg) return r
  const th = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(th))
  const s = Math.abs(Math.sin(th))
  const w = r.w * c + r.h * s
  const h = r.w * s + r.h * c
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

export const PAGE_SIZES: Record<string, [number, number]> = {
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  Letter: [612, 792],
  Legal: [612, 1008],
  Tabloid: [792, 1224],
}
export const MM = 72 / 25.4
export const INCH = 72
