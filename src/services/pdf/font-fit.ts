import { toast } from 'sonner'
import { canEncodeText, getMeasurer } from '@/engine/fonts'
import { naturalSize } from '@/lib/text-object'
import { ensureFontKey, fontDisplayName } from '@/services/fonts'
import type { FontChoice, TextObj } from '@/types'

const same = (o: Pick<TextObj, 'font' | 'bold' | 'italic'>, c: FontChoice) => o.font === c.font && o.bold === c.bold && o.italic === c.italic
const notified = new Set<string>()

const nameOf = (c: FontChoice) => fontDisplayName(c.font) ?? `${c.font[0].toUpperCase()}${c.font.slice(1)}${c.bold ? ' Bold' : ''}${c.italic ? ' Italic' : ''}`

/**
 * For text created by "Edit existing text": returns the patch needed after a change so the text is drawn with real glyphs
 * and its box still fits the text (`sizeToText`).
 * The original (embedded, subsetted) font is preferred; when the text contains a character it lacks, the object is moved
 * to its `alt` font (same family from the library, or the closest standard font) and back again when possible.
 * Returns null when nothing has to change (or the user picked a font by hand).
 */
export async function fitTextObject(o: TextObj, opts: { text?: string; sizeToText?: boolean } = {}): Promise<Partial<TextObj> | null> {
  const text = opts.text ?? o.text
  const patch: Partial<TextObj> = {}
  const sw = o.fontSwap
  if (sw && (same(o, sw.home) || same(o, sw.alt))) {
    const flat = text.replace(/\n/g, ' ')
    const homeReady = await ensureFontKey(sw.home.font)
    const homeOk = homeReady && (await canEncodeText(sw.home.font, sw.home.bold, sw.home.italic, flat))
    await ensureFontKey(sw.alt.font)
    const want = homeOk ? sw.home : sw.alt
    if (!same(o, want)) {
      Object.assign(patch, { font: want.font, bold: want.bold, italic: want.italic, letterSpacing: want.letterSpacing })
      if (!homeOk && homeReady && !notified.has(o.id)) {
        notified.add(o.id)
        toast.info(`Some characters aren’t in the PDF’s embedded ${nameOf(sw.home)} subset`, { description: `Using ${nameOf(sw.alt)} for this text – the closest available match.` })
      }
    }
  }
  const measure = getMeasurer()
  if ((opts.sizeToText ?? true) && o.noWrap && measure) {
    const size = naturalSize({ ...o, ...patch, text } as TextObj, measure)
    if (Math.abs(size.w - o.w) > 0.5) patch.w = size.w
    if (Math.abs(size.h - o.h) > 0.5) patch.h = size.h
  }
  return Object.keys(patch).length ? patch : null
}
