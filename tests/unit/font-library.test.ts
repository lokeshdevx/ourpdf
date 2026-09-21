import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { FONT_LIBRARY, libKey, matchLibraryFont, parseLibKey, pickFace, libFamily, weightFromName } from '@/lib/font-library'
import { woffToSfnt } from '@/utils/woff'

describe('font library matching', () => {
  const m = (n: string) => {
    const r = matchLibraryFont(n)
    return r && `${r.family.id} ${r.weight}${r.italic ? 'i' : 'n'}`
  }
  it('maps proprietary faces to their metric-compatible / same-family bundled fonts', () => {
    expect(m('ABCDEF+Calibri')).toBe('carlito 400n')
    expect(m('Calibri-BoldItalic')).toBe('carlito 700i')
    expect(m('Cambria')).toBe('caladea 400n')
    expect(m('Georgia-Bold')).toBe('gelasio 700n')
    expect(m('Verdana')).toBe('dejavu-sans 400n')
    expect(m('SegoeUI')).toBe('open-sans 400n')
    expect(m('LiberationSans-Bold-1234')).toBe('arimo 700n')
  })
  it('finds Google families by name, longest match first, with the right weight', () => {
    expect(m('Roboto-Medium')).toBe('roboto 500n')
    expect(m('RobotoSlab-Bold')).toBe('roboto-slab 700n')
    expect(m('RobotoMono-Regular')).toBe('roboto-mono 400n')
    expect(m('OpenSans-SemiBold')).toBe('open-sans 600n')
    expect(m('SourceSansPro-Italic')).toBe('source-sans-3 400i')
    expect(m('Montserrat-Bold')).toBe('montserrat 700n')
    expect(m('Lato-Light')).toBe('lato 300n')
    expect(m('PlayfairDisplay-Regular')).toBe('playfair-display 400n')
    expect(m('NotoSansMono')).toBe('noto-sans-mono 400n')
  })
  it('returns null for unknown fonts', () => {
    expect(matchLibraryFont('TotallyUnknownGrotesk-Regular')).toBeNull()
    expect(matchLibraryFont('')).toBeNull()
  })
  it('weights: Black/Heavy map to the heaviest shipped weight; picks nearest available face', () => {
    expect(weightFromName('Foo-Black')).toBe(700)
    expect(weightFromName('Foo-Thin')).toBe(300)
    const carlito = libFamily('carlito')!
    expect(pickFace(carlito, 500, false)).toEqual({ weight: 400, italic: false }) // only 400/700 shipped: ties go heavier
    expect(pickFace(carlito, 300, true)).toEqual({ weight: 400, italic: true })
    const bitter = libFamily('bitter')!
    expect(pickFace(bitter, 700, true).italic).toBe(true)
  })
  it('keys round-trip', () => {
    expect(parseLibKey(libKey('roboto-slab', 700, true))).toEqual({ id: 'roboto-slab', weight: 700, italic: true })
    expect(parseLibKey('custom:pdf-abc')).toBeNull()
  })
  it('ships a broad, consistent library', () => {
    expect(FONT_LIBRARY.length).toBeGreaterThanOrEqual(50)
    for (const f of FONT_LIBRARY) expect(f.faces.some((x) => x.startsWith('400'))).toBe(true)
  })
})

describe('WOFF unwrapping', () => {
  it('turns a bundled WOFF into an sfnt that fontkit and pdf-lib can embed', async () => {
    const woff = new Uint8Array(readFileSync('node_modules/@fontsource/roboto/files/roboto-latin-500-normal.woff'))
    const sfnt = await woffToSfnt(woff)
    expect(String.fromCharCode(...sfnt.slice(0, 4))).toBe('\u0000\u0001\u0000\u0000')
    const f = fontkit.create(sfnt as never) as unknown as { familyName: string; unitsPerEm: number }
    expect(f.familyName).toMatch(/Roboto/)
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    const font = await doc.embedFont(sfnt, { subset: false })
    expect(font.widthOfTextAtSize('Hello', 20)).toBeGreaterThan(30)
    expect((await doc.save()).length).toBeGreaterThan(sfnt.length / 2)
  })
  it('rejects non-WOFF input', async () => {
    await expect(woffToSfnt(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).rejects.toThrow(/WOFF/)
  })
})
