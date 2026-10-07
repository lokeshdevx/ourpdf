/** Document scanning: page-corner detection, perspective correction and scan-style enhancement. All pure pixel math. */

export type Pt = { x: number; y: number }
export type Quad = [Pt, Pt, Pt, Pt] // TL, TR, BR, BL

function otsu(hist: number[], total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 0, th = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) ** 2
    if (v > best) {
      best = v
      th = t
    }
  }
  return th
}

/**
 * Finds the paper in a photo: Otsu threshold on a downscaled grayscale copy, the largest bright connected region,
 * then its extreme corners (min/max of x+y and x−y). Falls back to an inset rectangle.
 */
export function detectQuad(src: HTMLCanvasElement | HTMLImageElement | ImageBitmap, w: number, h: number): Quad {
  const S = 220
  const k = Math.min(1, S / Math.max(w, h))
  const sw = Math.max(8, Math.round(w * k))
  const sh = Math.max(8, Math.round(h * k))
  const c = document.createElement('canvas')
  c.width = sw
  c.height = sh
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.filter = 'blur(1px)'
  ctx.drawImage(src, 0, 0, sw, sh)
  const d = ctx.getImageData(0, 0, sw, sh).data
  const g = new Uint8Array(sw * sh)
  const hist = new Array(256).fill(0)
  for (let i = 0; i < g.length; i++) {
    const v = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2])
    g[i] = v
    hist[v]++
  }
  const th = otsu(hist, g.length)
  const fg = new Uint8Array(g.length)
  for (let i = 0; i < g.length; i++) fg[i] = g[i] > th ? 1 : 0
  // largest 4-connected component
  const label = new Int32Array(g.length).fill(-1)
  let bestLabel = -1, bestSize = 0, cur = 0
  const stack: number[] = []
  for (let i = 0; i < g.length; i++) {
    if (!fg[i] || label[i] >= 0) continue
    let size = 0
    stack.push(i)
    label[i] = cur
    while (stack.length) {
      const p = stack.pop()!
      size++
      const x = p % sw, y = (p / sw) | 0
      for (const q of [x > 0 ? p - 1 : -1, x < sw - 1 ? p + 1 : -1, y > 0 ? p - sw : -1, y < sh - 1 ? p + sw : -1]) {
        if (q >= 0 && fg[q] && label[q] < 0) {
          label[q] = cur
          stack.push(q)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      bestLabel = cur
    }
    cur++
  }
  const inset: Quad = [{ x: w * 0.06, y: h * 0.06 }, { x: w * 0.94, y: h * 0.06 }, { x: w * 0.94, y: h * 0.94 }, { x: w * 0.06, y: h * 0.94 }]
  if (bestSize < g.length * 0.12 || bestSize > g.length * 0.985) return inset
  let tl = [Infinity, 0, 0], br = [-Infinity, 0, 0], tr = [-Infinity, 0, 0], bl = [Infinity, 0, 0]
  for (let i = 0; i < g.length; i++) {
    if (label[i] !== bestLabel) continue
    const x = i % sw, y = (i / sw) | 0
    if (x + y < tl[0]) tl = [x + y, x, y]
    if (x + y > br[0]) br = [x + y, x, y]
    if (x - y > tr[0]) tr = [x - y, x, y]
    if (x - y < bl[0]) bl = [x - y, x, y]
  }
  const P = (a: number[]) => ({ x: Math.min(w, Math.max(0, (a[1] + 0.5) / k)), y: Math.min(h, Math.max(0, (a[2] + 0.5) / k)) })
  return [P(tl), P(tr), P(br), P(bl)]
}

/** Solves the 3×3 homography H with H·src_i ∝ dst_i for four point pairs. */
function homography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let c = 0; c < 8; c++) {
    let piv = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
    ;[A[c], A[piv]] = [A[piv], A[c]]
    const div = A[c][c] || 1e-12
    for (let k = c; k < 9; k++) A[c][k] /= div
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  return [...A.map((r) => r[8]), 1]
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Output size of a quad, preserving its average edge lengths, limited to `max` pixels on the long side. */
export function quadSize(q: Quad, max = 2400): { w: number; h: number } {
  let w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2
  let h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2
  const k = Math.min(1, max / Math.max(w, h))
  w = Math.max(16, Math.round(w * k))
  h = Math.max(16, Math.round(h * k))
  return { w, h }
}

/** Perspective-corrects the quad of `src` into a w×h canvas (bilinear sampling). */
export function warp(src: HTMLCanvasElement, q: Quad, w: number, h: number): HTMLCanvasElement {
  const sctx = src.getContext('2d', { willReadFrequently: true })!
  const sd = sctx.getImageData(0, 0, src.width, src.height).data
  const SW = src.width, SH = src.height
  const H = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], q)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')!
  const img = octx.createImageData(w, h)
  const od = img.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const z = H[6] * x + H[7] * y + H[8]
      const sx = (H[0] * x + H[1] * y + H[2]) / z
      const sy = (H[3] * x + H[4] * y + H[5]) / z
      const x0 = Math.floor(sx), y0 = Math.floor(sy)
      const fx = sx - x0, fy = sy - y0
      const o = (y * w + x) * 4
      if (x0 < 0 || y0 < 0 || x0 >= SW - 1 || y0 >= SH - 1) {
        od[o] = od[o + 1] = od[o + 2] = 255
        od[o + 3] = 255
        continue
      }
      const i00 = (y0 * SW + x0) * 4, i10 = i00 + 4, i01 = i00 + SW * 4, i11 = i01 + 4
      for (let c = 0; c < 3; c++) od[o + c] = (sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx) * (1 - fy) + (sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx) * fy
      od[o + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  return out
}

export type ScanFilter = 'original' | 'magic' | 'grayscale' | 'bw' | 'enhance'

/** Background estimate: heavy blur of a downscaled copy (paper shading and shadows), used to flatten lighting. */
function background(c: HTMLCanvasElement): Uint8ClampedArray {
  const s = document.createElement('canvas')
  const k = 48 / Math.max(c.width, c.height)
  s.width = Math.max(4, Math.round(c.width * k))
  s.height = Math.max(4, Math.round(c.height * k))
  const sctx = s.getContext('2d')!
  sctx.drawImage(c, 0, 0, s.width, s.height)
  // max-filter so dark text does not darken the estimate
  const d = sctx.getImageData(0, 0, s.width, s.height)
  const src = new Uint8ClampedArray(d.data)
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let m = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(s.width - 1, Math.max(0, x + dx)), yy = Math.min(s.height - 1, Math.max(0, y + dy))
        m = Math.max(m, src[(yy * s.width + xx) * 4 + ch])
      }
      d.data[(y * s.width + x) * 4 + ch] = m
    }
  }
  sctx.putImageData(d, 0, 0)
  const big = document.createElement('canvas')
  big.width = c.width
  big.height = c.height
  const bctx = big.getContext('2d', { willReadFrequently: true })!
  bctx.filter = 'blur(12px)'
  bctx.imageSmoothingQuality = 'high'
  bctx.drawImage(s, 0, 0, c.width, c.height)
  return bctx.getImageData(0, 0, c.width, c.height).data
}

export function applyFilter(c: HTMLCanvasElement, f: ScanFilter, opts: { brightness?: number; contrast?: number } = {}): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = c.width
  out.height = c.height
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(c, 0, 0)
  if (f === 'original' && !opts.brightness && !opts.contrast) return out
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d = img.data
  const bg = f === 'magic' || f === 'bw' ? background(c) : null
  const b = (opts.brightness ?? 0) * 2.55
  const ct = 1 + (opts.contrast ?? 0) / 100
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], bl = d[i + 2]
    if (bg) {
      // divide by the lighting estimate: paper becomes white, shadows disappear
      r = Math.min(255, (r / Math.max(1, bg[i])) * 255)
      g = Math.min(255, (g / Math.max(1, bg[i + 1])) * 255)
      bl = Math.min(255, (bl / Math.max(1, bg[i + 2])) * 255)
    }
    if (f === 'magic') {
      // gentle S-curve for crisp ink, colours kept
      const curve = (v: number) => 255 / (1 + Math.exp(-(v - 150) / 28))
      r = curve(r); g = curve(g); bl = curve(bl)
    } else if (f === 'grayscale' || f === 'bw') {
      const l = 0.299 * r + 0.587 * g + 0.114 * bl
      r = g = bl = f === 'bw' ? (l > 175 ? 255 : l < 120 ? 0 : (l - 120) * (255 / 55)) : l
    } else if (f === 'enhance') {
      const curve = (v: number) => Math.min(255, Math.max(0, (v - 128) * 1.25 + 140))
      r = curve(r); g = curve(g); bl = curve(bl)
    }
    d[i] = (r - 128) * ct + 128 + b
    d[i + 1] = (g - 128) * ct + 128 + b
    d[i + 2] = (bl - 128) * ct + 128 + b
  }
  ctx.putImageData(img, 0, 0)
  return out
}

export function rotateCanvas(c: HTMLCanvasElement, deg: 90 | -90 | 180): HTMLCanvasElement {
  const out = document.createElement('canvas')
  const swap = deg !== 180
  out.width = swap ? c.height : c.width
  out.height = swap ? c.width : c.height
  const ctx = out.getContext('2d')!
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(c, -c.width / 2, -c.height / 2)
  return out
}

export function toCanvas(src: CanvasImageSource, w: number, h: number, max = 3000): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * k)
  c.height = Math.round(h * k)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return c
}
