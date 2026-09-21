'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { effectiveFrame } from '@/lib/geometry'
import { computeRenderScale, renderPage, type RenderSettings } from '@/services/pdf/renderer'
import { useUiStore } from '@/stores/ui-store'
import type { PageModel } from '@/types'
import { PageSurface, surfaceGeometry } from './PageSurface'
import { TextLayer } from './TextLayer'
import { PageOverlay } from '@/components/annotations/PageOverlay'

interface Props {
  page: PageModel
  index: number
  zoom: number
  x: number
  y: number
  priority: number
  settings: RenderSettings
  textActive: boolean
}

/** One rendered page: canvas (rendered lazily, cancellable), text layer, and the edit-object overlay. */
export const PdfPage = memo(function PdfPage({ page, index, zoom, x, y, priority, settings, textActive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const epoch = useUiStore((s) => s.renderEpoch)
  const [error, setError] = useState<string | null>(null)
  const [painted, setPainted] = useState(false)
  const outerRef = useRef<HTMLDivElement>(null)
  const geo = surfaceGeometry(page, zoom)
  const f = effectiveFrame(page)
  const scale = computeRenderScale(page.width, page.height, zoom * f.s, settings)
  // Snap the scale so tiny zoom changes reuse the same render (and the bitmap cache).
  const snapped = Math.round(scale * 20) / 20 || scale

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let job: ReturnType<typeof renderPage> | null = null
    let cancelled = false
    // First paint immediately, later zoom changes are debounced (CSS stretches the previous bitmap meanwhile).
    const delay = painted ? 140 : 0
    const t = window.setTimeout(() => {
      job = renderPage(page, canvas, snapped, priority, epoch)
      job.promise
        .then(() => {
          if (!cancelled) {
            setPainted(true)
            setError(null)
          }
        })
        .catch((e: Error) => {
          if (e?.name !== 'AbortError' && !cancelled) setError(e?.message || 'Render failed')
        })
    }, delay)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      job?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.sourceId, page.sourceIndex, page.width, page.height, snapped, epoch])

  return (
    <div style={{ position: 'absolute', left: x, top: y, width: geo.width, height: geo.height }} data-testid="pdf-page" data-page-index={index}>
      <PageSurface
        page={page}
        zoom={zoom}
        dataPage={index}
        outerRef={outerRef}
        content={
          <>
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label={`Page ${index + 1}`} role="img" />
            {page.sourceId && <TextLayer page={page} active={textActive} />}
          </>
        }
        overlay={<PageOverlay page={page} index={index} zoom={zoom} outerRef={outerRef} />}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center text-sm text-destructive" role="alert">
          Unable to render page {index + 1}: {error}
        </div>
      )}
    </div>
  )
})
