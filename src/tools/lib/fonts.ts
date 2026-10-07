import fontkit from '@pdf-lib/fontkit'
import { StandardFonts, type PDFDocument, type PDFFont } from 'pdf-lib'
import { canEncode } from '@/engine/fonts'
import { libFileUrl } from '@/lib/font-library'
import { woffToSfnt } from '@/utils/woff'

const cache = new Map<string, Promise<Uint8Array>>()

/** Fetches a bundled (self-hosted) library font as an sfnt usable by pdf-lib and fontkit. */
export function libraryFont(id: string, weight = 400, italic = false): Promise<Uint8Array> {
  const url = libFileUrl(id, weight, italic)
  let p = cache.get(url)
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`Font ${id} is not available`)
      return woffToSfnt(new Uint8Array(await r.arrayBuffer()))
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p
}

export interface FontSet { regular: PDFFont; bold: PDFFont; italic: PDFFont }

/**
 * Embeds DejaVu Sans (covers ₹, €, accented Latin, Greek, Cyrillic basics). Falls back to Helvetica
 * when the font cannot be fetched so documents are still produced.
 */
export async function unicodeFonts(doc: PDFDocument, family = 'dejavu-sans'): Promise<FontSet> {
  try {
    doc.registerFontkit(fontkit)
    const [r, b, i] = await Promise.all([libraryFont(family, 400), libraryFont(family, 700), libraryFont(family, 400, true)])
    return { regular: await doc.embedFont(r, { subset: false }), bold: await doc.embedFont(b, { subset: false }), italic: await doc.embedFont(i, { subset: false }) }
  } catch {
    return standardFonts(doc)
  }
}

export async function standardFonts(doc: PDFDocument): Promise<FontSet> {
  return { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), italic: await doc.embedFont(StandardFonts.HelveticaOblique) }
}

/** Replaces characters the font cannot draw (₹ becomes "Rs." in standard fonts). */
export function safe(font: PDFFont, text: string): string {
  const t = text.replace(/[\t\r]/g, ' ')
  if (canEncode(font, t)) return t
  return [...t].map((c) => (canEncode(font, c) ? c : c === '₹' ? 'Rs.' : c === '\n' ? '\n' : '?')).join('')
}

/** Greedy word wrap at `size` within `width`. Keeps explicit newlines. */
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of safe(font, text).split('\n')) {
    const words = para.split(/(\s+)/)
    let line = ''
    for (const w of words) {
      const cand = line + w
      if (font.widthOfTextAtSize(cand.trimEnd(), size) <= width || !line.trim()) {
        if (font.widthOfTextAtSize(cand.trimEnd(), size) > width && !line.trim()) {
          // hard-break a single long word
          let chunk = ''
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > width && chunk) {
              out.push(chunk)
              chunk = ''
            }
            chunk += ch
          }
          line = chunk
        } else line = cand
      } else {
        out.push(line.trimEnd())
        line = w.trimStart()
      }
    }
    out.push(line.trimEnd())
  }
  return out
}
