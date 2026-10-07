import { toast } from 'sonner'
import { canEncodeText, getMeasurer } from '@/engine/fonts'
import { naturalSize, TEXT_PAD } from '@/lib/text-object'
import { layoutText } from '@/lib/text-layout'
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
export async function fitTextObject(o: TextObj, opts: { text?: string; sizeToText?: boolean; maxW?: number } = {}): Promise<Partial<TextObj> | null> {
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
  if ((opts.sizeToText ?? true) && measure && (o.noWrap || (o.cover && opts.maxW))) {
    const next = { ...o, ...patch, text } as TextObj
    const size = naturalSize({ ...next, noWrap: true }, measure)
    const maxW = opts.maxW ? Math.max(40, opts.maxW) : Infinity
    if (size.w > maxW) {
      // the edited line reached the page edge: wrap inside the page and grow downwards instead of running off it
      const inner = Math.max(1, maxW - 2 * TEXT_PAD)
      const layout = layoutText(text || ' ', { maxWidth: inner, fontSize: next.fontSize, lineHeight: next.lineHeight, align: next.align, list: next.list, measure: (t) => measure(next.font, next.bold, next.italic, next.fontSize, t) + next.letterSpacing * [...t].length })
      const h = layout.height + 2 * TEXT_PAD
      if (o.noWrap) patch.noWrap = false
      if (Math.abs(maxW - o.w) > 0.5) patch.w = maxW
      if (Math.abs(h - o.h) > 0.5) patch.h = h
    } else if (o.noWrap) {
      if (Math.abs(size.w - o.w) > 0.5) patch.w = size.w
      if (Math.abs(size.h - o.h) > 0.5) patch.h = size.h
    } else if (o.cover) {
      // short again: back to a single line sized to the text
      patch.noWrap = true
      patch.w = size.w
      patch.h = size.h
    }
  }
  return Object.keys(patch).length ? patch : null
}
