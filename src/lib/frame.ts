import type { Frame, PageModel, Rect } from '@/types'
import { effectiveCrop, effectiveFrame, type Placement } from './geometry'

export type Margins = { top: number; right: number; bottom: number; left: number }

/** Crop to `r` (base space). Resets the output frame: the page becomes exactly the crop size. */
export function applyCrop(_page: PageModel, r: Rect): Pick<PageModel, 'crop' | 'frame'> {
  return { crop: { x: r.x, y: r.y, w: Math.max(4, r.w), h: Math.max(4, r.h) }, frame: null }
}

export function resetCrop(): Pick<PageModel, 'crop' | 'frame'> {
  return { crop: null, frame: null }
}

/** Crop by insets in points (relative to the current visible content). */
export function cropByMargins(page: PageModel, m: Margins): Pick<PageModel, 'crop' | 'frame'> {
  const c = effectiveCrop(page)
  return applyCrop(page, { x: c.x + m.left, y: c.y + m.top, w: c.w - m.left - m.right, h: c.h - m.top - m.bottom })
}

/** Grow (positive) or shrink (negative) the page canvas by margins while keeping content in place. */
export function addMargins(page: PageModel, m: Margins): Frame {
  const f = effectiveFrame(page)
  return { ...f, w: Math.max(10, f.w + m.left + m.right), h: Math.max(10, f.h + m.top + m.bottom), x: f.x + m.left, y: f.y + m.top }
}

export type Align = 'center' | 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right'

/** Resize the page to w×h. Content keeps its size (fit=false) or is scaled to fit inside (fit=true), aligned. */
export function resizeFrame(page: PageModel, w: number, h: number, opts: { fit: boolean; align: Align; margin?: number }): Frame {
  const cur = effectiveFrame(page)
  const c = effectiveCrop(page)
  const m = opts.margin ?? 0
  const cdw = c.w * cur.s
  const cdh = c.h * cur.s
  const k = opts.fit ? Math.max(0.01, Math.min((w - 2 * m) / cdw, (h - 2 * m) / cdh)) : 1
  const dw = cdw * k
  const dh = cdh * k
  let x = (w - dw) / 2
  let y = (h - dh) / 2
  if (opts.align.includes('left')) x = m
  if (opts.align.includes('right')) x = w - dw - m
  if (opts.align.startsWith('top')) y = m
  if (opts.align.startsWith('bottom')) y = h - dh - m
  return { w, h, s: cur.s * k, x, y }
}

/** Align/centre the current content inside the same page size. */
export function alignFrame(page: PageModel, align: Align): Frame {
  const cur = effectiveFrame(page)
  return resizeFrame(page, cur.w, cur.h, { fit: false, align })
}

/**
 * True when the frame can be realised purely by editing the page's MediaBox/CropBox
 * (scale 1 and the framed region lies inside the visible crop) – preserves links, forms and annotations.
 */
export function usesBoxesOnly(page: PageModel): boolean {
  const f = effectiveFrame(page)
  if (Math.abs(f.s - 1) > 1e-6) return false
  if (!page.frame) return true
  const c = effectiveCrop(page)
  const eps = 0.01
  // frame region expressed in base space
  const rx = c.x - f.x
  const ry = c.y - f.y
  const inside = rx >= c.x - eps && ry >= c.y - eps && rx + f.w <= c.x + c.w + eps && ry + f.h <= c.y + c.h + eps
  if (inside) return true
  // frame extends beyond crop: fine only if there is no crop (extra area is blank/outside base page)
  return !page.crop
}

/** Placement used to map base-space objects into the exported PDF page. */
export function placementFor(page: PageModel): Placement {
  const f = effectiveFrame(page)
  const c = effectiveCrop(page)
  if (usesBoxesOnly(page)) {
    return { intrinsic: page.intrinsic, view: page.view, s: 1, ox: 0, oy: 0 }
  }
  const swap = page.intrinsic === 90 || page.intrinsic === 270
  const pw = swap ? f.h : f.w
  const ph = swap ? f.w : f.h
  return { intrinsic: page.intrinsic, view: [0, 0, pw, ph], s: f.s, ox: f.x - c.x * f.s, oy: f.y - c.y * f.s }
}

/** Visible box of a boxes-only page in base space. */
export function boxesRegion(page: PageModel): Rect {
  const f = effectiveFrame(page)
  const c = effectiveCrop(page)
  return { x: c.x - f.x, y: c.y - f.y, w: f.w, h: f.h }
}
