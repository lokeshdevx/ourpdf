import type { PDFPageProxy } from 'pdfjs-dist'
import type { OptionalContentConfig } from 'pdfjs-dist/types/src/display/optional_content_config'
import { LruCache } from '@/lib/lru'
import type { PageModel, RenderQuality } from '@/types'
import { loadPdfjs } from './pdfjs'
import { renderQueue } from './render-queue'
import { getSource } from './sources'

export const QUALITY_FACTOR: Record<RenderQuality, number> = { low: 0.75, standard: 1, high: 1.5, ultra: 2 }
/** Max canvas area in pixels (Safari/iOS limit is ~16.7M). */
export const MAX_CANVAS_PIXELS = 16_000_000
export const MAX_CANVAS_SIDE = 8192

export interface RenderSettings {
  quality: RenderQuality
  lowMemory: boolean
  dpr: number
}

/** Page bitmaps kept for quick re-display when scrolling back (budget shrinks in low-memory mode). */
const bitmapCache = new LruCache<string, ImageBitmap>(
  192 * 1024 * 1024,
  (b) => b.width * b.height * 4,
  (b) => b.close(),
)
const thumbCache = new LruCache<string, ImageBitmap>(
  48 * 1024 * 1024,
  (b) => b.width * b.height * 4,
  (b) => b.close(),
)

export function setLowMemory(low: boolean) {
  bitmapCache.setBudget(low ? 24 * 1024 * 1024 : 192 * 1024 * 1024)
  thumbCache.setBudget(low ? 12 * 1024 * 1024 : 48 * 1024 * 1024)
  renderQueue.setConcurrency(low ? 1 : 2)
  if (low) bitmapCache.clear()
}
export function clearRenderCaches(sourceId?: string) {
  if (!sourceId) {
    bitmapCache.clear()
    thumbCache.clear()
    return
  }
  bitmapCache.deleteWhere((k) => k.startsWith(sourceId + ':'))
  thumbCache.deleteWhere((k) => k.startsWith(sourceId + ':'))
}
export const cacheStats = () => ({ pages: bitmapCache.size, pageBytes: bitmapCache.usedBytes, thumbBytes: thumbCache.usedBytes })

/** Optional content (PDF "layers") configuration per source so visibility toggles apply to renders. */
const ocConfigs = new Map<string, Promise<OptionalContentConfig>>()
export function getOcConfig(sourceId: string): Promise<OptionalContentConfig> | undefined {
  const src = getSource(sourceId)
  if (!src) return undefined
  let p = ocConfigs.get(sourceId)
  if (!p) {
    p = src.proxy.getOptionalContentConfig()
    ocConfigs.set(sourceId, p)
  }
  return p
}
export function dropOcConfig(sourceId: string) {
  ocConfigs.delete(sourceId)
}

export function computeRenderScale(baseW: number, baseH: number, cssScale: number, s: RenderSettings): number {
  const dpr = s.lowMemory ? 1 : Math.min(s.dpr, 3)
  let scale = cssScale * dpr * QUALITY_FACTOR[s.quality]
  const w = baseW * scale
  const h = baseH * scale
  const area = w * h
  const limit = s.lowMemory ? MAX_CANVAS_PIXELS / 4 : MAX_CANVAS_PIXELS
  if (area > limit) scale *= Math.sqrt(limit / area)
  if (w > MAX_CANVAS_SIDE) scale *= MAX_CANVAS_SIDE / w
  if (h > MAX_CANVAS_SIDE) scale *= MAX_CANVAS_SIDE / h
  return Math.max(0.05, scale)
}

export interface PageRenderJob {
  promise: Promise<boolean>
  cancel: () => void
}

/**
 * Renders a page into `target` (resizing it). Resolves true when painted, false if it was served from a
 * cache that already matched. Rejects with an AbortError when cancelled.
 */
export function renderPage(
  page: Pick<PageModel, 'sourceId' | 'sourceIndex' | 'width' | 'height'>,
  target: HTMLCanvasElement,
  scale: number,
  priority: number,
  epoch = 0,
): PageRenderJob {
  const w = Math.max(1, Math.floor(page.width * scale))
  const h = Math.max(1, Math.floor(page.height * scale))
  const key = `${page.sourceId}:${page.sourceIndex}:${w}x${h}:${epoch}`

  const cached = bitmapCache.get(key)
  if (cached) {
    target.width = w
    target.height = h
    target.getContext('2d')?.drawImage(cached, 0, 0)
    return { promise: Promise.resolve(false), cancel: () => {} }
  }

  const job = renderQueue.enqueue<boolean>(priority, async (onCancel) => {
    if (!page.sourceId) {
      // Blank page: white paper.
      target.width = w
      target.height = h
      const ctx = target.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      return true
    }
    const src = getSource(page.sourceId)
    if (!src) throw new Error('Source not loaded')
    const pdfjs = await loadPdfjs()
    const pdfPage: PDFPageProxy = await src.proxy.getPage(page.sourceIndex + 1)
    const viewport = pdfPage.getViewport({ scale: w / page.width })
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.floor(viewport.width))
    off.height = Math.max(1, Math.floor(viewport.height))
    const task = pdfPage.render({
      canvas: off,
      viewport,
      background: '#ffffff',
      annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
      optionalContentConfigPromise: getOcConfig(page.sourceId),
    })
    onCancel(() => task.cancel())
    try {
      await task.promise
    } catch (e) {
      off.width = off.height = 0
      if ((e as Error)?.name === 'RenderingCancelledException') throw new DOMException('Render cancelled', 'AbortError')
      throw e
    }
    target.width = off.width
    target.height = off.height
    target.getContext('2d')?.drawImage(off, 0, 0)
    // Keep a bitmap for quick return visits (skipped for huge canvases).
    if (off.width * off.height <= 6_000_000) {
      createImageBitmap(off).then((b) => bitmapCache.set(key, b)).catch(() => {})
    }
    off.width = off.height = 0
    pdfPage.cleanup()
    return true
  })
  return job
}

/** Renders a small thumbnail bitmap. Cached; returns a fresh reference that the caller must not close. */
export function renderThumbnail(
  page: Pick<PageModel, 'sourceId' | 'sourceIndex' | 'width' | 'height'>,
  targetWidth: number,
  priority = 100,
): { promise: Promise<ImageBitmap>; cancel: () => void } {
  const scale = targetWidth / page.width
  const w = Math.max(1, Math.round(page.width * scale))
  const h = Math.max(1, Math.round(page.height * scale))
  const key = `${page.sourceId}:${page.sourceIndex}:t${w}x${h}`
  const hit = thumbCache.get(key)
  if (hit) return { promise: Promise.resolve(hit), cancel: () => {} }
  const job = renderQueue.enqueue<ImageBitmap>(priority, async (onCancel) => {
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    if (!page.sourceId) {
      const ctx = off.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
    } else {
      const src = getSource(page.sourceId)
      if (!src) throw new Error('Source not loaded')
      const pdfjs = await loadPdfjs()
      const pdfPage = await src.proxy.getPage(page.sourceIndex + 1)
      const viewport = pdfPage.getViewport({ scale: w / page.width })
      const task = pdfPage.render({
        canvas: off,
        viewport,
        background: '#ffffff',
        annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
        optionalContentConfigPromise: getOcConfig(page.sourceId),
      })
      onCancel(() => task.cancel())
      try {
        await task.promise
      } catch (e) {
        if ((e as Error)?.name === 'RenderingCancelledException') throw new DOMException('Render cancelled', 'AbortError')
        throw e
      }
      pdfPage.cleanup()
    }
    const bmp = await createImageBitmap(off)
    off.width = off.height = 0
    thumbCache.set(key, bmp)
    return bmp
  })
  return job
}

/** Renders a page to a standalone canvas at an arbitrary scale (exports, OCR, redaction, print). */
export async function renderPageToCanvas(
  page: Pick<PageModel, 'sourceId' | 'sourceIndex' | 'width' | 'height'>,
  scale: number,
  opts: { annotationMode?: 'forms' | 'storage' | 'disable' } = {},
): Promise<HTMLCanvasElement> {
  const w = Math.max(1, Math.floor(page.width * scale))
  const h = Math.max(1, Math.floor(page.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  if (!page.sourceId) return canvas
  const src = getSource(page.sourceId)
  if (!src) throw new Error('Source not loaded')
  const pdfjs = await loadPdfjs()
  const pdfPage = await src.proxy.getPage(page.sourceIndex + 1)
  const viewport = pdfPage.getViewport({ scale: w / page.width })
  const mode =
    opts.annotationMode === 'disable'
      ? pdfjs.AnnotationMode.DISABLE
      : opts.annotationMode === 'storage'
        ? pdfjs.AnnotationMode.ENABLE
        : pdfjs.AnnotationMode.ENABLE_FORMS
  await pdfPage.render({ canvas, viewport, background: '#ffffff', annotationMode: mode, optionalContentConfigPromise: getOcConfig(page.sourceId) }).promise
  pdfPage.cleanup()
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed – image may be too large'))), type, quality),
  )
}
