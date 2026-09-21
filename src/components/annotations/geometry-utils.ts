import type { EditObject, Pt, Rect } from '@/types'

export type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: { id: HandleId; x: number; y: number; cursor: string }[] = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { id: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { id: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { id: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
]

const dirOf = (h: HandleId): [number, number] => [h.includes('e') ? 1 : h.includes('w') ? -1 : 0, h.includes('s') ? 1 : h.includes('n') ? -1 : 0]

const rot = (x: number, y: number, deg: number): Pt => {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [x * c - y * s, x * s + y * c]
}

/** New geometry after dragging a resize handle to base-space point `p` (works for rotated objects). */
export function resizeBox(o: Rect & { rotation: number }, handle: HandleId, p: Pt, keepAspect: boolean, min = 6): Rect {
  const cx = o.x + o.w / 2
  const cy = o.y + o.h / 2
  const [lx, ly] = rot(p[0] - cx, p[1] - cy, -o.rotation)
  const [hx, hy] = dirOf(handle)
  let w = o.w
  let h = o.h
  let ncx = 0
  let ncy = 0
  if (hx !== 0) {
    const ex = (-hx * o.w) / 2
    w = Math.max(min, hx * (lx - ex))
    ncx = ex + (hx * w) / 2
  }
  if (hy !== 0) {
    const ey = (-hy * o.h) / 2
    h = Math.max(min, hy * (ly - ey))
    ncy = ey + (hy * h) / 2
  }
  if (keepAspect && hx !== 0 && hy !== 0) {
    const ratio = o.w / o.h
    if (w / h > ratio) w = h * ratio
    else h = w / ratio
    ncx = (-hx * o.w) / 2 + (hx * w) / 2
    ncy = (-hy * o.h) / 2 + (hy * h) / 2
  }
  const [dx, dy] = rot(ncx, ncy, o.rotation)
  const ncxB = cx + dx
  const ncyB = cy + dy
  return { x: ncxB - w / 2, y: ncyB - h / 2, w, h }
}

export function boundsOf(objs: EditObject[]): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const o of objs) {
    x1 = Math.min(x1, o.x)
    y1 = Math.min(y1, o.y)
    x2 = Math.max(x2, o.x + o.w)
    y2 = Math.max(y2, o.y + o.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/** Douglas–Peucker simplification for freehand strokes. */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let max = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = distToSeg(pts[i], pts[a], pts[b])
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = true
      stack.push([a, idx], [idx, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Is base-space point p inside (or within `pad` of) the object's rotated box? */
export function hitObject(o: EditObject, p: Pt, pad = 0): boolean {
  const cx = o.x + o.w / 2
  const cy = o.y + o.h / 2
  const [lx, ly] = rot(p[0] - cx, p[1] - cy, -o.rotation)
  return Math.abs(lx) <= o.w / 2 + pad && Math.abs(ly) <= o.h / 2 + pad
}

/** Distance from p to the stroke of an ink/line object (for the eraser). */
export function hitStroke(o: EditObject, p: Pt, tol: number): boolean {
  if (!hitObject(o, p, tol)) return false
  if (o.type === 'ink') {
    const pts = o.pts.map(([x, y]) => [o.x + x * o.w, o.y + y * o.h] as Pt)
    for (let i = 0; i < pts.length - 1; i++) if (distToSeg(p, pts[i], pts[i + 1]) <= tol + o.width / 2) return true
    return pts.length === 1 ? Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= tol + o.width / 2 : false
  }
  if (o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow' || o.shape === 'darrow')) {
    const a: Pt = [o.x + o.pts[0][0] * o.w, o.y + o.pts[0][1] * o.h]
    const b: Pt = [o.x + o.pts[o.pts.length - 1][0] * o.w, o.y + o.pts[o.pts.length - 1][1] * o.h]
    return distToSeg(p, a, b) <= tol + o.strokeWidth / 2
  }
  return true
}
