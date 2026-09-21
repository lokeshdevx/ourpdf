import { describe, expect, it } from 'vitest'
import { addMargins, alignFrame, applyCrop, cropByMargins, placementFor, resizeFrame, usesBoxesOnly } from '@/lib/frame'
import { baseRectToPdf, baseToPdf, baseVecToPdf, displayToBase, baseToDisplay, displaySize, normRotation, objectMatrix, rotatedBounds, unionRects } from '@/lib/geometry'
import { pageModel } from '../helpers'

describe('base ↔ PDF coordinate mapping', () => {
  const view: [number, number, number, number] = [0, 0, 612, 792]
  it('maps the corners for every intrinsic rotation', () => {
    // Unrotated: top-left of the view is the PDF top-left (0, 792)
    expect(baseToPdf({ intrinsic: 0, view, s: 1, ox: 0, oy: 0 }, 0, 0)).toEqual([0, 792])
    expect(baseToPdf({ intrinsic: 0, view, s: 1, ox: 0, oy: 0 }, 100, 50)).toEqual([100, 742])
    // /Rotate 90 (page shown rotated clockwise): view top-left = PDF bottom-left
    expect(baseToPdf({ intrinsic: 90, view, s: 1, ox: 0, oy: 0 }, 0, 0)).toEqual([0, 0])
    expect(baseToPdf({ intrinsic: 90, view, s: 1, ox: 0, oy: 0 }, 792, 0)).toEqual([0, 792])
    expect(baseToPdf({ intrinsic: 90, view, s: 1, ox: 0, oy: 0 }, 0, 612)).toEqual([612, 0])
    // 180
    expect(baseToPdf({ intrinsic: 180, view, s: 1, ox: 0, oy: 0 }, 0, 0)).toEqual([612, 0])
    // 270
    expect(baseToPdf({ intrinsic: 270, view, s: 1, ox: 0, oy: 0 }, 0, 0)).toEqual([612, 792])
  })
  it('respects a view box with a non-zero origin', () => {
    expect(baseToPdf({ intrinsic: 0, view: [50, 100, 250, 400], s: 1, ox: 0, oy: 0 }, 0, 0)).toEqual([50, 400])
  })
  it('scales and offsets for framed pages', () => {
    expect(baseToPdf({ intrinsic: 0, view: [0, 0, 300, 400], s: 0.5, ox: 10, oy: 20 }, 100, 100)).toEqual([60, 400 - 70])
    expect(baseVecToPdf({ intrinsic: 0, view, s: 2, ox: 0, oy: 0 }, 1, 1)).toEqual([2, -2])
  })
  it('an axis-aligned rect stays a positive-size rect', () => {
    const r = baseRectToPdf({ intrinsic: 90, view, s: 1, ox: 0, oy: 0 }, { x: 10, y: 20, w: 100, h: 50 })
    expect(r.w).toBeCloseTo(50)
    expect(r.h).toBeCloseTo(100)
  })
  it('objectMatrix places the local origin at the object centre and rotates clockwise on screen', () => {
    const pl = { intrinsic: 0 as const, view, s: 1, ox: 0, oy: 0 }
    const m = objectMatrix(pl, { x: 100, y: 100, w: 40, h: 20 }, 0)
    ;[1, 0, 0, 1, 120, 792 - 110].forEach((v, i) => expect(m[i]).toBeCloseTo(v))
    // rotate 90° clockwise (screen): local +x axis points down on screen ⇒ negative y in PDF space
    const r = objectMatrix(pl, { x: 100, y: 100, w: 40, h: 20 }, 90)
    expect(r[0]).toBeCloseTo(0)
    expect(r[1]).toBeCloseTo(-1)
  })
})

describe('page display geometry', () => {
  const page = pageModel(null, 0, { width: 200, height: 100, view: [0, 0, 200, 100] })
  it('rotation swaps display size', () => {
    expect(displaySize({ ...page, rotation: 90 })).toEqual({ w: 100, h: 200 })
    expect(displaySize({ ...page, rotation: 180 })).toEqual({ w: 200, h: 100 })
  })
  it('display ↔ base round-trips for all rotations, crops and frames', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const p of [{ ...page, rotation }, { ...page, rotation, crop: { x: 20, y: 10, w: 100, h: 60 } }, { ...page, rotation, frame: { w: 300, h: 250, x: 30, y: 40, s: 0.75 } }]) {
        const d = baseToDisplay(p, 57, 33)
        const b = displayToBase(p, d[0], d[1])
        expect(b[0]).toBeCloseTo(57)
        expect(b[1]).toBeCloseTo(33)
      }
    }
  })
  it('normRotation snaps to multiples of 90', () => {
    expect(normRotation(-90)).toBe(270)
    expect(normRotation(450)).toBe(90)
    expect(normRotation(89)).toBe(90)
  })
  it('rotatedBounds and unionRects', () => {
    const b = rotatedBounds({ x: 0, y: 0, w: 100, h: 50 }, 90)
    expect(b.w).toBeCloseTo(50)
    expect(b.h).toBeCloseTo(100)
    expect(unionRects([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }])).toEqual({ x: 0, y: 0, w: 30, h: 15 })
  })
})

describe('frames: crop, margins, resize, align', () => {
  const page = pageModel(null, 0, { width: 600, height: 800, view: [0, 0, 600, 800] })
  it('crop sets the crop region and page size, and resets any frame', () => {
    const c = applyCrop({ ...page, frame: { w: 1, h: 1, x: 0, y: 0, s: 1 } }, { x: 50, y: 60, w: 300, h: 400 })
    expect(c.crop).toEqual({ x: 50, y: 60, w: 300, h: 400 })
    expect(c.frame).toBeNull()
    expect(usesBoxesOnly({ ...page, ...c })).toBe(true)
  })
  it('cropByMargins insets the visible area', () => {
    const c = cropByMargins(page, { top: 10, right: 20, bottom: 30, left: 40 })
    expect(c.crop).toEqual({ x: 40, y: 10, w: 540, h: 760 })
  })
  it('margins grow the frame around the content (box-only)', () => {
    const f = addMargins(page, { top: 10, right: 20, bottom: 30, left: 40 })
    expect(f).toEqual({ w: 660, h: 840, x: 40, y: 10, s: 1 })
    expect(usesBoxesOnly({ ...page, frame: f })).toBe(true)
  })
  it('scaled resize needs page embedding, not just boxes', () => {
    const f = resizeFrame(page, 300, 400, { fit: true, align: 'center' })
    expect(f.s).toBeCloseTo(0.5)
    expect(f.w).toBe(300)
    expect(usesBoxesOnly({ ...page, frame: f })).toBe(false)
  })
  it('fit + centre keeps the aspect ratio', () => {
    const f = resizeFrame(page, 1000, 800, { fit: true, align: 'center' })
    expect(f.s).toBeCloseTo(1) // limited by height
    expect(f.x).toBeCloseTo(200)
    expect(f.y).toBeCloseTo(0)
  })
  it('alignFrame moves content inside the same size', () => {
    const f = alignFrame({ ...page, frame: { w: 700, h: 900, x: 0, y: 0, s: 1 } }, 'bottom-right')
    expect(f.x).toBeCloseTo(100)
    expect(f.y).toBeCloseTo(100)
  })
  it('placement of a boxes-only page equals the source placement; embed pages use the frame', () => {
    expect(placementFor(page)).toMatchObject({ s: 1, ox: 0, oy: 0 })
    const scaled = { ...page, frame: { w: 300, h: 400, x: 0, y: 0, s: 0.5 } }
    expect(placementFor(scaled)).toMatchObject({ s: 0.5, view: [0, 0, 300, 400] })
  })
})
