import { describe, expect, it } from 'vitest'
import { buildTextIndex, findInText, rectsForRange, snippet } from '@/lib/search-engine'
import { fitFontSize, layoutText, resolveTokens, tileOffsets } from '@/lib/text-layout'

const opts = { caseSensitive: false, wholeWord: false, exactPhrase: true }

describe('search engine', () => {
  it('finds case-insensitive matches by default and respects case-sensitive', () => {
    expect(findInText('Foo foo FOO', 'foo', opts)).toHaveLength(3)
    expect(findInText('Foo foo FOO', 'foo', { ...opts, caseSensitive: true })).toHaveLength(1)
  })
  it('whole-word matching', () => {
    expect(findInText('cat concatenate cat.', 'cat', { ...opts, wholeWord: true })).toHaveLength(2)
    expect(findInText('cat concatenate cat.', 'cat', opts)).toHaveLength(3)
  })
  it('exact phrase treats whitespace flexibly; any-word mode ORs terms', () => {
    expect(findInText('the quick\nbrown fox', 'quick brown', opts)).toHaveLength(1)
    expect(findInText('quick and brown', 'quick brown', opts)).toHaveLength(0)
    expect(findInText('quick and brown', 'quick brown', { ...opts, exactPhrase: false })).toHaveLength(2)
  })
  it('escapes regex metacharacters and handles empty / unicode queries', () => {
    expect(findInText('a.b a+b (x)', 'a.b', opts)).toHaveLength(1)
    expect(findInText('price is $5.00', '$5.00', opts)).toHaveLength(1)
    expect(findInText('anything', '   ', opts)).toEqual([])
    expect(findInText('Café au lait', 'café', opts)).toHaveLength(1)
    expect(findInText('naïve', 'naïve', { ...opts, wholeWord: true })).toHaveLength(1)
  })
  it('joins items into text with spaces at gaps and rectangles for ranges', () => {
    const items = [
      { str: 'Hello', rect: { x: 0, y: 0, w: 50, h: 10 }, size: 10, angle: 0, eol: false },
      { str: 'World', rect: { x: 60, y: 0, w: 50, h: 10 }, size: 10, angle: 0, eol: true },
      { str: 'Next', rect: { x: 0, y: 20, w: 40, h: 10 }, size: 10, angle: 0, eol: false },
    ]
    const idx = buildTextIndex(items)
    expect(idx.text).toBe('Hello World\nNext')
    const [m] = findInText(idx.text, 'World', opts)
    const rects = rectsForRange(idx, items, m.start, m.end)
    expect(rects).toEqual([{ x: 60, y: 0, w: 50, h: 10 }])
    const [p] = findInText(idx.text, 'llo', opts)
    const partial = rectsForRange(idx, items, p.start, p.end)
    expect(partial[0].x).toBeCloseTo(20)
    expect(partial[0].w).toBeCloseTo(30)
    expect(snippet(idx.text, m.start, m.end, 5).before).toBe('ello ')
  })
})

const measure = (t: string) => t.length * 6 // monospace 6pt per char
const base = { maxWidth: 60, fontSize: 10, lineHeight: 1.5, align: 'left' as const, list: 'none' as const, measure }

describe('text layout', () => {
  it('wraps at word boundaries and computes height', () => {
    const l = layoutText('aaaa bbbb cccc', { ...base, maxWidth: 40 })
    expect(l.lines.map((x) => x.text)).toEqual(['aaaa', 'bbbb', 'cccc'])
    expect(l.height).toBe(45)
  })
  it('respects explicit newlines and empty lines', () => {
    expect(layoutText('a\n\nb', base).lines.map((x) => x.text)).toEqual(['a', '', 'b'])
  })
  it('breaks over-long words by character', () => {
    const l = layoutText('abcdefghijklmnop', base)
    expect(l.lines.every((x) => x.text.length <= 10)).toBe(true)
    expect(l.lines.map((x) => x.text).join('')).toBe('abcdefghijklmnop')
  })
  it('aligns center/right and justifies all but the last line', () => {
    expect(layoutText('ab', { ...base, align: 'center' }).lines[0].x).toBeCloseTo(24)
    expect(layoutText('ab', { ...base, align: 'right' }).lines[0].x).toBeCloseTo(48)
    const j = layoutText('aa bb cc dd', { ...base, maxWidth: 40, align: 'justify' })
    expect(j.lines[0].wordSpacing).toBeGreaterThan(0)
    expect(j.lines[j.lines.length - 1].wordSpacing).toBe(0)
  })
  it('adds bullet and numbered list markers with a hanging indent', () => {
    const b = layoutText('one\ntwo', { ...base, list: 'bullet' })
    expect(b.lines[0].marker).toBe('•')
    expect(b.lines[0].x).toBeGreaterThan(0)
    const n = layoutText('one\ntwo', { ...base, list: 'number' })
    expect(n.lines.map((x) => x.marker)).toEqual(['1.', '2.'])
  })
  it('no wrapping when maxWidth is null', () => {
    expect(layoutText('a very long single line of text here', { ...base, maxWidth: null }).lines).toHaveLength(1)
  })
  it('auto-fit finds the largest size that fits the box', () => {
    const size = fitFontSize('hello world', { w: 66, h: 40 }, { ...base, measureAt: (s) => (t: string) => t.length * s * 0.6 }, 4, 100)
    const l = layoutText('hello world', { ...base, fontSize: size, maxWidth: 66, measure: (t) => t.length * size * 0.6 })
    expect(l.height).toBeLessThanOrEqual(40)
    const bigger = layoutText('hello world', { ...base, fontSize: size + 3, maxWidth: 66, measure: (t) => t.length * (size + 3) * 0.6 })
    expect(bigger.height > 40 || bigger.width > 66.5).toBe(true)
  })
})

describe('tokens and tiling', () => {
  const ctx = { page: 3, total: 10, label: 'iii', date: new Date(2026, 0, 5, 9, 7), batesIndex: 2 }
  it('expands page tokens', () => {
    expect(resolveTokens('Page {page} of {total} ({label})', ctx)).toBe('Page 3 of 10 (iii)')
    expect(resolveTokens('{date} {time}', ctx)).toBe('2026-01-05 09:07')
  })
  it('expands Bates numbers by output page index', () => {
    expect(resolveTokens('{bates}', ctx, { prefix: 'ABC-', suffix: '/x', start: 100, digits: 6 })).toBe('ABC-000102/x')
  })
  it('tiles across the page with gaps and a cap', () => {
    const t = tileOffsets(600, 800, 100, 50, 20, 30)
    expect(t.length).toBeGreaterThan(20)
    expect(t.length).toBeLessThanOrEqual(600)
    expect(tileOffsets(100000, 100000, 1, 1, 0, 0).length).toBeLessThanOrEqual(600)
  })
})
