import type { Pt, ShapeObj } from '@/types'

/** SVG path builders in local coordinates (0..w, 0..h, y down). Shared by the viewer (SVG) and the exporter (pdf-lib). */

const f = (n: number) => +n.toFixed(3)

export function rectPath(w: number, h: number, r = 0): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  if (!rr) return `M0 0 L${f(w)} 0 L${f(w)} ${f(h)} L0 ${f(h)} Z`
  const k = rr * 0.5523
  return [
    `M${f(rr)} 0 L${f(w - rr)} 0 C${f(w - rr + k)} 0 ${f(w)} ${f(rr - k)} ${f(w)} ${f(rr)}`,
    `L${f(w)} ${f(h - rr)} C${f(w)} ${f(h - rr + k)} ${f(w - rr + k)} ${f(h)} ${f(w - rr)} ${f(h)}`,
    `L${f(rr)} ${f(h)} C${f(rr - k)} ${f(h)} 0 ${f(h - rr + k)} 0 ${f(h - rr)}`,
    `L0 ${f(rr)} C0 ${f(rr - k)} ${f(rr - k)} 0 ${f(rr)} 0 Z`,
  ].join(' ')
}

export function ellipsePath(w: number, h: number): string {
  const rx = w / 2
  const ry = h / 2
  const kx = rx * 0.5523
  const ky = ry * 0.5523
  return [
    `M0 ${f(ry)} C0 ${f(ry - ky)} ${f(rx - kx)} 0 ${f(rx)} 0`,
    `C${f(rx + kx)} 0 ${f(w)} ${f(ry - ky)} ${f(w)} ${f(ry)}`,
    `C${f(w)} ${f(ry + ky)} ${f(rx + kx)} ${f(h)} ${f(rx)} ${f(h)}`,
    `C${f(rx - kx)} ${f(h)} 0 ${f(ry + ky)} 0 ${f(ry)} Z`,
  ].join(' ')
}

export function starPath(w: number, h: number, points = 5, inner = 0.42): string {
  const cx = w / 2
  const cy = h / 2
  const out: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner
    const a = -Math.PI / 2 + (i * Math.PI) / points
    out.push(`${i ? 'L' : 'M'}${f(cx + Math.cos(a) * r * cx)} ${f(cy + Math.sin(a) * r * cy)}`)
  }
  return out.join(' ') + ' Z'
}

/** Revision-cloud outline: a rectangle whose edges are replaced by outward scallops. */
export function cloudPath(w: number, h: number): string {
  const bump = Math.max(4, Math.min(w, h) / 6)
  const x0 = bump * 0.6
  const y0 = bump * 0.6
  const x1 = w - bump * 0.6
  const y1 = h - bump * 0.6
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number): string => {
    const len = Math.hypot(bx - ax, by - ay)
    const n = Math.max(1, Math.round(len / (bump * 2)))
    let d = ''
    for (let i = 0; i < n; i++) {
      const sx = ax + ((bx - ax) * i) / n
      const sy = ay + ((by - ay) * i) / n
      const ex = ax + ((bx - ax) * (i + 1)) / n
      const ey = ay + ((by - ay) * (i + 1)) / n
      const mx = (sx + ex) / 2 + nx * bump * 1.3
      const my = (sy + ey) / 2 + ny * bump * 1.3
      d += ` Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`
    }
    return d
  }
  return (
    `M${f(x0)} ${f(y0)}` +
    edge(x0, y0, x1, y0, 0, -1) +
    edge(x1, y0, x1, y1, 1, 0) +
    edge(x1, y1, x0, y1, 0, 1) +
    edge(x0, y1, x0, y0, -1, 0) +
    ' Z'
  )
}

export function absPts(pts: Pt[], w: number, h: number): Pt[] {
  return pts.map(([x, y]) => [x * w, y * h] as Pt)
}

export function polylinePath(pts: Pt[], closed: boolean): string {
  if (!pts.length) return ''
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ') + (closed ? ' Z' : '')
}

/** Smooth open/closed curve through points (Catmull-Rom → cubic Bézier). */
export function smoothPath(pts: Pt[], closed = false, tension = 0.5): string {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${f(pts[0][0])} ${f(pts[0][1])} L${f(pts[0][0] + 0.01)} ${f(pts[0][1])}`
  if (n === 2) return polylinePath(pts, false)
  const p = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.min(n - 1, Math.max(0, i))])
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = p(i - 1)
    const p1 = p(i)
    const p2 = p(i + 1)
    const p3 = p(i + 2)
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) * tension) / 3, p1[1] + ((p2[1] - p0[1]) * tension) / 3]
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) * tension) / 3, p2[1] - ((p3[1] - p1[1]) * tension) / 3]
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  }
  return d + (closed ? ' Z' : '')
}

/** Quadratic-smoothed freehand stroke (midpoint method); good for dense pointer samples. */
export function inkPath(pts: Pt[]): string {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${f(pts[0][0])} ${f(pts[0][1])} L${f(pts[0][0] + 0.01)} ${f(pts[0][1])}`
  if (n === 2) return polylinePath(pts, false)
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 1; i < n - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`
  }
  d += ` L${f(pts[n - 1][0])} ${f(pts[n - 1][1])}`
  return d
}

/** Filled triangular arrow head with its tip at `tip`, pointing away from `from`. */
export function arrowHead(from: Pt, tip: Pt, size: number): string {
  const a = Math.atan2(tip[1] - from[1], tip[0] - from[0])
  const spread = Math.PI / 7
  const p1: Pt = [tip[0] - Math.cos(a - spread) * size, tip[1] - Math.sin(a - spread) * size]
  const p2: Pt = [tip[0] - Math.cos(a + spread) * size, tip[1] - Math.sin(a + spread) * size]
  return `M${f(tip[0])} ${f(tip[1])} L${f(p1[0])} ${f(p1[1])} L${f(p2[0])} ${f(p2[1])} Z`
}

export function squigglePath(x: number, y: number, w: number, amp: number, period: number): string {
  let d = `M${f(x)} ${f(y)}`
  let dir = 1
  for (let cx = x; cx < x + w; cx += period / 2) {
    const nx = Math.min(x + w, cx + period / 2)
    d += ` L${f(nx)} ${f(y + dir * amp)}`
    dir *= -1
  }
  return d
}

export function dashArray(dash: ShapeObj['dash'], width: number): number[] | undefined {
  if (dash === 'dashed') return [width * 4, width * 2.5]
  if (dash === 'dotted') return [width * 0.2, width * 2.2]
  return undefined
}

export interface ShapeGeometry {
  /** Main outline path (fillable when `closed`). */
  main: string
  closed: boolean
  /** Extra filled paths (arrow heads). */
  heads: string[]
}

/** Computes the drawable geometry of a shape object in its local box. */
export function shapeGeometry(s: ShapeObj): ShapeGeometry {
  const { w, h } = s
  switch (s.shape) {
    case 'rect':
      return { main: rectPath(w, h), closed: true, heads: [] }
    case 'rrect':
      return { main: rectPath(w, h, s.radius ?? 10), closed: true, heads: [] }
    case 'ellipse':
      return { main: ellipsePath(w, h), closed: true, heads: [] }
    case 'star':
      return { main: starPath(w, h, s.sides ?? 5), closed: true, heads: [] }
    case 'cloud':
      return { main: cloudPath(w, h), closed: true, heads: [] }
    case 'polygon': {
      const pts = absPts(s.pts, w, h)
      return { main: polylinePath(pts, true), closed: true, heads: [] }
    }
    case 'path': {
      const pts = absPts(s.pts, w, h)
      return { main: smoothPath(pts, !!s.closed), closed: !!s.closed, heads: [] }
    }
    case 'line':
    case 'arrow':
    case 'darrow': {
      const pts = absPts(s.pts.length >= 2 ? s.pts : [[0, 0], [1, 1]], w, h)
      const a = pts[0]
      const b = pts[pts.length - 1]
      const size = Math.max(7, s.strokeWidth * 4.5)
      const heads: string[] = []
      if (s.shape !== 'line') heads.push(arrowHead(a, b, size))
      if (s.shape === 'darrow') heads.push(arrowHead(b, a, size))
      return { main: polylinePath(pts, false), closed: false, heads }
    }
  }
}

/** Callout speech-tail: a triangle from the nearest box edge to `tip` (fractions of the box, may be outside). */
export function calloutTailPath(w: number, h: number, tipFrac: Pt): string {
  const tx = tipFrac[0] * w
  const ty = tipFrac[1] * h
  const cx = w / 2
  const cy = h / 2
  const dx = tx - cx
  const dy = ty - cy
  const half = Math.min(10, Math.min(w, h) / 4)
  if (Math.abs(dx) / (w / 2) > Math.abs(dy) / (h / 2)) {
    const ex = dx > 0 ? w : 0
    const y = Math.min(h - half, Math.max(half, ty))
    return `M${f(ex)} ${f(y - half)} L${f(tx)} ${f(ty)} L${f(ex)} ${f(y + half)}`
  }
  const ey = dy > 0 ? h : 0
  const x = Math.min(w - half, Math.max(half, tx))
  return `M${f(x - half)} ${f(ey)} L${f(tx)} ${f(ty)} L${f(x + half)} ${f(ey)}`
}
