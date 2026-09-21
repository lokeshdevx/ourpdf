import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { assemble } from '@/engine/assemble'
import { baselineOffset, canEncodeText, initMeasurer, getMeasurer, registerMeasureFont, metricsFor } from '@/engine/fonts'
import { createText } from '@/lib/object-factory'
import { classifyFontName, stripSubsetPrefix } from '@/services/pdf/pdf-fonts'
import { basePlan, extractTexts, makePdf, pageModel, planPage } from '../helpers'

describe('font name classification', () => {
  it('strips subset prefixes', () => {
    expect(stripSubsetPrefix('HXAKGE+DejaVuSerif-Italic')).toBe('DejaVuSerif-Italic')
    expect(stripSubsetPrefix('Arial')).toBe('Arial')
  })
  it('maps names to the closest standard family and style', () => {
    expect(classifyFontName('ABCDEF+Arial-BoldMT')).toMatchObject({ family: 'helvetica', bold: true, italic: false, metricCompatible: true })
    expect(classifyFontName('TimesNewRomanPS-BoldItalicMT')).toMatchObject({ family: 'times', bold: true, italic: true, metricCompatible: true })
    expect(classifyFontName('CourierNewPSMT')).toMatchObject({ family: 'courier', metricCompatible: true })
    expect(classifyFontName('Helvetica-Oblique')).toMatchObject({ family: 'helvetica', italic: true })
    expect(classifyFontName('Calibri-Light')).toMatchObject({ family: 'helvetica', metricCompatible: false })
    expect(classifyFontName('Cambria')).toMatchObject({ family: 'times' })
    expect(classifyFontName('Consolas')).toMatchObject({ family: 'courier' })
    expect(classifyFontName('Georgia-Bold')).toMatchObject({ family: 'times', bold: true })
    expect(classifyFontName('UnknownFont', { serif: true })).toMatchObject({ family: 'times' })
    expect(classifyFontName('OpenSans-Regular', { serif: true })).toMatchObject({ family: 'helvetica' })
    expect(classifyFontName('SomeMono', {})).toMatchObject({ family: 'courier' })
  })
})

/** Extracts the real embedded font program from the Ghostscript fixture with pdf.js (what the app does). */
async function extractFonts() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync('e2e/fixtures/custom-fonts.pdf')), fontExtraProperties: true, verbosity: 0 })
  const doc = await task.promise
  const page = await doc.getPage(1)
  const tc = await page.getTextContent()
  await page.getOperatorList()
  const out: Record<string, { name: string; data: Uint8Array | undefined; missing: boolean }> = {}
  for (const it of tc.items) {
    if (!('str' in it) || !it.str) continue
    const f = page.commonObjs.get(it.fontName)
    out[it.str] = { name: f.name, data: f.data, missing: !!f.missingFile }
  }
  await task.destroy()
  return out
}

describe('exact PDF font reuse (engine)', () => {
  it('pdf.js exposes embedded programs for embedded fonts and flags non-embedded ones', async () => {
    const f = await extractFonts()
    expect(f['Exact Font Sample Line'].name).toMatch(/DejaVuSerif-Italic$/)
    expect(f['Exact Font Sample Line'].data!.length).toBeGreaterThan(1000)
    expect(f['Standard Times paragraph one'].missing).toBe(true)
  })

  it('registers real metrics and glyph coverage of the embedded subset', async () => {
    await initMeasurer()
    const f = (await extractFonts())['Exact Font Sample Line']
    const key = 'custom:test-serif'
    expect(await registerMeasureFont(key, f.data!)).toBe(true)
    expect(metricsFor(key).asc).toBeGreaterThan(0.5)
    expect(metricsFor(key)).not.toEqual(metricsFor('helvetica'))
    expect(baselineOffset(key, 20, 1.2)).toBeGreaterThan(0)
    // only the glyphs of the original text exist in the subset
    expect(await canEncodeText(key, false, false, 'Exact Font Line')).toBe(true)
    expect(await canEncodeText(key, false, false, 'Quiz')).toBe(false)
    // real advances are used for layout (differs from Helvetica)
    const m = getMeasurer()!
    expect(m(key, false, false, 20, 'Exact')).toBeCloseTo(45.54, 0)
    expect(m(key, false, false, 20, 'Exact')).not.toBeCloseTo(m('helvetica', false, false, 20, 'Exact'), 0)
  })

  it('exports replacement text with the same font program (name preserved in the output)', async () => {
    await initMeasurer()
    const f = (await extractFonts())['Exact Font Sample Line']
    const key = 'custom:pdf-test-serif-export'
    await registerMeasureFont(key, f.data!)
    const src = await makePdf(1)
    const p = pageModel('a', 0)
    const t = createText(p.id, 'l', { x: 72, y: 300, w: 300, h: 40 }, { text: 'Exact Font Line', font: key as never, fontSize: 24 })
    const plan = basePlan({ a: src }, [planPage(p, [t])], { fonts: { [key]: f.data! } })
    const bytes = await assemble(plan)
    const raw = new TextDecoder('latin1').decode(bytes)
    expect(raw).toMatch(/DejaVuSerif-Italic/)
    expect((await extractTexts(bytes))[0]).toContain('Exact Font Line')
    expect((await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount()).toBe(1)
  })

  it('embedding falls back to a full font when the subsetter fails (user-loaded TTF)', async () => {
    const ttf = new Uint8Array(readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
    const src = await makePdf(1)
    const p = pageModel('a', 0)
    const t = createText(p.id, 'l', { x: 72, y: 300, w: 300, h: 40 }, { text: 'Fallback embed works', font: 'custom:user-ttf' as never, fontSize: 20 })
    const bytes = await assemble(basePlan({ a: src }, [planPage(p, [t])], { fonts: { 'custom:user-ttf': ttf } }))
    expect((await extractTexts(bytes))[0]).toContain('Fallback embed works')
  })

  it('subsets without a space glyph: spaces are placed as advances, text still extracts with spaces', async () => {
    await initMeasurer()
    const f = (await extractFonts())['Bold Sans Heading Text']
    const key = 'custom:pdf-test-bold-nospace'
    await registerMeasureFont(key, f.data!)
    expect(await canEncodeText(key, false, false, 'Bold Sans Text')).toBe(true)
    expect(await canEncodeText(key, false, false, 'Bold Quiz')).toBe(false)
    const m = getMeasurer()!
    // no space glyph: the advance is estimated from the face (DejaVu Sans Bold ≈ 0.35 em)
    const gap = m(key, false, false, 20, 'a b') - m(key, false, false, 20, 'ab')
    expect(gap).toBeCloseTo(7, 0)
    const src = await makePdf(1)
    const p = pageModel('a', 0)
    const t = createText(p.id, 'l', { x: 72, y: 300, w: 300, h: 40 }, { text: 'Bold Sans Text', font: key as never, fontSize: 24 })
    const bytes = await assemble(basePlan({ a: src }, [planPage(p, [t])], { fonts: { [key]: f.data! } }))
    expect((await extractTexts(bytes))[0].replace(/\s+/g, ' ')).toContain('Bold Sans Text')
  })
})
