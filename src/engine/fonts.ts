import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import { isCustomFont, standardFontName } from '@/lib/fonts'
import type { FontFamilyKey } from '@/types'

/** Vertical font metrics (fraction of font size) used identically by the viewer and the exporter. */
export const FONT_METRICS = {
  helvetica: { asc: 0.905, desc: 0.212 },
  times: { asc: 0.891, desc: 0.216 },
  courier: { asc: 0.833, desc: 0.3 },
  custom: { asc: 0.95, desc: 0.25 },
} as const

/** Real vertical metrics of custom / PDF-embedded fonts (fractions of the font size), read from the font program. */
const customMetrics = new Map<string, { asc: number; desc: number }>()

export function metricsFor(key: FontFamilyKey) {
  return isCustomFont(key) ? (customMetrics.get(key) ?? FONT_METRICS.custom) : FONT_METRICS[key]
}

function readMetrics(bytes: Uint8Array): { asc: number; desc: number } | null {
  try {
    const f = fontkit.create(bytes as never) as unknown as { unitsPerEm: number; ascent: number; descent: number }
    const u = f.unitsPerEm || 1000
    const asc = Math.abs(f.ascent) / u
    const desc = Math.abs(f.descent) / u
    return asc > 0 && asc < 3 ? { asc, desc } : null
  } catch {
    return null
  }
}

/** Baseline distance from the top of a line box (CSS-like half-leading model). */
export function baselineOffset(key: FontFamilyKey, fontSize: number, lineHeight: number): number {
  const m = metricsFor(key)
  const content = (m.asc + m.desc) * fontSize
  return (lineHeight * fontSize - content) / 2 + m.asc * fontSize
}

export class FontProvider {
  private cache = new Map<string, PDFFont>()
  private registered = false
  /** Subset user-provided fonts to keep files small. */
  subsetFonts = true
  constructor(
    private doc: PDFDocument,
    private custom: Record<string, Uint8Array> = {},
  ) {}

  /** Makes another custom font available (used for fonts discovered after construction). */
  addCustom(key: string, bytes: Uint8Array) {
    this.custom[key] = bytes
  }

  private cacheKey(key: FontFamilyKey, bold: boolean, italic: boolean) {
    return isCustomFont(key) ? key : `${key}:${bold}:${italic}`
  }

  async ensure(key: FontFamilyKey, bold = false, italic = false): Promise<PDFFont> {
    const ck = this.cacheKey(key, bold, italic)
    const hit = this.cache.get(ck)
    if (hit) return hit
    let font: PDFFont
    if (isCustomFont(key)) {
      const id = key.slice(7)
      const bytes = this.custom[key] ?? this.custom[id]
      if (!bytes) return this.ensure('helvetica', bold, italic)
      if (!this.registered) {
        this.doc.registerFontkit(fontkit)
        this.registered = true
      }
      if (!customMetrics.has(key)) {
        const m = readMetrics(bytes)
        if (m) customMetrics.set(key, m)
      }
      // Fonts taken from a PDF are already small subsets – embed them whole. User fonts are subsetted (assemble()
      // retries with full embedding if fontkit's subsetter fails; that error only surfaces when the document is saved).
      font = await this.doc.embedFont(bytes, { subset: this.subsetFonts && !embedsWhole(key) })
    } else {
      font = await this.doc.embedFont(standardFontName(key, bold, italic) as StandardFonts)
    }
    this.cache.set(ck, font)
    return font
  }

  /** Only valid after `ensure` for the same arguments. */
  get(key: FontFamilyKey, bold = false, italic = false): PDFFont {
    const f = this.cache.get(this.cacheKey(key, bold, italic))
    if (!f) throw new Error(`Font ${key} not preloaded`)
    return f
  }
}

const charsets = new WeakMap<PDFFont, Set<number>>()

/**
 * True when `font` has a glyph for every character of `text`.
 * NOTE: pdf-lib's encodeText() does not throw for unsupported characters (it silently substitutes), so we must
 * consult the font's actual character set – otherwise non-Latin text would be exported as garbage.
 */
export function canEncode(font: PDFFont, text: string): boolean {
  const set = charset(font)
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp === 10 || cp === 13 || cp === 9) continue
    // producers often leave the space glyph out of subsets (word gaps are positioned); spaces are then drawn as advances
    if (cp === 32) continue
    if (!set.has(cp)) return false
  }
  return true
}

function charset(font: PDFFont): Set<number> {
  let set = charsets.get(font)
  if (!set) {
    set = new Set(font.getCharacterSet())
    charsets.set(font, set)
  }
  return set
}

/** Fonts embedded whole (PDF-extracted programs are already subsets; the subsetter can't process them, library faces are small). */
export const embedsWhole = (key: string) => key.startsWith('custom:pdf-') || key.startsWith('custom:lib-')

const spaceEms = new WeakMap<PDFFont, number>()
/**
 * Space advance (em) for subsets without a space glyph: exact for monospaced faces, otherwise about half the average
 * width of the lowercase letters the face has (Arial 0.278, Times 0.25, DejaVu 0.317, Roboto 0.276).
 */
export function spaceEm(font: PDFFont): number {
  let e = spaceEms.get(font)
  if (e === undefined) {
    e = 0.25
    try {
      const set = charset(font)
      const widths: number[] = []
      for (let c = 97; c <= 122; c++) if (set.has(c)) widths.push(font.widthOfTextAtSize(String.fromCharCode(c), 1000) / 1000)
      if (widths.length) {
        const mono = widths.every((w) => Math.abs(w - widths[0]) < 0.002)
        const avg = widths.reduce((a, w) => a + w, 0) / widths.length
        e = mono ? widths[0] : avg / 2 + 0.03
      }
    } catch {
      /* keep the default */
    }
    spaceEms.set(font, e)
  }
  return e
}

/** True for subsets that contain glyphs but no space: words must be positioned instead of encoding U+0020. */
export const lacksSpace = (font: PDFFont) => {
  const set = charset(font)
  return set.size > 0 && !set.has(32)
}

/** Width of `text` at `size`, honouring fonts without a space glyph. */
export function widthOf(font: PDFFont, text: string, size: number): number {
  if (!lacksSpace(font) || !text.includes(' ')) return font.widthOfTextAtSize(text, size)
  return text.split(' ').reduce((w, part, i) => w + (i ? size * spaceEm(font) : 0) + (part ? font.widthOfTextAtSize(part, size) : 0), 0)
}

/** Removes characters the font cannot encode (used for invisible search layers). */
export function sanitizeForFont(font: PDFFont, text: string): string {
  let out = ''
  for (const ch of text) out += canEncode(font, ch) ? ch : ''
  return out
}

/* ---------- viewer-side measurement (main thread) ---------- */

let scratch: Promise<{ doc: PDFDocument; fonts: FontProvider }> | null = null
function getScratch() {
  scratch ??= (async () => {
    const doc = await PDFDocument.create({ updateMetadata: false })
    const fonts = new FontProvider(doc)
    for (const fam of ['helvetica', 'times', 'courier'] as const)
      for (const b of [false, true]) for (const i of [false, true]) await fonts.ensure(fam, b, i)
    return { doc, fonts }
  })()
  return scratch
}

export type Measurer = (family: FontFamilyKey, bold: boolean, italic: boolean, size: number, text: string) => number
let measurer: Measurer | null = null
let measureFonts: FontProvider | null = null

/** Resolves once standard-font metrics are ready; afterwards `getMeasurer()` is synchronous. */
export async function initMeasurer(): Promise<Measurer> {
  if (measurer) return measurer
  const { fonts } = await getScratch()
  measureFonts = fonts
  measurer = (family, bold, italic, size, text) => {
    try {
      // custom fonts are measured with their real glyph advances once registered
      if (isCustomFont(family)) return widthOf(fonts.get(family), text, size)
      return fonts.get(family, bold, italic).widthOfTextAtSize(text, size)
    } catch {
      // Characters outside WinAnsi: approximate (the exporter rasterises such text).
      return text.length * size * 0.55
    }
  }
  return measurer
}
export const getMeasurer = () => measurer

/** Registers a custom / PDF-embedded font for measuring and glyph checks (metrics come from the font program). */
export async function registerMeasureFont(key: FontFamilyKey, bytes: Uint8Array): Promise<boolean> {
  if (!isCustomFont(key)) return true
  const { fonts } = await getScratch()
  fonts.addCustom(key, bytes)
  try {
    await fonts.ensure(key)
    return true
  } catch {
    return false
  }
}

/** True when the font has a glyph for every character of `text` (standard fonts: WinAnsi; custom: the font's cmap). */
export async function canEncodeText(family: FontFamilyKey, bold: boolean, italic: boolean, text: string): Promise<boolean> {
  const { fonts } = await getScratch()
  try {
    const font = isCustomFont(family) ? fonts.get(family) : fonts.get(family, bold, italic)
    return canEncode(font, text)
  } catch {
    // an unregistered custom font: cannot verify, assume it works
    return isCustomFont(family)
  }
}

const fallbackSpace = new Map<number, number>()
/**
 * Extra word spacing (px) the browser needs for a font whose subset has no space glyph: the browser draws such spaces
 * with a fallback font, so we add the difference to the space advance the PDF layout (and export) uses.
 */
export function spacelessExtra(key: FontFamilyKey, size: number): number {
  if (!measureFonts || !isCustomFont(key) || typeof document === 'undefined') return 0
  try {
    const font = measureFonts.get(key)
    if (!lacksSpace(font)) return 0
    const k = Math.round(size * 10)
    let fb = fallbackSpace.get(k)
    if (fb === undefined) {
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.font = `${k / 10}px sans-serif`
      fb = ctx.measureText(' ').width
      fallbackSpace.set(k, fb)
    }
    return spaceEm(font) * size - fb
  } catch {
    return 0
  }
}
