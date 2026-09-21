import type { FontFamilyKey, TextObj } from '@/types'
import { fitFontSize, layoutText, resolveTokens, type TextLayout, type TokenContext } from './text-layout'

export const TEXT_PAD = 2

export type MeasureFn = (family: FontFamilyKey, bold: boolean, italic: boolean, size: number, text: string) => number

/** Resolved display text (tokens expanded). */
export function displayText(o: TextObj, ctx?: TokenContext): string {
  if (o.tokens && ctx) return resolveTokens(o.text, ctx, o.bates)
  return o.text
}

export interface TextObjectLayout {
  layout: TextLayout
  fontSize: number
}

export function layoutTextObject(o: TextObj, text: string, measure: MeasureFn): TextObjectLayout {
  const inner = { w: Math.max(1, o.w - 2 * TEXT_PAD), h: Math.max(1, o.h - 2 * TEXT_PAD) }
  const measureAt = (size: number) => (t: string) => measure(o.font, o.bold, o.italic, size, t) + o.letterSpacing * [...t].length
  const wrapWidth = o.tile || o.noWrap ? null : inner.w
  let fontSize = o.fontSize
  if (o.autoFit && !o.tile) {
    fontSize = fitFontSize(text, inner, { maxWidth: inner.w, lineHeight: o.lineHeight, align: o.align, list: o.list, measureAt })
  }
  const layout = layoutText(text, {
    maxWidth: wrapWidth,
    fontSize,
    lineHeight: o.lineHeight,
    align: o.align,
    list: o.list,
    measure: measureAt(fontSize),
  })
  return { layout, fontSize }
}

/** Natural (unwrapped) size of a text object's content, used to size new text boxes. */
export function naturalSize(o: TextObj, measure: MeasureFn): { w: number; h: number } {
  const layout = layoutText(o.text || ' ', {
    maxWidth: null,
    fontSize: o.fontSize,
    lineHeight: o.lineHeight,
    align: 'left',
    list: o.list,
    measure: (t) => measure(o.font, o.bold, o.italic, o.fontSize, t) + o.letterSpacing * [...t].length,
  })
  return { w: layout.width + 2 * TEXT_PAD, h: layout.height + 2 * TEXT_PAD }
}
