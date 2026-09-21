'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { createMarkup } from '@/lib/object-factory'
import { normRect } from '@/lib/geometry'
import { addObjects } from '@/services/pdf/annotation-service'
import { useAnnotationStore } from '@/stores/annotation-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useToolStore } from '@/stores/tool-store'
import { DEFAULT_LAYER_ID, type MarkupKind, type PageModel, type Pt, type Rect } from '@/types'

interface Props {
  page: PageModel
  zoom: number
  toBase: (cx: number, cy: number) => Pt
  area: boolean
  outerRef: RefObject<HTMLDivElement | null>
}

const KIND: Record<string, MarkupKind> = { highlight: 'highlight', underline: 'underline', strike: 'strike', squiggly: 'squiggly' }

/**
 * Turns a text selection (or, in "area" mode, a dragged rectangle) into highlight / underline / strikeout /
 * squiggly markup on release.
 */
export function MarkupCapture({ page, zoom, toBase, area, outerRef }: Props) {
  const docId = usePdfStore((s) => s.activeId)!
  const tool = useToolStore((s) => s.tool)
  const layerId = useAnnotationStore((s) => s.byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID)
  const [drag, setDrag] = useState<{ a: Pt; b: Pt } | null>(null)
  const dragging = useRef(false)

  const color = () => {
    const o = useToolStore.getState().options
    return tool === 'highlight' ? o.highlightColor : tool === 'underline' ? o.underlineColor : o.strikeColor
  }

  useEffect(() => {
    if (area) return
    const onUp = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) return
      const outer = outerRef.current
      if (!outer || !sel.anchorNode || !outer.contains(sel.anchorNode)) return
      const range = sel.getRangeAt(0)
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1)
      if (!rects.length) return
      const out: Rect[] = []
      for (const r of rects) {
        const a = toBase(r.left, r.top)
        const b = toBase(r.right, r.bottom)
        const rr = normRect(a[0], a[1], b[0], b[1])
        // drop rects that are containers rather than text lines (much taller than typical text)
        if (rr.h > 60 || rr.w < 1) continue
        const prev = out[out.length - 1]
        if (prev && Math.abs(prev.y - rr.y) < 1 && Math.abs(prev.h - rr.h) < 1 && rr.x <= prev.x + prev.w + 1) {
          prev.w = Math.max(prev.w, rr.x + rr.w - prev.x)
        } else out.push(rr)
      }
      if (!out.length) return
      const m = createMarkup(page.id, layerId, KIND[tool], color(), out)
      addObjects(docId, [m], `Add ${tool}`)
      sel.removeAllRanges()
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, tool, page.id, docId, layerId, zoom])

  if (!area) return null
  const r = drag ? normRect(drag.a[0], drag.a[1], drag.b[0], drag.b[1]) : null
  return (
    <>
      <div
        data-testid="markup-area-layer"
        style={{ position: 'absolute', inset: -20000, cursor: 'crosshair', touchAction: 'none', pointerEvents: 'auto' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          const p = toBase(e.clientX, e.clientY)
          dragging.current = true
          setDrag({ a: p, b: p })
        }}
        onPointerMove={(e) => dragging.current && drag && setDrag({ ...drag, b: toBase(e.clientX, e.clientY) })}
        onPointerUp={(e) => {
          if (!dragging.current || !drag) return
          dragging.current = false
          const p = toBase(e.clientX, e.clientY)
          const rr = normRect(drag.a[0], drag.a[1], p[0], p[1])
          setDrag(null)
          if (rr.w * zoom < 4 || rr.h * zoom < 4) return
          addObjects(docId, [createMarkup(page.id, layerId, KIND[tool], color(), [rr])], `Add ${tool}`)
        }}
      />
      {r && <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, background: color(), opacity: 0.35, pointerEvents: 'none' }} />}
    </>
  )
}
