import type { FitMode, ScrollDir, ViewMode } from '@/types'

export interface LayoutInput {
  /** Display size of each page in points (after rotation/frame). */
  sizes: { w: number; h: number }[]
  zoom: number
  mode: ViewMode
  dir: ScrollDir
  /** Gap between pages/rows in px. */
  gap: number
  /** Padding around content in px. */
  pad: number
  viewportW: number
  viewportH: number
  /** Current page (only that page is laid out in single mode). */
  current: number
}
export interface Slot {
  index: number
  x: number
  y: number
  w: number
  h: number
}
export interface Row {
  first: number
  last: number
  /** Start offset along the scroll axis and extent. */
  pos: number
  size: number
}
export interface Layout {
  slots: Slot[]
  rows: Row[]
  width: number
  height: number
  slotByIndex: Map<number, Slot>
}

/** Groups page indices into rows for the given mode. */
export function buildRows(count: number, mode: ViewMode, current: number): number[][] {
  if (count === 0) return []
  if (mode === 'single') return [[Math.min(Math.max(0, current), count - 1)]]
  if (mode === 'continuous') return Array.from({ length: count }, (_, i) => [i])
  const rows: number[][] = []
  let i = 0
  if (mode === 'two-cover') {
    rows.push([0])
    i = 1
  }
  for (; i < count; i += 2) rows.push(i + 1 < count ? [i, i + 1] : [i])
  return rows
}

export function computeLayout(inp: LayoutInput): Layout {
  const { sizes, zoom, mode, dir, gap, pad, viewportW, viewportH } = inp
  const rowsIdx = buildRows(sizes.length, mode, inp.current)
  const slots: Slot[] = []
  const rows: Row[] = []
  const slotByIndex = new Map<number, Slot>()
  const vertical = dir === 'vertical'

  // Row geometry (main axis = scroll axis).
  const geo = rowsIdx.map((row) => {
    const dims = row.map((i) => ({ w: sizes[i].w * zoom, h: sizes[i].h * zoom }))
    const cross = vertical
      ? dims.reduce((s, d, k) => s + d.w + (k ? gap : 0), 0)
      : dims.reduce((s, d, k) => s + d.h + (k ? gap : 0), 0)
    const main = vertical ? Math.max(...dims.map((d) => d.h)) : Math.max(...dims.map((d) => d.w))
    return { row, dims, cross, main }
  })
  const maxCross = Math.max(0, ...geo.map((g) => g.cross))
  const crossExtent = Math.max(maxCross + 2 * pad, vertical ? viewportW : viewportH)
  let pos = pad
  for (const g of geo) {
    const rowIdx0 = slots.length
    let crossPos = (crossExtent - g.cross) / 2
    for (let k = 0; k < g.row.length; k++) {
      const d = g.dims[k]
      const mainOffset = (g.main - (vertical ? d.h : d.w)) / 2
      const slot: Slot = vertical
        ? { index: g.row[k], x: crossPos, y: pos + mainOffset, w: d.w, h: d.h }
        : { index: g.row[k], x: pos + mainOffset, y: crossPos, w: d.w, h: d.h }
      crossPos += (vertical ? d.w : d.h) + gap
      slots.push(slot)
      slotByIndex.set(slot.index, slot)
    }
    rows.push({ first: rowIdx0, last: slots.length - 1, pos, size: g.main })
    pos += g.main + gap
  }
  const mainExtent = Math.max(0, pos - gap + pad)
  return {
    slots,
    rows,
    slotByIndex,
    width: vertical ? crossExtent : mainExtent,
    height: vertical ? mainExtent : crossExtent,
  }
}

/** Slots whose row intersects [scroll - overscan, scroll + viewport + overscan]. Uses binary search over rows. */
export function visibleSlots(layout: Layout, scroll: number, viewport: number, overscan: number): Slot[] {
  const { rows, slots } = layout
  if (!rows.length) return []
  const lo = scroll - overscan
  const hi = scroll + viewport + overscan
  let a = 0
  let b = rows.length - 1
  while (a < b) {
    const mid = (a + b) >> 1
    if (rows[mid].pos + rows[mid].size < lo) a = mid + 1
    else b = mid
  }
  const out: Slot[] = []
  for (let r = a; r < rows.length && rows[r].pos <= hi; r++) {
    for (let s = rows[r].first; s <= rows[r].last; s++) out.push(slots[s])
  }
  return out
}

/** The page the user is "on": first row whose extent contains a point 30% into the viewport. */
export function pageAtScroll(layout: Layout, scroll: number, viewport: number): number {
  const { rows, slots } = layout
  if (!rows.length) return 0
  const probe = scroll + viewport * 0.3
  let a = 0
  let b = rows.length - 1
  while (a < b) {
    const mid = (a + b + 1) >> 1
    if (rows[mid].pos <= probe) a = mid
    else b = mid - 1
  }
  return slots[rows[a].first].index
}

/** Scroll offset (main axis) that puts page `index` at the top of the viewport. */
export function scrollOffsetForPage(layout: Layout, index: number, pad = 0): number {
  const slot = layout.slotByIndex.get(index)
  if (!slot) return 0
  return Math.max(0, (layout.rows.find((r) => index >= layout.slots[r.first].index && index <= layout.slots[r.last].index)?.pos ?? 0) - pad)
}

export interface FitInput {
  sizes: { w: number; h: number }[]
  mode: ViewMode
  dir: ScrollDir
  viewportW: number
  viewportH: number
  pad: number
  gap: number
  current: number
}

/** Zoom factor for a fit mode. */
export function fitZoom(fit: FitMode, inp: FitInput): number {
  if (fit === 'custom' || !inp.sizes.length) return 1
  const rows = buildRows(inp.sizes.length, inp.mode === 'single' ? 'single' : inp.mode, inp.current)
  const cols = Math.max(...rows.map((r) => r.length))
  let maxRowW = 0
  let maxH = 0
  for (const r of rows) {
    maxRowW = Math.max(maxRowW, r.reduce((s, i) => s + inp.sizes[i].w, 0))
    maxH = Math.max(maxH, ...r.map((i) => inp.sizes[i].h))
  }
  const availW = Math.max(50, inp.viewportW - 2 * inp.pad - (cols - 1) * inp.gap)
  const availH = Math.max(50, inp.viewportH - 2 * inp.pad)
  const zw = availW / maxRowW
  const zh = availH / maxH
  const z = fit === 'width' ? zw : fit === 'height' ? zh : Math.min(zw, zh)
  return Math.min(8, Math.max(0.1, z))
}
