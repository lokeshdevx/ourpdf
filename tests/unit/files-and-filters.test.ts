import { describe, expect, it } from 'vitest'
import { applyFilters, cssFilter, hasFilters } from '@/lib/image-filters'
import { sanitizeFilename, sniffBytes, sniffZipKind, stripExtension, withExtension } from '@/utils/file'
import { hexToRgb, hexToUnit, luminance, rgbToHex } from '@/utils/color'
import { formatBytes, clamp } from '@/utils/format'
import { dashArray, shapeGeometry, starPath } from '@/lib/shape-paths'
import { createShape } from '@/lib/object-factory'
import { DEFAULT_FILTERS } from '@/types'
import { LruCache } from '@/lib/lru'
import { toUserError, AppError } from '@/lib/errors'

const bytes = (s: string | number[]) => (typeof s === 'string' ? new TextEncoder().encode(s) : Uint8Array.from(s))

describe('file sniffing (content, not extension)', () => {
  it('detects PDF, PNG, JPEG, WEBP, TIFF, ZIP-based and text', () => {
    expect(sniffBytes(bytes('%PDF-1.7\n...'))).toBe('pdf')
    expect(sniffBytes(bytes('junk junk %PDF-1.4'))).toBe('pdf')
    expect(sniffBytes(bytes([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]))).toBe('png')
    expect(sniffBytes(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(sniffBytes(bytes('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('webp')
    expect(sniffBytes(bytes([0x49, 0x49, 0x2a, 0]))).toBe('tiff')
    expect(sniffBytes(bytes([0x50, 0x4b, 3, 4]))).toBe('docx')
    expect(sniffBytes(bytes('<!DOCTYPE html><html><body>hi</body></html>'))).toBe('html')
    expect(sniffBytes(bytes('Just some plain text\nwith lines'))).toBe('text')
    expect(sniffBytes(bytes([0, 1, 2, 3, 0, 0, 9, 0, 0, 1, 2, 3]))).toBe('unknown')
  })
  it('does not trust a lying extension (an .exe renamed .pdf is not a pdf)', () => {
    expect(sniffBytes(bytes('MZ\u0090\u0000\u0003\u0000\u0000\u0000'))).toBe('unknown')
  })
  it('separates docx and xlsx zips', () => {
    expect(sniffZipKind(bytes('PK..word/document.xml'))).toBe('docx')
    expect(sniffZipKind(bytes('PK..xl/workbook.xml'))).toBe('xlsx')
    expect(sniffZipKind(bytes('PK..other'))).toBe('unknown')
  })
})

describe('filename sanitising', () => {
  it('removes path separators, control chars and reserved names', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd'.replace(/^\.+/, ''))
    expect(sanitizeFilename('a<b>c:d"e|f?g*h.pdf')).toBe('a_b_c_d_e_f_g_h.pdf')
    expect(sanitizeFilename('CON')).toBe('document')
    expect(sanitizeFilename('   ...  ')).toBe('document')
    expect(sanitizeFilename('x'.repeat(300)).length).toBe(120)
    expect(sanitizeFilename('line\nbreak\u0000.pdf')).toBe('line_break_.pdf')
  })
  it('extension helpers', () => {
    expect(stripExtension('report.final.pdf')).toBe('report.final')
    expect(withExtension('scan.png', 'pdf')).toBe('scan.pdf')
    expect(withExtension('a/b\\c', '.pdf')).toBe('a_b_c.pdf')
  })
})

describe('utils', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(-1)).toBe('—')
    expect(clamp(5, 0, 3)).toBe(3)
  })
  it('colour conversions', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 })
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(rgbToHex(255, 128, 0)).toBe('#ff8000')
    expect(hexToUnit('#000000')).toEqual([0, 0, 0])
    expect(luminance('#ffffff')).toBeCloseTo(1)
  })
  it('LRU cache evicts by byte budget and calls onEvict', () => {
    const evicted: string[] = []
    const c = new LruCache<string, { n: number }>(10, (v) => v.n, (_v, k) => evicted.push(k))
    c.set('a', { n: 4 })
    c.set('b', { n: 4 })
    c.get('a')
    c.set('c', { n: 4 })
    expect(evicted).toEqual(['b'])
    expect(c.has('a') && c.has('c') && !c.has('b')).toBe(true)
    c.set('big', { n: 100 })
    expect(c.has('big')).toBe(false)
    c.deleteWhere((k) => k.startsWith('a'))
    expect(c.has('a')).toBe(false)
  })
  it('maps errors to honest user messages', () => {
    expect(toUserError({ name: 'PasswordException', code: 1 }).code).toBe('password-required')
    expect(toUserError({ name: 'PasswordException', code: 2 }).code).toBe('password-incorrect')
    expect(toUserError(new Error('Array buffer allocation failed')).code).toBe('memory')
    expect(toUserError(new Error('Invalid PDF structure')).message).toMatch(/Unable to read PDF/)
    expect(toUserError(new Error('Encrypted PDF not supported: ignoreEncryption')).message).toMatch(/Encrypted PDF is not supported/)
    expect(toUserError(new AppError('ocr', 'OCR failed')).code).toBe('ocr')
  })
})

describe('image filters', () => {
  const px = () => new Uint8ClampedArray([200, 100, 50, 255, 10, 20, 30, 255])
  it('reports whether any filter is active', () => {
    expect(hasFilters(DEFAULT_FILTERS)).toBe(false)
    expect(hasFilters({ ...DEFAULT_FILTERS, blur: 2 })).toBe(true)
    expect(cssFilter(DEFAULT_FILTERS)).toBeUndefined()
    expect(cssFilter({ ...DEFAULT_FILTERS, brightness: 1.2, grayscale: 1 })).toBe('brightness(1.2) grayscale(1)')
  })
  it('brightness scales, grayscale equalises channels, contrast spreads', () => {
    const a = px()
    applyFilters(a, 2, 1, { ...DEFAULT_FILTERS, brightness: 0.5 })
    expect(Array.from(a.slice(0, 3))).toEqual([100, 50, 25])
    const g = px()
    applyFilters(g, 2, 1, { ...DEFAULT_FILTERS, grayscale: 1 })
    expect(g[0]).toBe(g[1])
    expect(g[1]).toBe(g[2])
    const c = px()
    applyFilters(c, 2, 1, { ...DEFAULT_FILTERS, contrast: 2 })
    expect(c[0]).toBeGreaterThan(200 - 1)
    expect(c[3]).toBe(255) // alpha untouched
  })
  it('saturation 0 equals grayscale; blur softens an edge; sharpen keeps flat areas', () => {
    const s = px()
    applyFilters(s, 2, 1, { ...DEFAULT_FILTERS, saturation: 0 })
    expect(s[0]).toBe(s[1])
    const edge = new Uint8ClampedArray(4 * 5).fill(0)
    for (let i = 0; i < 5; i++) edge[i * 4 + 3] = 255
    edge[2 * 4] = 255
    applyFilters(edge, 5, 1, { ...DEFAULT_FILTERS, blur: 1 })
    expect(edge[2 * 4]).toBeLessThan(255)
    expect(edge[1 * 4]).toBeGreaterThan(0)
    const flat = new Uint8ClampedArray(4 * 9).fill(100)
    applyFilters(flat, 3, 3, { ...DEFAULT_FILTERS, sharpen: 1 })
    expect(flat[4 * 4]).toBe(100)
  })
})

describe('shape geometry', () => {
  it('returns closed paths for closed shapes, arrow heads for arrows', () => {
    const rect = createShape('p', 'l', 'rect', { x: 0, y: 0, w: 100, h: 50 })
    expect(shapeGeometry(rect).closed).toBe(true)
    expect(shapeGeometry(createShape('p', 'l', 'arrow', { x: 0, y: 0, w: 100, h: 50 })).heads).toHaveLength(1)
    expect(shapeGeometry(createShape('p', 'l', 'darrow', { x: 0, y: 0, w: 100, h: 50 })).heads).toHaveLength(2)
    expect(shapeGeometry(createShape('p', 'l', 'line', { x: 0, y: 0, w: 100, h: 50 })).heads).toHaveLength(0)
    expect(starPath(100, 100, 5).split('L').length).toBe(10)
    expect(dashArray('solid', 2)).toBeUndefined()
    expect(dashArray('dashed', 2)).toEqual([8, 5])
  })
})
