'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { displaySize } from '@/lib/geometry'
import { computeLayout, fitZoom, pageAtScroll, scrollOffsetForPage, visibleSlots } from '@/lib/layout-engine'
import { clamp } from '@/utils/format'
import { useRenderSettings } from '@/hooks/use-render-settings'
import { viewerBus } from '@/services/viewer-bus'
import { usePageStore, useActivePages, useCurrentPageIndex } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import { PdfPage } from './PdfPage'

const GAP = 14
const getCurrentPageIdx = (docId: string | null) => (docId ? (usePageStore.getState().byDoc[docId]?.current ?? 0) : 0)
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

/** Virtualised, multi-mode page viewer. Only pages near the viewport are mounted/rendered. */
export function PdfViewer() {
  const docId = usePdfStore((s) => s.activeId)
  const pages = useActivePages()
  const current = useCurrentPageIndex()
  const viewMode = useUiStore((s) => s.viewMode)
  const dir = useUiStore((s) => s.scrollDir)
  const zoom = useUiStore((s) => s.zoom)
  const fit = useUiStore((s) => s.fit)
  const lowMemory = useUiStore((s) => s.lowMemory)
  const panning = useUiStore((s) => s.panning)
  const isMobile = useUiStore((s) => s.isMobile)
  const tool = useToolStore((s) => s.tool)
  const settings = useRenderSettings()

  const ref = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: 0, h: 0 })
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const lockRef = useRef<number>(0) // suppress current-page sync right after programmatic navigation
  const pad = isMobile ? 10 : 28
  const vertical = dir === 'vertical'

  const sizes = useMemo(() => pages.map((p) => displaySize(p)), [pages])

  /* viewport size */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setVp({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [docId])

  /* fit modes derive zoom */
  const fitInput = useMemo(
    () => ({ sizes, mode: viewMode, dir, viewportW: vp.w - (vertical ? 12 : 0), viewportH: vp.h, pad, gap: GAP, current }),
    [sizes, viewMode, dir, vp.w, vp.h, pad, current, vertical],
  )
  useEffect(() => {
    if (fit === 'custom' || !vp.w || !sizes.length) return
    const z = fitZoom(fit, fitInput)
    if (Math.abs(z - useUiStore.getState().zoom) > 0.002) useUiStore.getState().set({ zoom: z })
  }, [fit, fitInput, vp.w, sizes.length])

  const layout = useMemo(
    () => computeLayout({ sizes, zoom, mode: viewMode, dir, gap: GAP, pad, viewportW: vp.w, viewportH: vp.h, current }),
    [sizes, zoom, viewMode, dir, pad, vp.w, vp.h, current],
  )

  /* scroll tracking (rAF-throttled) */
  const raf = useRef(0)
  const onScroll = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const el = ref.current
      if (el) setScroll((s) => (s.x === el.scrollLeft && s.y === el.scrollTop ? s : { x: el.scrollLeft, y: el.scrollTop }))
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const mainScroll = vertical ? scroll.y : scroll.x
  const mainVp = vertical ? vp.h : vp.w
  const overscan = mainVp * (lowMemory ? 0.4 : 1)
  const visible = useMemo(() => visibleSlots(layout, mainScroll, mainVp, overscan), [layout, mainScroll, mainVp, overscan])

  /* current page follows scrolling in continuous mode */
  useEffect(() => {
    if (!docId || viewMode !== 'continuous' || !layout.rows.length) return
    if (Date.now() < lockRef.current) return
    const idx = pageAtScroll(layout, mainScroll, mainVp)
    usePageStore.getState().setCurrent(docId, idx)
  }, [docId, layout, mainScroll, mainVp, viewMode])

  const layoutRef = useRef(layout)
  useLayoutEffect(() => {
    layoutRef.current = layout
  })

  /* keep the view anchored when zoom changes: centre for manual zoom, current page for fit modes */
  const prevZoom = useRef(zoom)
  useLayoutEffect(() => {
    const el = ref.current
    const prev = prevZoom.current
    prevZoom.current = zoom
    if (!el || prev === zoom || !prev) return
    if (fit === 'custom') {
      const r = zoom / prev
      el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * r - el.clientWidth / 2
      el.scrollTop = (el.scrollTop + el.clientHeight / 2) * r - el.clientHeight / 2
    } else if (viewMode === 'continuous') {
      const off = scrollOffsetForPage(layoutRef.current, getCurrentPageIdx(docId), 0)
      if (vertical) el.scrollTop = off
      else el.scrollLeft = off
    } else {
      el.scrollTop = 0
      el.scrollLeft = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  /* navigation commands */
  useEffect(() => {
    return viewerBus.on((cmd) => {
      const el = ref.current
      if (!el || !docId) return
      if (cmd.type === 'zoom-by') {
        useUiStore.getState().set({ fit: 'custom', zoom: clamp(useUiStore.getState().zoom * cmd.factor, MIN_ZOOM, MAX_ZOOM) })
        return
      }
      const count = usePageStore.getState().byDoc[docId]?.pages.length ?? 0
      const index = clamp(cmd.index, 0, Math.max(0, count - 1))
      lockRef.current = Date.now() + 350
      usePageStore.getState().setCurrent(docId, index)
      requestAnimationFrame(() => {
        const l = layoutRef.current
        const slot = l.slotByIndex.get(index)
        if (!slot) return
        if (cmd.type === 'reveal') {
          const z = useUiStore.getState().zoom
          const top = slot.y + cmd.rect.y * z - el.clientHeight / 3
          const left = slot.x + cmd.rect.x * z - el.clientWidth / 3
          el.scrollTo({ top: Math.max(0, top), left: Math.max(0, left) })
        } else if (viewMode === 'continuous') {
          const off = scrollOffsetForPage(l, index, 0)
          if (vertical) el.scrollTo({ top: off, left: el.scrollLeft })
          else el.scrollTo({ left: off, top: el.scrollTop })
        } else {
          el.scrollTo({ top: 0, left: 0 })
        }
      })
    })
  }, [docId, viewMode, vertical])

  /* ctrl+wheel zoom, pinch, hand/space panning */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const f = Math.exp(-e.deltaY * 0.0022)
      const ui = useUiStore.getState()
      ui.set({ fit: 'custom', zoom: clamp(ui.zoom * f, MIN_ZOOM, MAX_ZOOM) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [docId])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const pts = new Map<number, { x: number; y: number }>()
    let startDist = 0
    let startZoom = 1
    let drag: { x: number; y: number; sl: number; st: number } | null = null
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        startDist = Math.hypot(a.x - b.x, a.y - b.y)
        startZoom = useUiStore.getState().zoom
        drag = null
        return
      }
      const ui = useUiStore.getState()
      const hand = useToolStore.getState().tool === 'hand' || ui.panning
      if (hand && e.button === 0) {
        drag = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
        el.setPointerCapture(e.pointerId)
        el.style.cursor = 'grabbing'
      }
    }
    const move = (e: PointerEvent) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2 && startDist) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        useUiStore.getState().set({ fit: 'custom', zoom: clamp(startZoom * (d / startDist), MIN_ZOOM, MAX_ZOOM) })
        return
      }
      if (drag) {
        el.scrollLeft = drag.sl - (e.clientX - drag.x)
        el.scrollTop = drag.st - (e.clientY - drag.y)
      }
    }
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      if (pts.size < 2) startDist = 0
      if (drag) {
        drag = null
        el.style.cursor = ''
      }
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [docId])

  const textActive = tool === 'select' || tool === 'highlight' || tool === 'underline' || tool === 'strike' || tool === 'squiggly'
  const centerMain = mainScroll + mainVp / 2
  const cursor = tool === 'hand' || panning ? 'grab' : undefined

  if (!pages.length) return null
  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="editor-canvas-bg scroll-thin relative h-full w-full overflow-auto outline-none"
      style={{ touchAction: 'pan-x pan-y', cursor, overscrollBehavior: 'contain' }}
      tabIndex={0}
      role="document"
      aria-label="PDF document"
      data-testid="pdf-viewer"
      data-zoom={zoom.toFixed(3)}
    >
      <div style={{ position: 'relative', width: layout.width, height: layout.height }} data-testid="pdf-content">
        {visible.map((slot) => {
          const page = pages[slot.index]
          if (!page) return null
          const c = vertical ? slot.y + slot.h / 2 : slot.x + slot.w / 2
          return <PdfPage key={page.id} page={page} index={slot.index} zoom={zoom} x={slot.x} y={slot.y} priority={Math.abs(c - centerMain)} settings={settings} textActive={textActive} />
        })}
      </div>
    </div>
  )
}
