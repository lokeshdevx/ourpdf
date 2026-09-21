import { describe, expect, it } from 'vitest'
import { buildRows, computeLayout, fitZoom, pageAtScroll, scrollOffsetForPage, visibleSlots } from '@/lib/layout-engine'

const sizes = (n: number) => Array.from({ length: n }, () => ({ w: 600, h: 800 }))
const base = { zoom: 1, mode: 'continuous' as const, dir: 'vertical' as const, gap: 10, pad: 20, viewportW: 1000, viewportH: 700, current: 0 }

describe('layout engine', () => {
  it('builds rows for each view mode', () => {
    expect(buildRows(5, 'continuous', 0)).toEqual([[0], [1], [2], [3], [4]])
    expect(buildRows(5, 'two', 0)).toEqual([[0, 1], [2, 3], [4]])
    expect(buildRows(5, 'two-cover', 0)).toEqual([[0], [1, 2], [3, 4]])
    expect(buildRows(5, 'single', 3)).toEqual([[3]])
    expect(buildRows(0, 'two', 0)).toEqual([])
  })
  it('stacks pages vertically and centres them', () => {
    const l = computeLayout({ ...base, sizes: sizes(3) })
    expect(l.slots).toHaveLength(3)
    expect(l.slots[0]).toMatchObject({ index: 0, y: 20, w: 600, h: 800 })
    expect(l.slots[1].y).toBe(20 + 800 + 10)
    expect(l.slots[0].x).toBe(200) // (1000-600)/2
    expect(l.height).toBe(20 + 3 * 800 + 2 * 10 + 20)
  })
  it('places two pages side by side', () => {
    const l = computeLayout({ ...base, mode: 'two', sizes: sizes(4) })
    expect(l.rows).toHaveLength(2)
    expect(l.slots[0].y).toBe(l.slots[1].y)
    expect(l.slots[1].x).toBeGreaterThan(l.slots[0].x + 599)
  })
  it('lays out horizontally', () => {
    const l = computeLayout({ ...base, dir: 'horizontal', sizes: sizes(3) })
    expect(l.slots[0].x).toBe(20)
    expect(l.slots[1].x).toBe(20 + 600 + 10)
    expect(l.width).toBeGreaterThan(l.height)
  })
  it('scales with zoom', () => {
    const l = computeLayout({ ...base, zoom: 0.5, sizes: sizes(2) })
    expect(l.slots[0]).toMatchObject({ w: 300, h: 400 })
  })
  it('only returns visible slots (virtualisation) even for 500 pages', () => {
    const l = computeLayout({ ...base, sizes: sizes(500) })
    const vis = visibleSlots(l, 0, 700, 700)
    expect(vis.length).toBeLessThanOrEqual(4)
    expect(vis[0].index).toBe(0)
    const mid = visibleSlots(l, 250 * 810, 700, 0)
    expect(mid.map((s) => s.index)).toContain(250)
    expect(mid.length).toBeLessThan(4)
    const end = visibleSlots(l, l.height - 700, 700, 100)
    expect(end[end.length - 1].index).toBe(499)
  })
  it('finds the current page from the scroll offset and scrolls to a page', () => {
    const l = computeLayout({ ...base, sizes: sizes(10) })
    expect(pageAtScroll(l, 0, 700)).toBe(0)
    expect(pageAtScroll(l, 810 * 4, 700)).toBe(4)
    expect(scrollOffsetForPage(l, 5)).toBe(l.slotByIndex.get(5)!.y)
  })
  it('computes fit zoom for width / page / height', () => {
    const inp = { sizes: sizes(3), mode: 'continuous' as const, dir: 'vertical' as const, viewportW: 1000, viewportH: 600, pad: 20, gap: 10, current: 0 }
    expect(fitZoom('width', inp)).toBeCloseTo((1000 - 40) / 600)
    expect(fitZoom('height', inp)).toBeCloseTo((600 - 40) / 800)
    expect(fitZoom('page', inp)).toBeCloseTo(Math.min((1000 - 40) / 600, (600 - 40) / 800))
    expect(fitZoom('custom', inp)).toBe(1)
    // two-page mode fits both pages across the width
    expect(fitZoom('width', { ...inp, mode: 'two' })).toBeCloseTo((1000 - 40 - 10) / 1200)
  })
})
