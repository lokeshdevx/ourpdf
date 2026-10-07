'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { createImage } from '@/lib/object-factory'
import { addObjects } from '@/services/pdf/annotation-service'
import { importImageAsset } from '@/services/pdf/image-service'
import { extractPageImage, getPageImages, type PageImage } from '@/services/pdf/page-images'
import { sampleColors } from '@/services/pdf/sample'
import { useAnnotationStore } from '@/stores/annotation-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { DEFAULT_LAYER_ID, type EditObject, type ImageObj, type PageModel } from '@/types'

interface Props {
  page: PageModel
  outerRef: RefObject<HTMLDivElement | null>
  /** Starts dragging an object (the overlay's move gesture) – used to keep moving the image just picked up. */
  startMove: (e: React.PointerEvent, o: EditObject) => void
}

const near = (a: number, b: number) => Math.abs(a - b) < 1

/**
 * Images that are part of the PDF itself become movable with the Select tool: pressing on one turns it into a normal
 * image object (original pixels, original size) and covers its old spot with the page colour, then the same press
 * drags it. Delete the moved image to bring the original back.
 */
export function ImageGrabLayer({ page, outerRef, startMove }: Props) {
  const docId = usePdfStore((s) => s.activeId)!
  const layerId = useAnnotationStore((s) => s.byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID)
  const objects = useAnnotationStore((s) => s.byDoc[docId]?.objects)
  const [images, setImages] = useState<PageImage[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  /** Pixels prepared while hovering, so pressing picks the image up instantly. */
  const prepared = useRef(new Map<string, Promise<{ assetId: string }>>())
  const prepare = (img: PageImage) => {
    let p = prepared.current.get(img.key)
    if (!p) {
      p = extractPageImage(page, img).then(({ blob }) => importImageAsset(blob, `pdf-image-p${page.sourceIndex + 1}.png`)).then((a) => ({ assetId: a.id }))
      p.catch(() => prepared.current.delete(img.key))
      prepared.current.set(img.key, p)
    }
    return p
  }

  useEffect(() => {
    let alive = true
    getPageImages(page).then((r) => alive && setImages(r)).catch(() => {})
    return () => {
      alive = false
    }
  }, [page])

  // images already picked up are represented by an image object whose cover sits on the original spot
  const taken = (img: PageImage) => (objects ?? []).some((o) => o.type === 'image' && o.pageId === page.id && o.cover && near(o.cover.rect.x, img.rect.x - 1) && near(o.cover.rect.y, img.rect.y - 1))
  const free = images.filter((img) => !taken(img))
  if (!free.length) return null

  const pickUp = async (e: React.PointerEvent, img: PageImage) => {
    if (e.button !== 0 || busy) return
    e.stopPropagation()
    e.preventDefault()
    setBusy(img.key)
    let released = false
    const up = () => (released = true)
    window.addEventListener('pointerup', up, { once: true })
    try {
      const asset = { id: (await prepare(img)).assetId }
      prepared.current.delete(img.key)
      const pad = 4
      const bg = sampleColors(outerRef.current, page, { x: img.rect.x - pad, y: img.rect.y - pad, w: img.rect.w + 2 * pad, h: img.rect.h + 2 * pad }).bg
      const cover = { rect: { x: img.rect.x - 1, y: img.rect.y - 1, w: img.rect.w + 2, h: img.rect.h + 2 }, color: bg }
      const obj: ImageObj = createImage(page.id, layerId, img.rect, asset.id, { flipH: img.flipH, flipV: img.flipV, cover })
      addObjects(docId, [obj], 'Move image')
      // still holding the button: keep dragging; a quick click just selects it
      if (!released) startMove(e, obj)
      else useSelectionStore.getState().setObjects([obj.id])
    } catch (err) {
      toast.error('This image could not be picked up', { description: (err as Error).message })
    } finally {
      window.removeEventListener('pointerup', up)
      setBusy(null)
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} data-testid="pdf-images">
      {free.map((img) => (
        <div
          key={img.key}
          role="button"
          aria-label="Image in the PDF – drag to move it"
          title="Drag to move this image"
          data-pdf-image={img.key}
          onPointerEnter={() => void prepare(img).catch(() => {})}
          onPointerDown={(e) => void pickUp(e, img)}
          className="group"
          style={{ position: 'absolute', left: img.rect.x, top: img.rect.y, width: img.rect.w, height: img.rect.h, pointerEvents: 'auto', cursor: busy === img.key ? 'progress' : 'move', touchAction: 'none' }}
        >
          <div className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ outline: 'calc(1.5px / var(--k, 1)) dashed var(--primary)', background: 'color-mix(in oklab, var(--primary) 8%, transparent)' }} />
          <span className="absolute left-0 top-0 hidden whitespace-nowrap rounded-br bg-primary px-1.5 py-0.5 font-medium text-primary-foreground group-hover:block" style={{ fontSize: 'calc(11px / var(--k, 1))' }}>Drag to move</span>
        </div>
      ))}
    </div>
  )
}
