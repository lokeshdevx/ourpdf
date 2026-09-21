import { matchLibraryFont } from '@/lib/font-library'
import type { FontChoice, PageModel } from '@/types'
import { loadLibraryFace, registerPdfFont } from '@/services/fonts'
import { getSource } from './sources'

export interface FontStyleGuess {
  family: 'helvetica' | 'times' | 'courier'
  bold: boolean
  italic: boolean
  /** True when the name is a metric-compatible match for a standard PDF font (Arial ≈ Helvetica, …). */
  metricCompatible: boolean
}

/** Removes the PDF subset prefix ("ABCDEF+") and normalises separators. */
export const stripSubsetPrefix = (name: string) => name.replace(/^[A-Z]{6}\+/, '')

/** Classifies a PostScript font name into the closest standard family and style. */
export function classifyFontName(rawName: string, hints: { mono?: boolean; serif?: boolean } = {}): FontStyleGuess {
  const n = stripSubsetPrefix(rawName).toLowerCase().replace(/[\s_]/g, '')
  const bold = /bold|black|heavy|semibold|demibold|extrabold|ultra/.test(n) || /-bd\b|,bold/.test(n)
  const italic = /italic|oblique|ital(?![a-z])|-it\b|,italic/.test(n)
  const mono = /courier|mono|consolas|menlo|lucidaconsole|typewriter|fixed|inconsolata|source code/.test(n) || !!hints.mono
  const serif = /times|georgia|garamond|palatino|minion|cambria|bookman|century|baskerville|didot|constantia|serif(?!.*sans)/.test(n) && !/sans/.test(n)
  const family: FontStyleGuess['family'] = mono ? 'courier' : serif || (hints.serif && !/arial|helvet|calibri|verdana|tahoma|sans|segoe|roboto|opensans|lato/.test(n)) ? 'times' : 'helvetica'
  const metricCompatible = /^(arial|helvetica|timesnewroman|times|couriernew|courier)/.test(n)
  return { family, bold, italic, metricCompatible }
}

export interface ResolvedFont {
  /** Font name as stored in the PDF (subset prefix removed), or '' when it could not be read. */
  detected: string
  /** embedded = the PDF's own font program is reused; library = same/similar family from the bundled library; standard = a standard PDF font. */
  kind: 'embedded' | 'library' | 'standard'
  /** True when glyph shapes are identical to the original (embedded program, or a standard font under its own name). */
  exact: boolean
  /** The font the replacement text starts with. */
  home: FontChoice
  /** Used automatically when the text needs characters `home` does not contain (embedded fonts are subsets). */
  alt: FontChoice
  /** Human-readable summary for the UI. */
  label: string
}

const cache = new Map<string, Promise<ResolvedFont>>()

interface PdfJsFont {
  name?: string
  isMonospace?: boolean
  isSerifFont?: boolean
  missingFile?: boolean
  data?: Uint8Array
}

/**
 * Finds the font used by a text run and decides how replacement text is drawn:
 *  1. the PDF's embedded font program (TrueType, OpenType/CFF, Type 1 → CFF, composite/CID) – identical glyphs;
 *  2. otherwise the bundled font of the same family (Calibri → Carlito, Roboto → Roboto, …);
 *  3. otherwise the closest standard PDF font.
 * For embedded subsets the best of 2/3 is also prepared as `alt`, used when a typed character is not in the subset.
 */
export function resolvePdfFont(page: Pick<PageModel, 'sourceId' | 'sourceIndex'>, fontId: string): Promise<ResolvedFont> {
  const key = `${page.sourceId}:${page.sourceIndex}:${fontId}`
  let p = cache.get(key)
  if (!p) {
    p = resolve(page, fontId)
    cache.set(key, p)
  }
  return p
}

const std = (g: FontStyleGuess): FontChoice => ({ font: g.family, bold: g.bold, italic: g.italic, letterSpacing: 0 })
const stdName = (g: FontStyleGuess) => `${g.family[0].toUpperCase()}${g.family.slice(1)}${g.bold ? ' Bold' : ''}${g.italic ? ' Italic' : ''}`

async function readPdfJsFont(page: Pick<PageModel, 'sourceId' | 'sourceIndex'>, fontId: string): Promise<PdfJsFont | null> {
  const src = page.sourceId ? getSource(page.sourceId) : undefined
  if (!src) return null
  try {
    const pdfPage = await src.proxy.getPage(page.sourceIndex + 1)
    // Ensures the page's fonts are resolved (cheap when the page has already been rendered).
    await pdfPage.getOperatorList()
    const font = pdfPage.commonObjs.has(fontId) ? (pdfPage.commonObjs.get(fontId) as PdfJsFont) : null
    pdfPage.cleanup()
    return font
  } catch {
    return null
  }
}

async function resolve(page: Pick<PageModel, 'sourceId' | 'sourceIndex'>, fontId: string): Promise<ResolvedFont> {
  const font = await readPdfJsFont(page, fontId)
  const raw = font?.name ?? ''
  const detected = stripSubsetPrefix(raw).replace(/-\d{3,}$/, '')
  const guess = classifyFontName(raw, { mono: font?.isMonospace, serif: font?.isSerifFont })
  const stdChoice = std(guess)

  // the closest bundled face (skipped for names that already are standard PDF fonts / their metric clones)
  const lib = guess.metricCompatible ? null : matchLibraryFont(raw)
  const libKey = lib ? await loadLibraryFace(lib.family.id, lib.weight, lib.italic) : null
  const libChoice: FontChoice | null = libKey ? { font: libKey, bold: false, italic: false, letterSpacing: 0 } : null
  const libLabel = lib ? `${lib.family.name}${lib.weight !== 400 ? ` ${lib.weight}` : ''}${lib.italic ? ' Italic' : ''}` : ''
  const alt = libChoice ?? stdChoice

  if (font?.data && !font.missingFile) {
    const key = await registerPdfFont(font.data, detected || 'PDF font')
    if (key) {
      return { detected, kind: 'embedded', exact: true, home: { font: key, bold: false, italic: false, letterSpacing: 0 }, alt, label: `${detected} · embedded in this PDF` }
    }
  }
  if (libChoice) {
    const sameFamily = detected.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(lib!.family.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
    return {
      detected,
      kind: 'library',
      exact: sameFamily,
      home: libChoice,
      alt: stdChoice,
      label: `${detected || 'Unknown'} · not embedded → ${libLabel} (${sameFamily ? 'same family' : 'closest match'})`,
    }
  }
  return {
    detected,
    kind: 'standard',
    exact: guess.metricCompatible,
    home: stdChoice,
    alt: stdChoice,
    label: guess.metricCompatible ? `${detected || stdName(guess)} · standard PDF font` : `${detected || 'Unknown'} → ${stdName(guess)} (closest standard font)`,
  }
}
