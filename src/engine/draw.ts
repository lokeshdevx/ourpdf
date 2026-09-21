import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  PDFPage,
  TextRenderingMode,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSqueeze,
  setWordSpacing,
  degrees,
  type PDFImage,
} from 'pdf-lib'
import { hexToUnit } from '@/utils/color'
import {
  baseRectToPdf,
  baseToPdf,
  baseVecToPdf,
  objectMatrix,
  type Placement,
} from '@/lib/geometry'
import { calloutTailPath, dashArray, inkPath, rectPath, shapeGeometry, squigglePath } from '@/lib/shape-paths'
import type { TokenContext } from '@/lib/text-layout'
import { tileOffsets } from '@/lib/text-layout'
import { displayText, layoutTextObject, TEXT_PAD } from '@/lib/text-object'
import type { EditObject, ImageObj, InkObj, LinkTarget, MarkupObj, Rect, RedactObj, ShapeObj, StampObj, TextObj } from '@/types'
import { canEncode, baselineOffset, FontProvider, lacksSpace, spaceEm } from './fonts'
import type { ExportPlan } from './types'

const color = (hex: string) => {
  const [r, g, b] = hexToUnit(hex)
  return rgb(r, g, b)
}

export interface LinkRequest {
  rect: Rect
  target: LinkTarget
  border?: { color: string; width: number; style: 'solid' | 'dashed' | 'none' }
}
export interface NoteRequest {
  rect: Rect
  text: string
  author: string
  color: string
}

export interface DrawEnv {
  doc: PDFDocument
  page: PDFPage
  pl: Placement
  /** Base page size (for tiling). */
  baseW: number
  baseH: number
  tokens: TokenContext
  fonts: FontProvider
  plan: ExportPlan
  imageCache: Map<string, PDFImage>
  links: LinkRequest[]
  notes: NoteRequest[]
}

function local(env: DrawEnv, o: { x: number; y: number; w: number; h: number }, rotation: number, fn: () => void) {
  const m = objectMatrix(env.pl, { x: o.x, y: o.y, w: o.w, h: o.h }, rotation)
  env.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(m[0], m[1], m[2], m[3], m[4], m[5]))
  try {
    fn()
  } finally {
    env.page.pushOperators(popGraphicsState())
  }
}

/** Fonts (and fallbacks) used by an object; must be embedded before `drawObject`. */
export async function preloadFonts(fonts: FontProvider, objs: EditObject[]): Promise<void> {
  await fonts.ensure('helvetica', true, false)
  for (const o of objs) {
    if (o.type === 'text') await fonts.ensure(o.font, o.bold, o.italic)
  }
}

export async function drawObject(env: DrawEnv, o: EditObject): Promise<void> {
  if (o.type === 'field') return // handled by the form pass
  switch (o.type) {
    case 'text':
      return drawText(env, o)
    case 'markup':
      return drawMarkup(env, o)
    case 'note':
      env.notes.push({ rect: { x: o.x, y: o.y, w: o.w, h: o.h }, text: o.text, author: o.author, color: o.color })
      return drawNoteIcon(env, o)
    case 'ink':
      return drawInk(env, o)
    case 'shape':
      return drawShape(env, o)
    case 'stamp':
      return drawStamp(env, o)
    case 'image':
      return drawImage(env, o)
    case 'redact':
      return drawRedact(env, o)
    case 'link':
      env.links.push({ rect: { x: o.x, y: o.y, w: o.w, h: o.h }, target: o.target, border: o.border })
      return
  }
}

/* ------------------------------------------------------------------ text */

function drawText(env: DrawEnv, o: TextObj) {
  const { page, fonts } = env
  // Replaced-text cover is painted in base space first, behind the new text.
  if (o.cover) {
    const r = baseRectToPdf(env.pl, o.cover.rect)
    page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: color(o.cover.color), borderWidth: 0 })
  }
  const opts = { opacity: o.opacity }
  const raster = env.plan.textRasters[o.id]
  const text = displayText(o, env.tokens)
  const font = fonts.get(o.font, o.bold, o.italic)
  local(env, o, o.rotation, () => {
    const hw = o.w / 2
    const hh = o.h / 2
    if (o.bg) page.drawRectangle({ x: -hw, y: -hh, width: o.w, height: o.h, color: color(o.bg), opacity: o.opacity, borderWidth: 0 })
    if (o.radius && o.border) {
      // rounded border via path
      page.drawSvgPath(rectPath(o.w, o.h, o.radius), { x: -hw, y: hh, borderColor: color(o.border.color), borderWidth: o.border.width, borderOpacity: o.opacity })
    } else if (o.border) {
      page.drawRectangle({ x: -hw, y: -hh, width: o.w, height: o.h, borderColor: color(o.border.color), borderWidth: o.border.width, borderOpacity: o.opacity })
    }
    if (o.callout) {
      const d = calloutTailPath(o.w, o.h, o.callout)
      page.drawSvgPath(d, { x: -hw, y: hh, borderColor: color(o.border?.color ?? o.color), borderWidth: o.border?.width ?? 1, color: o.bg ? color(o.bg) : rgb(1, 1, 1), opacity: o.opacity, borderOpacity: o.opacity })
    }
    if (!text.trim() && !o.tile) return

    if (raster) {
      // Unicode text that the standard fonts cannot encode is embedded as an image (visual only).
      const img = env.imageCache.get(`raster:${o.id}`)
      if (img) page.drawImage(img, { x: -hw, y: -hh, width: o.w, height: o.h, opacity: o.opacity })
      return
    }
    if (o.tile) {
      const { layout, fontSize } = layoutTextObject({ ...o, tile: null }, text, (f, b, i, s, t) => fonts.get(f, b, i).widthOfTextAtSize(t, s))
      const tw = layout.width + 2 * TEXT_PAD
      const th = layout.height + 2 * TEXT_PAD
      // Tiles are laid over the whole page in base space; draw each with its own matrix.
      for (const [tx, ty] of tileOffsets(env.baseW, env.baseH, tw, th, o.tile.gapX, o.tile.gapY)) {
        local(env, { x: tx, y: ty, w: tw, h: th }, o.rotation, () => {
          drawTextLines(page, font, o, text, layout, fontSize, -tw / 2, th / 2, opts)
        })
      }
      return
    }
    const { layout, fontSize } = layoutTextObject(o, text, (f, b, i, s, t) => fonts.get(f, b, i).widthOfTextAtSize(t, s))
    drawTextLines(page, font, o, text, layout, fontSize, -hw, hh, opts)
    // hyperlinks on text objects
    if (o.link) env.links.push({ rect: { x: o.x, y: o.y, w: o.w, h: o.h }, target: o.link, border: { color: '#000000', width: 0, style: 'none' } })
  })
}

function drawTextLines(
  page: PDFPage,
  font: import('pdf-lib').PDFFont,
  o: TextObj,
  _text: string,
  layout: ReturnType<typeof layoutTextObject>['layout'],
  fontSize: number,
  originX: number,
  originY: number,
  opts: { opacity: number },
) {
  const col = color(o.color)
  const base = baselineOffset(o.font, fontSize, o.lineHeight)
  for (const ln of layout.lines) {
    const baseY = originY - TEXT_PAD - ln.y - base
    const x = originX + TEXT_PAD + ln.x
    if (ln.marker) {
      page.drawText(ln.marker, { x: originX + TEXT_PAD + (ln.markerX ?? 0), y: baseY, size: fontSize, font, color: col, opacity: opts.opacity })
    }
    if (ln.text) {
      const ls = o.letterSpacing || 0
      if (lacksSpace(font) && ln.text.includes(' ')) {
        // the embedded subset has no space glyph: place each word explicitly (same advance the viewer measured)
        let px = x
        for (const [i, word] of ln.text.split(' ').entries()) {
          if (i) px += fontSize * spaceEm(font) + ls + ln.wordSpacing
          if (!word) continue
          page.drawText(word, { x: px, y: baseY, size: fontSize, font, color: col, opacity: opts.opacity, characterSpacing: ls || undefined })
          px += font.widthOfTextAtSize(word, fontSize) + ls * [...word].length
        }
      } else {
        if (ln.wordSpacing) page.pushOperators(pushGraphicsState(), setWordSpacing(ln.wordSpacing))
        page.drawText(ln.text, { x, y: baseY, size: fontSize, font, color: col, opacity: opts.opacity, characterSpacing: ls || undefined })
        if (ln.wordSpacing) page.pushOperators(popGraphicsState())
      }
      const w = ln.width + ln.wordSpacing * (ln.text.match(/ /g)?.length ?? 0)
      const th = Math.max(0.5, fontSize * 0.06)
      if (o.underline) page.drawLine({ start: { x, y: baseY - fontSize * 0.12 }, end: { x: x + w, y: baseY - fontSize * 0.12 }, thickness: th, color: col, opacity: opts.opacity })
      if (o.strike) page.drawLine({ start: { x, y: baseY + fontSize * 0.3 }, end: { x: x + w, y: baseY + fontSize * 0.3 }, thickness: th, color: col, opacity: opts.opacity })
    }
  }
}

/* ---------------------------------------------------------------- markup */

function drawMarkup(env: DrawEnv, o: MarkupObj) {
  const { page } = env
  local(env, o, o.rotation, () => {
    const hw = o.w / 2
    const hh = o.h / 2
    const col = color(o.color)
    for (const fr of o.rects) {
      const x = fr.x * o.w
      const y = fr.y * o.h
      const w = fr.w * o.w
      const h = fr.h * o.h
      const lx = x - hw
      const ly = hh - y - h // bottom of the rect in local y-up
      if (o.kind === 'highlight') {
        page.drawRectangle({ x: lx, y: ly, width: w, height: h, color: col, opacity: o.opacity, blendMode: BlendMode.Multiply, borderWidth: 0 })
      } else if (o.kind === 'underline') {
        page.drawLine({ start: { x: lx, y: ly + h * 0.08 }, end: { x: lx + w, y: ly + h * 0.08 }, thickness: Math.max(0.8, h * 0.07), color: col, opacity: o.opacity })
      } else if (o.kind === 'strike') {
        page.drawLine({ start: { x: lx, y: ly + h * 0.38 }, end: { x: lx + w, y: ly + h * 0.38 }, thickness: Math.max(0.8, h * 0.07), color: col, opacity: o.opacity })
      } else {
        const amp = Math.max(0.8, h * 0.07)
        page.drawSvgPath(squigglePath(0, 0, w, amp, amp * 3.2), { x: lx, y: ly + h * 0.12 + amp, borderColor: col, borderWidth: Math.max(0.6, h * 0.05), borderOpacity: o.opacity })
      }
    }
  })
}

function drawNoteIcon(env: DrawEnv, o: import('@/types').NoteObj) {
  const { page } = env
  local(env, o, 0, () => {
    const hw = o.w / 2
    const hh = o.h / 2
    page.drawRectangle({ x: -hw, y: -hh, width: o.w, height: o.h, color: color(o.color), borderColor: rgb(0.35, 0.28, 0), borderWidth: 0.8, opacity: 0.95 })
    for (let i = 0; i < 3; i++) {
      page.drawLine({ start: { x: -hw + 4, y: hh - 7 - i * 5 }, end: { x: hw - 4, y: hh - 7 - i * 5 }, thickness: 0.8, color: rgb(0.35, 0.28, 0) })
    }
  })
}

/* ------------------------------------------------------------------- ink */

function drawInk(env: DrawEnv, o: InkObj) {
  const { page } = env
  local(env, o, o.rotation, () => {
    const pts = o.pts.map(([x, y]) => [x * o.w, y * o.h] as [number, number])
    const marker = o.brush === 'marker'
    page.drawSvgPath(inkPath(pts), {
      x: -o.w / 2,
      y: o.h / 2,
      borderColor: color(o.color),
      borderWidth: o.width,
      borderOpacity: o.opacity,
      borderLineCap: marker ? LineCapStyle.Projecting : LineCapStyle.Round,
      blendMode: marker ? BlendMode.Multiply : undefined,
    })
  })
}

/* ----------------------------------------------------------------- shape */

function drawShape(env: DrawEnv, o: ShapeObj) {
  const { page } = env
  const g = shapeGeometry(o)
  local(env, o, o.rotation, () => {
    const opts = { x: -o.w / 2, y: o.h / 2 }
    const dash = dashArray(o.dash, o.strokeWidth)
    const stroke = color(o.stroke)
    page.drawSvgPath(g.main, {
      ...opts,
      borderColor: o.strokeWidth > 0 ? stroke : undefined,
      borderWidth: o.strokeWidth,
      borderDashArray: dash,
      borderLineCap: o.dash === 'dotted' ? LineCapStyle.Round : LineCapStyle.Butt,
      color: g.closed && o.fill ? color(o.fill) : undefined,
      opacity: o.opacity,
      borderOpacity: o.opacity,
    })
    for (const head of g.heads) page.drawSvgPath(head, { ...opts, color: stroke, borderColor: stroke, borderWidth: 0.5, opacity: o.opacity, borderOpacity: o.opacity })
  })
}

/* ----------------------------------------------------------------- stamp */

export function stampText(o: StampObj, ctx: TokenContext): { label: string; date: string | null } {
  const d = ctx.date
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const label = o.dynamic ? o.label.replace(/\{date\}/gi, date).replace(/\{time\}/gi, `${pad(d.getHours())}:${pad(d.getMinutes())}`) : o.label
  return { label, date: o.showDate ? date : null }
}

function drawStamp(env: DrawEnv, o: StampObj) {
  const { page, fonts } = env
  const font = fonts.get('helvetica', true, false)
  const { label, date } = stampText(o, env.tokens)
  const safe = canEncode(font, label) ? label : label.replace(/[^\x20-\x7e]/g, '?')
  local(env, o, o.rotation, () => {
    const hw = o.w / 2
    const hh = o.h / 2
    const col = color(o.color)
    const bw = Math.max(1.5, Math.min(o.w, o.h) * 0.05)
    page.drawSvgPath(rectPath(o.w - bw, o.h - bw, Math.min(o.h * 0.18, 10)), { x: -hw + bw / 2, y: hh - bw / 2, borderColor: col, borderWidth: bw, borderOpacity: o.opacity })
    const textH = date ? o.h * 0.6 : o.h
    const avail = o.w - bw * 6
    const size = Math.max(4, Math.min(textH * 0.55, (avail / Math.max(1, font.widthOfTextAtSize(safe, 1)))))
    const tw = font.widthOfTextAtSize(safe, size)
    const cy = date ? hh - textH / 2 - bw : 0
    page.drawText(safe, { x: -tw / 2, y: cy - size * 0.35, size, font, color: col, opacity: o.opacity })
    if (date) {
      const ds = Math.max(4, Math.min(o.h * 0.22, size * 0.6))
      const dw = font.widthOfTextAtSize(date, ds)
      page.drawText(date, { x: -dw / 2, y: -hh + bw + ds * 0.5, size: ds, font, color: col, opacity: o.opacity })
    }
  })
}

/* ----------------------------------------------------------------- image */

function drawImage(env: DrawEnv, o: ImageObj) {
  const img = env.imageCache.get(`image:${o.id}`)
  if (!img) return
  const { page } = env
  local(env, o, o.rotation, () => {
    const hw = o.w / 2
    const hh = o.h / 2
    if (o.flipH || o.flipV) {
      page.pushOperators(concatTransformationMatrix(o.flipH ? -1 : 1, 0, 0, o.flipV ? -1 : 1, 0, 0))
    }
    page.drawImage(img, { x: -hw, y: -hh, width: o.w, height: o.h, opacity: o.opacity })
  })
}

/* ---------------------------------------------------------------- redact */

function drawRedact(env: DrawEnv, o: RedactObj) {
  const { page, fonts } = env
  const r = baseRectToPdf(env.pl, o)
  page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: color(o.color), borderWidth: 0 })
  if (o.overlayText) {
    const font = fonts.get('helvetica', true, false)
    const safe = canEncode(font, o.overlayText) ? o.overlayText : o.overlayText.replace(/[^\x20-\x7e]/g, '?')
    const size = Math.max(4, Math.min(o.h * 0.6, (o.w - 4) / Math.max(1, font.widthOfTextAtSize(safe, 1))))
    const lum = hexToUnit(o.color)
    const light = 0.299 * lum[0] + 0.587 * lum[1] + 0.114 * lum[2] < 0.5
    local(env, o, 0, () => {
      const tw = font.widthOfTextAtSize(safe, size)
      page.drawText(safe, { x: -tw / 2, y: -size * 0.35, size, font, color: light ? rgb(1, 1, 1) : rgb(0, 0, 0) })
    })
  }
}

/* ------------------------------------------------- invisible text layer */

/** Draws invisible (searchable/selectable) text over a rectangle in base space. */
export function drawInvisibleText(
  page: PDFPage,
  pl: Placement,
  font: import('pdf-lib').PDFFont,
  run: { text: string; x: number; y: number; w: number; h: number },
) {
  const text = run.text.replace(/\s+/g, ' ').trim()
  if (!text) return
  const safe = [...text].filter((ch) => canEncode(font, ch)).join('')
  if (!safe) return
  const size = Math.max(2, run.h * 0.82)
  const natural = font.widthOfTextAtSize(safe, size)
  if (!natural) return
  const squeeze = Math.max(10, Math.min(400, (run.w / natural) * 100))
  const [px, py] = baseToPdf(pl, run.x, run.y + run.h * 0.8)
  // Direction of the base-space "right" vector in PDF space gives the text rotation.
  const [vx, vy] = baseVecToPdf(pl, 1, 0)
  const angle = (Math.atan2(vy, vx) * 180) / Math.PI
  page.pushOperators(pushGraphicsState(), setCharacterSqueeze(squeeze))
  page.drawText(safe, { x: px, y: py, size, font, opacity: 0, renderMode: TextRenderingMode.Invisible, rotate: degrees(angle) })
  page.pushOperators(popGraphicsState())
}
