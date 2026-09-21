'use client'

import { memo, useEffect, useRef } from 'react'
import { displaySize, effectiveFrame } from '@/lib/geometry'
import { renderThumbnail } from '@/services/pdf/renderer'
import type { PageModel } from '@/types'
import { PageSurface } from './PageSurface'

/** Small live thumbnail honouring rotation, crop and page frame. Rendered lazily through the shared queue. */
export const PdfThumbnail = memo(function PdfThumbnail({ page, boxW, boxH, priority = 200 }: { page: PageModel; boxW: number; boxH: number; priority?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const d = displaySize(page)
  const zoom = Math.min(boxW / d.w, boxH / d.h)
  const f = effectiveFrame(page)
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1)
  const px = Math.max(40, Math.min(420, Math.round(page.width * zoom * f.s * dpr)))

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let cancelled = false
    const job = renderThumbnail(page, px, priority)
    job.promise
      .then((bmp) => {
        if (cancelled) return
        canvas.width = bmp.width
        canvas.height = bmp.height
        canvas.getContext('2d')?.drawImage(bmp, 0, 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      job.cancel()
    }
  }, [page.sourceId, page.sourceIndex, page.width, page.height, px, priority, page])

  return (
    <PageSurface
      page={page}
      zoom={zoom}
      content={<canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden />}
      className="mx-auto"
    />
  )
})
