/** Realistic handwriting renderer: lays text out on paper and draws each glyph with natural variation. */

export const HAND_FONTS = [
  { id: 'caveat', name: 'Caveat', scale: 1.15 },
  { id: 'kalam', name: 'Kalam', scale: 0.95 },
  { id: 'indie-flower', name: 'Indie Flower', scale: 1 },
  { id: 'patrick-hand', name: 'Patrick Hand', scale: 1.05 },
  { id: 'shadows-into-light', name: 'Shadows Into Light', scale: 1 },
  { id: 'gloria-hallelujah', name: 'Gloria Hallelujah', scale: 0.85 },
  { id: 'homemade-apple', name: 'Homemade Apple', scale: 0.8 },
  { id: 'reenie-beanie', name: 'Reenie Beanie', scale: 1.3 },
] as const

export type Paper = 'ruled' | 'plain' | 'grid' | 'legal' | 'college'
export const INKS = { blue: '#1a3c8f', black: '#1b1b1f', 'dark-blue': '#0f2560', red: '#b3202a', green: '#1d6b3a', purple: '#55307f' } as const

export interface HandOptions {
  font: string
  /** Use the person's own captured glyphs instead of a font. */
  own?: GlyphSet | null
  size: number
  ink: string
  paper: Paper
  lineGap: number
  jitter: number
  slant: number
  margin: boolean
  scanEffect: boolean
  pageWidth: number
  pageHeight: number
  /** Pixels per point. */
  scale: number
  heading?: string
  seed?: number
}

/** Captured glyph: strokes in a unit box (x 0..1, y 0..1, baseline at y = 0.75). */
export interface Glyph { strokes: [number, number][][]; width: number }
export type GlyphSet = Record<string, Glyph[]>

const loaded = new Map<string, Promise<void>>()
export function loadHandFont(id: string): Promise<void> {
  let p = loaded.get(id)
  if (!p) {
    const face = new FontFace(`Hand-${id}`, `url(/fonts/hand-${id}.woff2)`)
    p = face.load().then((f) => {
      document.fonts.add(f)
    })
    loaded.set(id, p)
  }
  return p
}

/** Deterministic PRNG so previews and the exported PDF match. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

function drawPaper(ctx: CanvasRenderingContext2D, o: HandOptions, lineH: number, top: number) {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const k = o.scale
  ctx.fillStyle = o.paper === 'legal' ? '#fdf6c3' : '#fdfdfb'
  ctx.fillRect(0, 0, W, H)
  if (o.paper === 'plain') return
  ctx.save()
  if (o.paper === 'grid') {
    ctx.strokeStyle = 'rgba(110,150,200,0.35)'
    ctx.lineWidth = 0.6 * k
    const step = lineH / 2
    for (let x = 0; x < W; x += step) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
    for (let y = top % step; y < H; y += step) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  } else {
    ctx.strokeStyle = o.paper === 'legal' ? 'rgba(90,140,200,0.55)' : 'rgba(90,140,210,0.45)'
    ctx.lineWidth = 0.7 * k
    for (let y = top; y < H - 20 * k; y += lineH) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  }
  if (o.margin && o.paper !== 'grid') {
    ctx.strokeStyle = 'rgba(220,60,70,0.6)'
    ctx.lineWidth = 0.9 * k
    const mx = (o.paper === 'college' ? 64 : 72) * k
    ctx.beginPath()
    ctx.moveTo(mx, 0)
    ctx.lineTo(mx, H)
    ctx.stroke()
  }
  ctx.restore()
}

function scanEffect(ctx: CanvasRenderingContext2D, r: () => number) {
  const { width: W, height: H } = ctx.canvas
  // uneven lighting and a faint shadow at one edge, as in a phone photo or scan
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, 'rgba(0,0,0,0.05)')
  g.addColorStop(0.5, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${0.04 + r() * 0.05})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 10
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

function drawOwnGlyph(ctx: CanvasRenderingContext2D, g: Glyph, x: number, baseline: number, size: number, ink: string, r: () => number, jitter: number) {
  const box = size * 1.35
  ctx.save()
  ctx.strokeStyle = ink
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, size * 0.075 * (0.85 + r() * 0.3))
  for (const s of g.strokes) {
    if (!s.length) continue
    ctx.beginPath()
    const pt = (p: [number, number]) => [x + p[0] * box + (r() - 0.5) * jitter * size * 0.04, baseline + (p[1] - 0.75) * box + (r() - 0.5) * jitter * size * 0.04] as const
    const [x0, y0] = pt(s[0])
    ctx.moveTo(x0, y0)
    for (let i = 1; i < s.length - 1; i++) {
      const [ax, ay] = pt(s[i])
      const [bx, by] = pt(s[i + 1])
      ctx.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2)
    }
    const [lx, ly] = pt(s[s.length - 1])
    ctx.lineTo(lx, ly)
    if (s.length === 1) ctx.lineTo(x0 + 0.5, y0 + 0.5)
    ctx.stroke()
  }
  ctx.restore()
  return g.width * box
}

/** Renders text into as many page canvases as needed. */
export async function renderHandwriting(text: string, o: HandOptions): Promise<HTMLCanvasElement[]> {
  const fontInfo = HAND_FONTS.find((f) => f.id === o.font) ?? HAND_FONTS[0]
  await loadHandFont(fontInfo.id)
  const k = o.scale
  const W = Math.round(o.pageWidth * k)
  const H = Math.round(o.pageHeight * k)
  const size = o.size * k * (o.own ? 1 : fontInfo.scale)
  const lineH = o.size * k * o.lineGap
  const r = rng(o.seed ?? 7)
  const left = (o.margin && o.paper !== 'grid' ? 84 : 48) * k
  const right = W - 40 * k
  const top = 64 * k
  const pages: HTMLCanvasElement[] = []
  let ctx!: CanvasRenderingContext2D
  let lineIdx = 0
  const linesPerPage = Math.floor((H - top - 40 * k) / lineH)
  const fontCss = `${size}px "Hand-${fontInfo.id}"`
  const newPage = () => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    ctx = c.getContext('2d', { willReadFrequently: o.scanEffect })!
    drawPaper(ctx, o, lineH, top + lineH)
    ctx.font = fontCss
    ctx.textBaseline = 'alphabetic'
    pages.push(c)
    lineIdx = 0
  }
  newPage()
  const ownGlyph = (ch: string) => (o.own ? (o.own[ch] ?? o.own[ch.toLowerCase()] ?? o.own[ch.toUpperCase()]) : undefined)
  const measure = (w: string) => (o.own ? [...w].reduce((s, ch) => { const g = ownGlyph(ch)?.[0]; return s + (g ? g.width * size * 1.35 + size * 0.04 : ctx.measureText(ch).width) }, 0) : ctx.measureText(w).width)
  const space = o.own ? size * 0.45 : ctx.measureText(' ').width
  const baselineFor = (i: number) => top + lineH * (i + 1) - lineH * 0.18
  const wobble = r() * 6.28
  const paragraphs = (o.heading ? [`\u0001${o.heading}`, ...text.split('\n')] : text.split('\n'))
  for (const para of paragraphs) {
    const isHeading = para.startsWith('\u0001')
    const words = (isHeading ? para.slice(1) : para).split(/\s+/).filter(Boolean)
    let x = left + (isHeading ? Math.max(0, (right - left - measure(para.slice(1))) / 2) : r() * 4 * k)
    if (!words.length) {
      lineIdx++
      if (lineIdx >= linesPerPage) newPage()
      continue
    }
    for (const w of words) {
      const ww = measure(w)
      if (x + ww > right && x > left + 1) {
        lineIdx++
        x = left + r() * 6 * k
        if (lineIdx >= linesPerPage) newPage()
      }
      const base = baselineFor(lineIdx)
      // characters one by one: size, rotation, baseline drift and ink density vary slightly
      for (const ch of w) {
        const drift = Math.sin(wobble + x / (90 * k)) * 1.6 * k * o.jitter + (r() - 0.5) * 1.4 * k * o.jitter
        const own = ownGlyph(ch)
        ctx.save()
        ctx.globalAlpha = 0.82 + r() * 0.18
        if (own?.length) {
          const g = own[Math.floor(r() * own.length)]
          x += drawOwnGlyph(ctx, g, x, base + drift, size, o.ink, r, o.jitter) + size * 0.04
        } else {
          const sz = size * (1 + (r() - 0.5) * 0.08 * o.jitter)
          ctx.font = `${isHeading ? 'bold ' : ''}${sz}px "Hand-${fontInfo.id}"`
          ctx.fillStyle = o.ink
          ctx.translate(x, base + drift)
          ctx.transform(1, 0, -o.slant * 0.2, 1, 0, 0)
          ctx.rotate((r() - 0.5) * 0.06 * o.jitter)
          ctx.fillText(ch, 0, 0)
          if (isHeading) ctx.fillRect(0, size * 0.12, ctx.measureText(ch).width + 1, Math.max(1, k))
          x += ctx.measureText(ch).width * (1 + (r() - 0.5) * 0.05 * o.jitter)
        }
        ctx.restore()
      }
      x += space * (0.85 + r() * 0.35 * (0.5 + o.jitter))
    }
    lineIdx++
    if (lineIdx >= linesPerPage) newPage()
  }
  // drop a trailing empty page
  if (pages.length > 1 && lineIdx === 0) pages.pop()
  if (o.scanEffect) for (const p of pages) scanEffect(p.getContext('2d', { willReadFrequently: true })!, r)
  return pages
}

/* --------------------------------------------- captured handwriting store */

const KEY = 'ourpdf.handwriting.v1'
export function loadGlyphs(): GlyphSet | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as GlyphSet) : null
  } catch {
    return null
  }
}
export function saveGlyphs(g: GlyphSet) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g))
  } catch {
    /* storage unavailable – the set still works for this session */
  }
}
export function clearGlyphs() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export const GLYPH_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?\'"-:;()/&@₹%+='

/** Normalises raw pad strokes (pixels in a size×size box) into a glyph with its advance width. */
export function strokesToGlyph(strokes: [number, number][][], box: number): Glyph | null {
  const pts = strokes.flat()
  if (!pts.length) return null
  const minX = Math.min(...pts.map((p) => p[0]))
  const maxX = Math.max(...pts.map((p) => p[0]))
  const norm = strokes.map((s) => s.map(([x, y]) => [(x - minX) / box, y / box] as [number, number]))
  return { strokes: norm, width: Math.max(0.12, (maxX - minX) / box) }
}
