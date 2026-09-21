import type { Rect } from '@/types'
import { unionRects } from './geometry'

export interface MatchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  /** true: the whole query is one phrase. false: any of the whitespace-separated words matches. */
  exactPhrase: boolean
}
export interface TextRange {
  start: number
  end: number
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function buildRegex(query: string, o: MatchOptions): RegExp | null {
  const q = query.trim()
  if (!q) return null
  const terms = o.exactPhrase ? [q] : q.split(/\s+/).filter(Boolean)
  const parts = terms.map((t) => t.split(/\s+/).map(escapeRe).join('\\s+'))
  let src = parts.length > 1 ? `(?:${parts.join('|')})` : parts[0]
  if (o.wholeWord) src = `(?<![\\p{L}\\p{N}_])${src}(?![\\p{L}\\p{N}_])`
  return new RegExp(src, `gu${o.caseSensitive ? '' : 'i'}`)
}

export function findInText(text: string, query: string, o: MatchOptions, limit = 5000): TextRange[] {
  const re = buildRegex(query, o)
  if (!re) return []
  const out: TextRange[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) && out.length < limit) {
    if (m[0].length === 0) {
      re.lastIndex++
      continue
    }
    out.push({ start: m.index, end: m.index + m[0].length })
  }
  return out
}

export interface TextSpanItem {
  str: string
  rect: Rect
  size: number
  angle: number
  eol: boolean
}
export interface TextSpan {
  item: number
  start: number
  end: number
}
export interface PageTextIndex {
  text: string
  spans: TextSpan[]
}

/** Joins text items into a searchable string, remembering which character range belongs to which item. */
export function buildTextIndex(items: TextSpanItem[]): PageTextIndex {
  let text = ''
  const spans: TextSpan[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const prev = items[i - 1]
    if (prev && !prev.eol && text.length && !/\s$/.test(text) && !/^\s/.test(it.str)) {
      const gap = horizontalGap(prev, it)
      if (gap > prev.size * 0.12) text += ' '
    }
    const start = text.length
    text += it.str
    spans.push({ item: i, start, end: text.length })
    if (it.eol) text += '\n'
  }
  return { text, spans }
}

function horizontalGap(a: TextSpanItem, b: TextSpanItem): number {
  const vertical = Math.abs(a.angle % 180) === 90
  return vertical ? b.rect.y - (a.rect.y + a.rect.h) : b.rect.x - (a.rect.x + a.rect.w)
}

/** Rectangles covering the characters [start, end) — one per item touched, merged when on the same line. */
export function rectsForRange(idx: PageTextIndex, items: TextSpanItem[], start: number, end: number): Rect[] {
  const rects: Rect[] = []
  for (const sp of idx.spans) {
    if (sp.end <= start || sp.start >= end || sp.end === sp.start) continue
    const it = items[sp.item]
    const len = sp.end - sp.start
    const a = Math.max(start, sp.start) - sp.start
    const b = Math.min(end, sp.end) - sp.start
    const f0 = a / len
    const f1 = b / len
    const r = it.rect
    const vertical = Math.abs(it.angle % 180) === 90
    const flipped = it.angle === 180 || it.angle === -90 || it.angle === 270
    const g0 = flipped ? 1 - f1 : f0
    const g1 = flipped ? 1 - f0 : f1
    rects.push(vertical ? { x: r.x, y: r.y + r.h * g0, w: r.w, h: r.h * (g1 - g0) } : { x: r.x + r.w * g0, y: r.y, w: r.w * (g1 - g0), h: r.h })
  }
  // merge neighbours on the same line
  const merged: Rect[] = []
  for (const r of rects) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(last.y - r.y) < last.h * 0.4 && Math.abs(last.h - r.h) < last.h * 0.5 && r.x - (last.x + last.w) < last.h * 0.8) {
      merged[merged.length - 1] = unionRects([last, r])
    } else merged.push(r)
  }
  return merged
}

export function snippet(text: string, start: number, end: number, ctx = 32) {
  const clean = (s: string) => s.replace(/\s+/g, ' ')
  return {
    before: clean(text.slice(Math.max(0, start - ctx), start)),
    match: clean(text.slice(start, end)),
    after: clean(text.slice(end, end + ctx)),
  }
}
