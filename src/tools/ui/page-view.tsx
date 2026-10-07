'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { closePdf, openPdfjs, renderPage } from '@/tools/lib/pdf'

export interface PageImage { url: string; w: number; h: number }

/** Renders every page once (visual orientation) to an image URL; sizes are in PDF points. */
export function usePageImages(bytes: Uint8Array | null, targetPx = 900, max = 300) {
  const [pages, setPages] = useState<PageImage[]>([])
  const [total, setTotal] = useState(0)
  useEffect(() => {
    if (!bytes) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the file is removed
      setPages([])
      return
    }
    let cancelled = false
    const made: string[] = []
    ;(async () => {
      const doc = await openPdfjs(bytes)
      if (cancelled) return
      setTotal(doc.numPages)
      const out: PageImage[] = []
      for (let i = 1; i <= Math.min(max, doc.numPages) && !cancelled; i++) {
        const page = await doc.getPage(i)
        const vp = page.getViewport({ scale: 1 })
        const c = await renderPage(page, targetPx / Math.max(vp.width, vp.height))
        const url = await new Promise<string>((r) => c.toBlob((b) => r(b ? URL.createObjectURL(b) : ''), 'image/jpeg', 0.82))
        made.push(url)
        out.push({ url, w: vp.width, h: vp.height })
        if (!cancelled && (i <= 4 || i % 4 === 0 || i === doc.numPages)) setPages([...out])
        page.cleanup()
      }
      if (!cancelled) setPages([...out])
      await closePdf(doc)
    })().catch(() => {})
    return () => {
      cancelled = true
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [bytes, targetPx, max])
  return { pages, total }
}

/**
 * A page shown at the container width with an overlay coordinate system in PDF points (top-left origin).
 * `onPointer` receives positions in points; children render absolutely positioned overlays (use `pct`).
 */
export function PageCanvas({ page, index, children, onPointerDown, onPointerMove, onPointerUp, cursor = 'default' }: {
  page: PageImage; index: number; children?: ReactNode; cursor?: string
  onPointerDown?: (pt: { x: number; y: number }, e: React.PointerEvent) => void
  onPointerMove?: (pt: { x: number; y: number }, e: React.PointerEvent) => void
  onPointerUp?: (pt: { x: number; y: number }, e: React.PointerEvent) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const pt = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * page.w, y: ((e.clientY - r.top) / r.height) * page.h }
  }
  return (
    <figure className="space-y-1.5">
      <div ref={box} className="relative touch-none select-none overflow-hidden rounded-lg border bg-white shadow-sm" style={{ aspectRatio: `${page.w} / ${page.h}`, cursor, containerType: 'inline-size' }}
        onPointerDown={onPointerDown && ((e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.bg) { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); onPointerDown(pt(e), e) } })}
        onPointerMove={onPointerMove && ((e) => onPointerMove(pt(e), e))}
        onPointerUp={onPointerUp && ((e) => onPointerUp(pt(e), e))}>
        { }
        <img src={page.url} alt={`Page ${index + 1}`} data-bg="1" draggable={false} className="absolute inset-0 size-full" />
        {children}
      </div>
      <figcaption className="text-center text-xs text-muted-foreground">Page {index + 1}</figcaption>
    </figure>
  )
}

/** Percent-based absolute style for a rectangle in points on a page. */
export const pct = (page: PageImage, r: { x: number; y: number; w: number; h: number }) => ({ left: `${(r.x / page.w) * 100}%`, top: `${(r.y / page.h) * 100}%`, width: `${(r.w / page.w) * 100}%`, height: `${(r.h / page.h) * 100}%` })
