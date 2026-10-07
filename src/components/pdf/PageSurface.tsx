'use client'

import type { CSSProperties, ReactNode, Ref } from 'react'
import { displaySize, effectiveCrop, effectiveFrame } from '@/lib/geometry'
import type { PageModel } from '@/types'

export interface SurfaceGeometry {
  /** Display size in CSS px. */
  width: number
  height: number
  /** CSS px per base-space point (zoom × frame scale). */
  k: number
}

export function surfaceGeometry(page: PageModel, zoom: number): SurfaceGeometry {
  const d = displaySize(page)
  const f = effectiveFrame(page)
  return { width: d.w * zoom, height: d.h * zoom, k: zoom * f.s }
}

/** CSS transform that rotates frame space into display space (origin top-left, px). */
function rotationTransform(rotation: number, fw: number, fh: number): string {
  switch (rotation) {
    case 90:
      return `translate(${fh}px, 0px) rotate(90deg)`
    case 180:
      return `translate(${fw}px, ${fh}px) rotate(180deg)`
    case 270:
      return `translate(0px, ${fw}px) rotate(270deg)`
    default:
      return 'none'
  }
}

interface Props {
  page: PageModel
  zoom: number
  /** Content clipped to the crop (canvas, text layer). Sized W×H points, scaled by k. */
  content: ReactNode
  /** Overlay (objects). Sized W×H points; children use point units. Not clipped by the crop, only by the frame. */
  overlay?: ReactNode
  className?: string
  style?: CSSProperties
  outerRef?: Ref<HTMLDivElement>
  paper?: boolean
  dataPage?: number
}

/**
 * Shared geometry wrapper for a page: frame (output page) → rotation → crop clip → base-space content.
 * Used by both the main viewer and thumbnails so they always agree.
 */
export function PageSurface({ page, zoom, content, overlay, className, style, outerRef, paper = true, dataPage }: Props) {
  const f = effectiveFrame(page)
  const c = effectiveCrop(page)
  const d = displaySize(page)
  const k = zoom * f.s
  const fw = f.w * zoom
  const fh = f.h * zoom
  // base-space origin position inside the frame (px)
  const ox = (f.x - c.x * f.s) * zoom
  const oy = (f.y - c.y * f.s) * zoom
  const baseStyle: CSSProperties = { position: 'absolute', left: 0, top: 0, width: page.width, height: page.height, transformOrigin: '0 0', transform: `translate(${ox}px, ${oy}px) scale(${k})` }
  return (
    <div
      ref={outerRef}
      data-page={dataPage}
      className={`${paper ? 'pdf-page-paper' : ''} relative overflow-clip ${className ?? ''}`}
      style={{ width: d.w * zoom, height: d.h * zoom, ...style }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: fw, height: fh, transformOrigin: '0 0', transform: rotationTransform(page.rotation, fw, fh) }}>
        {/* crop clip */}
        <div style={{ position: 'absolute', left: f.x * zoom, top: f.y * zoom, width: c.w * f.s * zoom, height: c.h * f.s * zoom, overflow: 'clip', background: '#fff' }}>
          <div style={{ ...baseStyle, left: -c.x * f.s * zoom, top: -c.y * f.s * zoom }}>{content}</div>
        </div>
        {overlay && <div className="obj-layer" style={{ ...baseStyle, ['--k' as string]: k }}>{overlay}</div>}
      </div>
    </div>
  )
}
