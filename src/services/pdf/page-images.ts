import { LruCache } from '@/lib/lru'
import type { PageModel, Rect } from '@/types'
import { loadPdfjs } from './pdfjs'
import { getSource } from './sources'

/** An image painted by the page's own content stream, located in base space (points, y down). */
export interface PageImage {
  key: string
  rect: Rect
  /** pdf.js object id of an image XObject (null for inline images, which are rendered instead). */
  objId: string | null
  /** Axis-aligned placement only: whether the image is mirrored on the page. */
  flipH: boolean
  flipV: boolean
  /** True when the image is drawn rotated/skewed – it is then captured by rendering the area. */
  rotated: boolean
}

type M = number[]
const mul = (m1: M, m2: M): M => [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1], m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3], m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]]
const apply = (m: M, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const cache = new LruCache<string, PageImage[]>(200, () => 1)

/** Finds the images on a page by walking its operator list (tracking the transformation matrix). */
export async function getPageImages(page: Pick<PageModel, 'sourceId' | 'sourceIndex'>): Promise<PageImage[]> {
  if (!page.sourceId) return []
  const key = `${page.sourceId}:${page.sourceIndex}`
  const hit = cache.get(key)
  if (hit) return hit
  const src = getSource(page.sourceId)
  if (!src) return []
  const pdfjs = await loadPdfjs()
  const OPS = pdfjs.OPS
  const p = await src.proxy.getPage(page.sourceIndex + 1)
  const vt = p.getViewport({ scale: 1 }).transform as M
  const ops = await p.getOperatorList()
  const found: PageImage[] = []
  let ctm: M = [1, 0, 0, 1, 0, 0]
  const stack: M[] = []
  const push = (m?: M) => {
    stack.push(ctm)
    if (m) ctm = mul(ctm, m)
  }
  const pop = () => {
    ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
  }
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i] as unknown[]
    if (fn === OPS.save) push()
    else if (fn === OPS.restore) pop()
    else if (fn === OPS.transform) ctm = mul(ctm, args as M)
    else if (fn === OPS.paintFormXObjectBegin) push(Array.isArray(args[0]) ? (args[0] as M) : undefined)
    else if (fn === OPS.paintFormXObjectEnd) pop()
    else if (fn === OPS.beginGroup) push((args[0] as { matrix?: M } | undefined)?.matrix ?? undefined)
    else if (fn === OPS.endGroup) pop()
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const m = mul(vt, ctm)
      // the image occupies the unit square; its top-left pixel is at (0, 1)
      const tl = apply(m, 0, 1), tr = apply(m, 1, 1), bl = apply(m, 0, 0), br = apply(m, 1, 0)
      const xs = [tl[0], tr[0], bl[0], br[0]], ys = [tl[1], tr[1], bl[1], br[1]]
      const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      if (rect.w < 8 || rect.h < 8) continue
      const axisAligned = Math.abs(tr[1] - tl[1]) < 0.5 && Math.abs(bl[0] - tl[0]) < 0.5
      found.push({
        key: `${i}`, rect, objId: fn === OPS.paintImageXObject && typeof args[0] === 'string' ? (args[0] as string) : null,
        flipH: axisAligned && tr[0] < tl[0], flipV: axisAligned && bl[1] < tl[1], rotated: !axisAligned,
      })
    }
  }
  // no p.cleanup(): keeps the decoded image objects available for an immediate pick-up
  cache.set(key, found)
  return found
}

interface ImgObj { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray | Uint8Array; kind?: number }

function objToCanvas(img: ImgObj): HTMLCanvasElement | null {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d')!
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0)
    return c
  }
  if (!img.data) return null
  const out = ctx.createImageData(img.width, img.height)
  const d = img.data
  const n = img.width * img.height
  if (img.kind === 3) out.data.set(d.subarray(0, n * 4))
  else if (img.kind === 2) for (let i = 0; i < n; i++) {
    out.data[i * 4] = d[i * 3]; out.data[i * 4 + 1] = d[i * 3 + 1]; out.data[i * 4 + 2] = d[i * 3 + 2]; out.data[i * 4 + 3] = 255
  }
  else if (img.kind === 1) {
    // 1 bit per pixel, rows padded to bytes
    const row = (img.width + 7) >> 3
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const v = (d[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0
      const o = (y * img.width + x) * 4
      out.data[o] = out.data[o + 1] = out.data[o + 2] = v
      out.data[o + 3] = 255
    }
  } else return null
  ctx.putImageData(out, 0, 0)
  return c
}

function waitObj(store: { get: (id: string, cb?: (v: unknown) => void) => unknown; has: (id: string) => boolean }, id: string): Promise<ImgObj | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 700)
    try {
      if (store.has(id)) {
        clearTimeout(t)
        resolve(store.get(id) as ImgObj)
      } else store.get(id, (v) => {
        clearTimeout(t)
        resolve(v as ImgObj)
      })
    } catch {
      clearTimeout(t)
      resolve(null)
    }
  })
}

/**
 * The image's pixels as a PNG. Image XObjects are taken from pdf.js's decoded image (original resolution, transparency
 * kept); inline or rotated images are captured by rendering just that area of the page at high resolution.
 */
export async function extractPageImage(page: Pick<PageModel, 'sourceId' | 'sourceIndex'>, img: PageImage): Promise<{ blob: Blob; width: number; height: number }> {
  const src = getSource(page.sourceId!)
  if (!src) throw new Error('Source not loaded')
  const p = await src.proxy.getPage(page.sourceIndex + 1)
  let canvas: HTMLCanvasElement | null = null
  if (img.objId && !img.rotated) {
    await p.getOperatorList() // makes sure the decoded image objects are (re)loaded
    const store = (img.objId.startsWith('g_') ? p.commonObjs : p.objs) as unknown as Parameters<typeof waitObj>[0]
    const obj = await waitObj(store, img.objId)
    if (obj && obj.width && obj.height) canvas = objToCanvas(obj)
  }
  if (!canvas) {
    // fallback: render the page region (transparent background) at ~3× for crisp pixels
    const scale = Math.min(4, Math.max(2, 1600 / Math.max(img.rect.w, img.rect.h)))
    const vp = p.getViewport({ scale, offsetX: -img.rect.x * scale, offsetY: -img.rect.y * scale })
    canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.rect.w * scale))
    canvas.height = Math.max(1, Math.round(img.rect.h * scale))
    await p.render({ canvas, viewport: vp, background: 'rgba(0,0,0,0)' }).promise
  }
  const c = canvas
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the image'))), 'image/png'))
  return { blob, width: c.width, height: c.height }
}
