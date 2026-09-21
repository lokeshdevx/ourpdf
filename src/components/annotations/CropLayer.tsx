'use client'

import { useState } from 'react'
import { effectiveCrop, normRect } from '@/lib/geometry'
import { useUiStore } from '@/stores/ui-store'
import type { PageModel, Pt, Rect } from '@/types'
import { HANDLES, resizeBox, type HandleId } from './geometry-utils'

interface Props {
  page: PageModel
  zoom: number
  toBase: (cx: number, cy: number) => Pt
}

/** Visual crop tool: drag a rectangle (or adjust its handles); "Apply crop" lives in the ribbon. */
export function CropLayer({ page, zoom, toBase }: Props) {
  const draft = useUiStore((s) => s.cropDraft)
  const mine = draft?.pageId === page.id ? draft.rect : null
  const [start, setStart] = useState<Pt | null>(null)
  const bounds = effectiveCrop(page)
  const set = (rect: Rect | null) => useUiStore.getState().set({ cropDraft: rect ? { pageId: page.id, rect } : null })
  const clampRect = (r: Rect): Rect => {
    const x = Math.max(bounds.x, Math.min(r.x, bounds.x + bounds.w - 8))
    const y = Math.max(bounds.y, Math.min(r.y, bounds.y + bounds.h - 8))
    return { x, y, w: Math.max(8, Math.min(r.w, bounds.x + bounds.w - x)), h: Math.max(8, Math.min(r.h, bounds.y + bounds.h - y)) }
  }

  const startHandle = (e: React.PointerEvent, h: HandleId) => {
    if (!mine) return
    e.stopPropagation()
    const orig = { ...mine, rotation: 0 }
    const move = (ev: PointerEvent) => set(clampRect(resizeBox(orig, h, toBase(ev.clientX, ev.clientY), false, 8)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startMove = (e: React.PointerEvent) => {
    if (!mine) return
    e.stopPropagation()
    const s = toBase(e.clientX, e.clientY)
    const orig = mine
    const move = (ev: PointerEvent) => {
      const p = toBase(ev.clientX, ev.clientY)
      const nx = Math.min(Math.max(bounds.x, orig.x + p[0] - s[0]), bounds.x + bounds.w - orig.w)
      const ny = Math.min(Math.max(bounds.y, orig.y + p[1] - s[1]), bounds.y + bounds.h - orig.h)
      set({ ...orig, x: nx, y: ny })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <>
      <div
        data-testid="crop-layer"
        style={{ position: 'absolute', inset: -20000, cursor: 'crosshair', touchAction: 'none', pointerEvents: 'auto' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          setStart(toBase(e.clientX, e.clientY))
        }}
        onPointerMove={(e) => {
          if (!start) return
          const p = toBase(e.clientX, e.clientY)
          set(clampRect(normRect(start[0], start[1], p[0], p[1])))
        }}
        onPointerUp={() => setStart(null)}
      />
      {mine && (
        <>
          {/* dim outside */}
          {[
            { left: bounds.x, top: bounds.y, width: bounds.w, height: mine.y - bounds.y },
            { left: bounds.x, top: mine.y + mine.h, width: bounds.w, height: bounds.y + bounds.h - (mine.y + mine.h) },
            { left: bounds.x, top: mine.y, width: mine.x - bounds.x, height: mine.h },
            { left: mine.x + mine.w, top: mine.y, width: bounds.x + bounds.w - (mine.x + mine.w), height: mine.h },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', ...s, background: 'rgb(0 0 0 / 0.45)', pointerEvents: 'none' }} />
          ))}
          <div style={{ position: 'absolute', left: mine.x, top: mine.y, width: mine.w, height: mine.h, outline: `${1.5 / zoom}px solid var(--primary)`, cursor: 'move', pointerEvents: 'auto' }} onPointerDown={startMove} data-testid="crop-rect">
            {HANDLES.map((h) => (
              <div key={h.id} className="sel-handle" style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, cursor: h.cursor, ['--k' as string]: zoom * (page.frame?.s ?? 1) }} onPointerDown={(e) => startHandle(e, h.id)} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
