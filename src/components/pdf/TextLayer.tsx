'use client'

import { useEffect, useRef } from 'react'
import { loadPdfjs } from '@/services/pdf/pdfjs'
import { getSource } from '@/services/pdf/sources'
import type { PageModel } from '@/types'

/**
 * Transparent, selectable text over the canvas (PDF.js TextLayer) rendered once at base scale;
 * the parent scales it with CSS so zooming never re-lays it out.
 */
export function TextLayer({ page, active }: { page: PageModel; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !page.sourceId) return
    let cancelled = false
    let layer: { cancel: () => void } | null = null
    const w = window as Window & typeof globalThis
    const idle = (cb: () => void): number => (typeof w.requestIdleCallback === 'function' ? w.requestIdleCallback(cb, { timeout: 600 }) : w.setTimeout(cb, 60))
    const handle = idle(async () => {
      try {
        const src = getSource(page.sourceId!)
        if (!src || cancelled) return
        const pdfjs = await loadPdfjs()
        const pdfPage = await src.proxy.getPage(page.sourceIndex + 1)
        if (cancelled) return
        const viewport = pdfPage.getViewport({ scale: 1 })
        el.replaceChildren()
        const tl = new pdfjs.TextLayer({ textContentSource: pdfPage.streamTextContent(), container: el, viewport })
        layer = tl
        await tl.render()
      } catch {
        /* cancelled or page unavailable */
      }
    })
    return () => {
      cancelled = true
      layer?.cancel()
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(handle)
      else clearTimeout(handle)
    }
  }, [page.sourceId, page.sourceIndex])

  return <div ref={ref} className={`pdf-text-layer ${active ? '' : 'no-select'}`} style={{ width: page.width, height: page.height }} aria-hidden={!active} />
}
