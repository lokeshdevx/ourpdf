import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { assemble, collectGarbage, safeUri } from '@/engine/assemble'
import { createField, createImage, createLink, createNote, createStamp, createInk, createMarkup, createPointShape } from '@/lib/object-factory'
import { basePlan, createShape, createText, makeFormPdf, makePdf, pageModel, planPage } from '../helpers'

const L = 'layer-default'

async function load(bytes: Uint8Array, password?: string) {
  return PDFDocument.load(bytes, { password: password ?? '', updateMetadata: false })
}

describe('assemble: page operations', () => {
  it('copies pages in the requested order and drops deleted ones', async () => {
    const src = await makePdf(5)
    const pages = [4, 0, 2].map((i) => pageModel('a', i))
    const out = await load(await assemble(basePlan({ a: src }, pages.map((p) => planPage(p)))))
    expect(out.getPageCount()).toBe(3)
  })

  it('merges pages from several sources', async () => {
    const a = await makePdf(2, { label: 'A' })
    const b = await makePdf(3, { label: 'B' })
    const plan = basePlan({ a, b }, [pageModel('a', 0), pageModel('b', 2), pageModel('a', 1), pageModel('b', 0)].map((p) => planPage(p)))
    const out = await load(await assemble(plan))
    expect(out.getPageCount()).toBe(4)
  })

  it('duplicates a page without sharing the page dictionary (rotating one leaves the other)', async () => {
    const src = await makePdf(1)
    const p1 = pageModel('a', 0, { rotation: 90 })
    const p2 = pageModel('a', 0, { rotation: 0 })
    const out = await load(await assemble(basePlan({ a: src }, [planPage(p1), planPage(p2)])))
    expect(out.getPage(0).getRotation().angle).toBe(90)
    expect(out.getPage(1).getRotation().angle).toBe(0)
  })

  it('adds blank pages of the requested size', async () => {
    const src = await makePdf(1)
    const blank = pageModel(null, 0, { width: 300, height: 400, view: [0, 0, 300, 400] })
    const out = await load(await assemble(basePlan({ a: src }, [planPage(pageModel('a', 0)), planPage(blank)])))
    expect(out.getPageCount()).toBe(2)
    expect(out.getPage(1).getSize()).toEqual({ width: 300, height: 400 })
  })

  it('combines intrinsic and user rotation', async () => {
    const src = await makePdf(1, { rotate: [90] })
    const p = pageModel('a', 0, { intrinsic: 90, width: 792, height: 612, view: [0, 0, 612, 792], rotation: 90 })
    const out = await load(await assemble(basePlan({ a: src }, [planPage(p)])))
    expect(out.getPage(0).getRotation().angle).toBe(180)
  })

  it('crops through MediaBox/CropBox (unrotated page)', async () => {
    const src = await makePdf(1)
    const p = pageModel('a', 0, { crop: { x: 100, y: 50, w: 300, h: 200 } })
    const out = await load(await assemble(basePlan({ a: src }, [planPage(p)])))
    const box = out.getPage(0).getCropBox()
    // base y-down: y 50..250  →  pdf y 792-250=542 .. 742
    expect(box).toEqual({ x: 100, y: 542, width: 300, height: 200 })
    expect(out.getPage(0).getMediaBox()).toEqual(box)
  })

  it('crops correctly on a page with intrinsic /Rotate 90', async () => {
    const src = await makePdf(1, { rotate: [90] })
    // displayed size 792x612; view box of the source is [0,0,612,792]
    const p = pageModel('a', 0, { intrinsic: 90, width: 792, height: 612, view: [0, 0, 612, 792], crop: { x: 0, y: 0, w: 200, h: 100 } })
    const out = await load(await assemble(basePlan({ a: src }, [planPage(p)])))
    const b = out.getPage(0).getCropBox()
    // display top-left (0,0) ↔ pdf (x0, y0); width along pdf y, height along pdf x
    expect(b).toEqual({ x: 0, y: 0, width: 100, height: 200 })
  })

  it('adds margins by enlarging the boxes when scale is 1', async () => {
    const src = await makePdf(1)
    const p = pageModel('a', 0, { frame: { w: 712, h: 892, x: 50, y: 50, s: 1 } })
    const out = await load(await assemble(basePlan({ a: src }, [planPage(p)])))
    expect(out.getPage(0).getMediaBox()).toEqual({ x: -50, y: -50, width: 712, height: 892 })
  })

  it('resizes with scaling through page embedding', async () => {
    const src = await makePdf(1)
    const p = pageModel('a', 0, { frame: { w: 306, h: 396, x: 0, y: 0, s: 0.5 } })
    const out = await load(await assemble(basePlan({ a: src }, [planPage(p)])))
    expect(out.getPageCount()).toBe(1)
    expect(out.getPage(0).getSize()).toEqual({ width: 306, height: 396 })
  })
})

describe('assemble: objects', () => {
  it('draws every object type without error', async () => {
    const src = await makePdf(1)
    const p = pageModel('a', 0)
    const objs = [
      createText(p.id, L, { x: 50, y: 50, w: 200, h: 60 }, { text: 'Hello world, this is a long line that wraps', bold: true, underline: true, align: 'justify', list: 'bullet' }),
      createText(p.id, L, { x: 50, y: 150, w: 200, h: 60 }, { text: 'Callout', border: { color: '#000000', width: 1 }, callout: [1.4, 1.5], radius: 6, bg: '#ffff99', rotation: 15 }),
      createText(p.id, L, { x: 300, y: 50, w: 200, h: 60 }, { text: 'Auto fit', autoFit: true }),
      createShape(p.id, L, 'rect', { x: 10, y: 300, w: 100, h: 60 }, { fill: '#ff0000' }),
      createShape(p.id, L, 'ellipse', { x: 120, y: 300, w: 100, h: 60 }, { dash: 'dashed' }),
      createShape(p.id, L, 'star', { x: 230, y: 300, w: 80, h: 80 }, { fill: '#ffcc00' }),
      createShape(p.id, L, 'cloud', { x: 330, y: 300, w: 100, h: 80 }),
      createShape(p.id, L, 'arrow', { x: 10, y: 420, w: 100, h: 40 }),
      createShape(p.id, L, 'darrow', { x: 130, y: 420, w: 100, h: 40 }),
      createPointShape(p.id, L, 'polygon', [[300, 420], [360, 420], [330, 480]], { fill: '#00ff00' }),
      createPointShape(p.id, L, 'path', [[20, 500], [80, 540], [140, 500], [200, 540]]),
      createInk(p.id, L, [[10, 600], [50, 620], [90, 590], [130, 630]], 'pen', '#0000ff', 3),
      createInk(p.id, L, [[10, 650], [200, 650]], 'marker', '#ffee00', 14, 0.4),
      createMarkup(p.id, L, 'highlight', '#ffee00', [{ x: 72, y: 60, w: 100, h: 14 }]),
      createMarkup(p.id, L, 'squiggly', '#ff0000', [{ x: 72, y: 90, w: 100, h: 14 }]),
      createMarkup(p.id, L, 'underline', '#00aa00', [{ x: 72, y: 110, w: 100, h: 14 }]),
      createMarkup(p.id, L, 'strike', '#aa0000', [{ x: 72, y: 130, w: 100, h: 14 }]),
      createStamp(p.id, L, { x: 400, y: 600, w: 160, h: 50 }, { label: 'APPROVED', showDate: true, rotation: -12 }),
      createNote(p.id, L, 500, 20, { text: 'Please review', author: 'Ann' }),
      createLink(p.id, L, { x: 72, y: 60, w: 100, h: 14 }, { kind: 'url', url: 'https://example.com' }),
    ]
    const bytes = await assemble(basePlan({ a: src }, [planPage(p, objs)]))
    const out = await load(bytes)
    const annots = out.getPage(0).node.Annots()
    expect(annots?.size()).toBe(2) // link + note
    expect(bytes.length).toBeGreaterThan(src.length)
  })

  it('embeds images and text rasters', async () => {
    const src = await makePdf(1)
    const p = pageModel('a', 0)
    // 1x1 PNG
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
    const img = createImage(p.id, L, { x: 10, y: 10, w: 100, h: 100 }, 'asset1', { flipH: true, rotation: 30, opacity: 0.5 })
    const txt = createText(p.id, L, { x: 200, y: 10, w: 100, h: 30 }, { text: 'Ünïcode → ✓' })
    const plan = basePlan({ a: src }, [planPage(p, [img, txt])], { images: { k1: { bytes: png, mime: 'image/png' } }, imageKeys: { [img.id]: 'k1' }, textRasters: { [txt.id]: { bytes: png, width: 1, height: 1 } } })
    const out = await load(await assemble(plan))
    expect(out.getPageCount()).toBe(1)
  })

  it('a redact object paints a rectangle and optional label', async () => {
    const src = await makePdf(1)
    const p = pageModel('a', 0)
    const objs = [{ ...createShape(p.id, L, 'rect', { x: 0, y: 0, w: 1, h: 1 }), type: 'redact', color: '#000000', reason: '', overlayText: 'REDACTED', x: 72, y: 60, w: 120, h: 24 } as never]
    const out = await load(await assemble(basePlan({ a: src }, [planPage(p, objs)])))
    expect(out.getPageCount()).toBe(1)
  })
})

describe('assemble: forms', () => {
  it('creates all field types', async () => {
    const src = await makePdf(1)
    const p = pageModel('a', 0)
    const f = (t: Parameters<typeof createField>[0], y: number, over = {}) => createField(t, p.id, L, { x: 50, y }, { fieldName: `${t}_1`, ...over })
    const fields = [
      f('text', 20, { value: 'hi', required: true, tooltip: 'Your name' }),
      f('checkbox', 60, { value: true }),
      f('radio', 90, { fieldName: 'grp', exportValue: 'A', value: true }),
      f('radio', 110, { fieldName: 'grp', exportValue: 'B' }),
      f('dropdown', 140, { options: ['x', 'y'], value: 'y' }),
      f('listbox', 180, { options: ['p', 'q'] }),
      f('button', 260, { label: 'Send' }),
      f('date', 300),
      f('signature', 340),
    ]
    const out = await load(await assemble(basePlan({ a: src }, [planPage(p, fields)])))
    const form = out.getForm()
    const names = form.getFields().map((x) => x.getName()).sort()
    expect(names).toEqual(expect.arrayContaining(['text_1', 'checkbox_1', 'grp', 'dropdown_1', 'listbox_1', 'button_1', 'date_1', 'signature_1']))
    expect(form.getTextField('text_1').getText()).toBe('hi')
    expect(form.getCheckBox('checkbox_1').isChecked()).toBe(true)
    expect(form.getRadioGroup('grp').getSelected()).toBe('A')
    expect(form.getDropdown('dropdown_1').getSelected()).toEqual(['y'])
  })

  it('flattens forms into page content', async () => {
    const src = await makePdf(1)
    const p = pageModel('a', 0)
    const tf = createField('text', p.id, L, { x: 50, y: 20 }, { fieldName: 't', value: 'flat' })
    const plan = basePlan({ a: src }, [planPage(p, [tf])])
    plan.options.flattenForms = true
    const out = await load(await assemble(plan))
    expect(out.getForm().getFields()).toHaveLength(0)
  })

  it('applies edited values to an existing form and keeps it fillable', async () => {
    const src = await makeFormPdf()
    const p = pageModel('a', 0)
    const objs = [
      { ...createField('text', p.id, L, { x: 50, y: 68 }), fieldName: 'name', native: true, value: 'Bob' },
      { ...createField('checkbox', p.id, L, { x: 50, y: 126 }), fieldName: 'agree', native: true, value: true },
    ]
    const out = await load(await assemble(basePlan({ a: src }, [planPage(p, objs)])))
    const form = out.getForm()
    expect(form.getTextField('name').getText()).toBe('Bob')
    expect(form.getCheckBox('agree').isChecked()).toBe(true)
  })

  it('removes deleted native fields', async () => {
    const src = await makeFormPdf()
    const p = pageModel('a', 0)
    const objs = [{ ...createField('text', p.id, L, { x: 50, y: 68 }), fieldName: 'name', native: true, value: 'Bob' }]
    const plan = basePlan({ a: src }, [planPage(p, objs)], { removedFields: [{ sourceId: 'a', name: 'agree' }] })
    const out = await load(await assemble(plan))
    expect(out.getForm().getFields().map((f) => f.getName())).toEqual(['name'])
  })

  it('flattens the source form when merging several documents', async () => {
    const a = await makeFormPdf()
    const b = await makePdf(1)
    const plan = basePlan({ a, b }, [planPage(pageModel('a', 0)), planPage(pageModel('b', 0))])
    const out = await load(await assemble(plan))
    expect(out.getPageCount()).toBe(2)
    expect(out.getForm().getFields()).toHaveLength(0)
  })
})

describe('assemble: document structures', () => {
  it('writes bookmarks, page labels, attachments and metadata', async () => {
    const src = await makePdf(3)
    const pages = [0, 1, 2].map((i) => planPage(pageModel('a', i)))
    const plan = basePlan({ a: src }, pages, {
      bookmarks: [{ title: 'Chapter 1', pageIndex: 0, y: 0, children: [{ title: 'Section', pageIndex: 1, y: 100, children: [] }] }, { title: 'Chapter 2', pageIndex: 2, y: 0, children: [] }],
      pageLabels: [{ from: 0, style: 'roman', prefix: '', start: 1 }, { from: 1, style: 'decimal', prefix: 'A-', start: 1 }],
      attachments: [{ name: 'note.txt', bytes: new TextEncoder().encode('hello') }],
      metadata: { title: 'My Title', author: 'Me', subject: 'S', keywords: 'a, b', creator: 'C', producer: '', creationDate: '2020-01-02T00:00:00.000Z', modificationDate: null },
    })
    const out = await load(await assemble(plan))
    expect(out.getTitle()).toBe('My Title')
    expect(out.getAuthor()).toBe('Me')
    expect(out.getKeywords()).toBe('a b')
    const outlines = out.catalog.lookup(PDFName.of('Outlines'), PDFDict)
    expect(outlines.get(PDFName.of('Count'))?.toString()).toBe('3')
    const labels = out.catalog.lookup(PDFName.of('PageLabels'), PDFDict)
    expect(labels.lookup(PDFName.of('Nums'), PDFArray).size()).toBe(4)
    expect(out.catalog.has(PDFName.of('Names'))).toBe(true)
  })

  it('removes metadata when requested', async () => {
    const src = await makePdf(1)
    const plan = basePlan({ a: src }, [planPage(pageModel('a', 0))], { removeMetadata: true, metadata: { title: 'secret', author: 'x', subject: '', keywords: '', creator: '', producer: '', creationDate: null, modificationDate: null } })
    const out = await load(await assemble(plan))
    expect(out.getTitle()).toBeUndefined()
    expect(out.getAuthor()).toBeUndefined()
    expect(out.getProducer()).toBeUndefined()
  })

  it('encrypts with AES-256 and requires the password', async () => {
    const src = await makePdf(2)
    const plan = basePlan({ a: src }, [planPage(pageModel('a', 0)), planPage(pageModel('a', 1))])
    plan.options.security = { userPassword: 'open-sesame', ownerPassword: 'owner', allowPrint: false, allowCopy: false, allowModify: false, allowAnnotate: false }
    const bytes = await assemble(plan)
    await expect(PDFDocument.load(bytes)).rejects.toThrow(/encrypt/i)
    const ok = await PDFDocument.load(bytes, { password: 'open-sesame' })
    expect(ok.getPageCount()).toBe(2)
    await expect(PDFDocument.load(bytes, { password: 'wrong' })).rejects.toThrow()
  })

  it('opens a password protected source when the password is supplied and outputs an unprotected file', async () => {
    const plain = await makePdf(2)
    const protectedDoc = await PDFDocument.load(plain)
    protectedDoc.encrypt({ userPassword: 'pw', ownerPassword: 'ow' })
    const enc = await protectedDoc.save()
    const plan = basePlan({}, [planPage(pageModel('a', 0)), planPage(pageModel('a', 1))])
    plan.sources = { a: { bytes: enc, password: 'pw' } }
    const out = await PDFDocument.load(await assemble(plan))
    expect(out.getPageCount()).toBe(2)
  })

  it('garbage-collects objects orphaned by deleted pages (nothing of a deleted page survives)', async () => {
    const doc = await PDFDocument.create()
    for (let i = 0; i < 6; i++) doc.addPage().drawText(`UNIQUE-SECRET-MARKER-${i}`, { x: 10, y: 10 })
    const src = await doc.save({ useObjectStreams: false })
    const plan = basePlan({ a: src }, [planPage(pageModel('a', 0))])
    const out = await assemble(plan)
    const text = new TextDecoder('latin1').decode(out)
    expect(text).not.toContain('MARKER-3')
    const outDoc = await load(out)
    expect(outDoc.getPageCount()).toBe(1)
    // in-place path (forms) must also purge deleted pages
    const formDoc = await PDFDocument.create()
    for (let i = 0; i < 3; i++) formDoc.addPage()
    formDoc.getPage(2).drawText('IN-PLACE-SECRET', { x: 10, y: 10 })
    const tf = formDoc.getForm().createTextField('f')
    tf.addToPage(formDoc.getPage(0), { x: 10, y: 10, width: 100, height: 20 })
    const formSrc = await formDoc.save({ useObjectStreams: false })
    const outForm = await assemble(basePlan({ a: formSrc }, [planPage(pageModel('a', 0))]))
    expect(new TextDecoder('latin1').decode(outForm)).not.toContain('IN-PLACE-SECRET')
    expect((await load(outForm)).getForm().getFields()).toHaveLength(1)
  })

  it('collectGarbage returns the count of removed objects', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.context.register(doc.context.obj({ Orphan: true }))
    expect(collectGarbage(doc)).toBeGreaterThanOrEqual(1)
  })

  it('draws invisible searchable text over rasters', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
    const p = pageModel(null, 0, { width: 200, height: 100, view: [0, 0, 200, 100] })
    const plan = basePlan({}, [planPage(p, [], { raster: { bytes: png, mime: 'image/png', width: 1, height: 1 }, invisibleText: [{ text: 'Searchable words', x: 10, y: 10, w: 100, h: 12 }] })])
    const bytes = await assemble(plan)
    const out = await load(bytes)
    expect(out.getPageCount()).toBe(1)
  })

  it('rejects an empty plan with a clear message', async () => {
    await expect(assemble(basePlan({}, []))).rejects.toThrow(/no pages/i)
  })
})

describe('safeUri', () => {
  it('only allows http, https, mailto and tel', () => {
    expect(safeUri('https://a.com')).toBe('https://a.com')
    expect(safeUri('javascript:alert(1)')).toBeNull()
    expect(safeUri('data:text/html,hi')).toBeNull()
    expect(safeUri('me@a.com')).toBe('mailto:me@a.com')
    expect(safeUri('example.com/x')).toBe('https://example.com/x')
    expect(safeUri('file:///etc/passwd')).toBeNull()
  })
})

export { createStamp }

describe('font encodability', () => {
  it('reports non-WinAnsi characters as unencodable (pdf-lib silently substitutes them)', async () => {
    const { PDFDocument: D, StandardFonts } = await import('pdf-lib')
    const { canEncode, sanitizeForFont } = await import('@/engine/fonts')
    const doc = await D.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    expect(canEncode(font, 'Hello, café – “quotes” €')).toBe(true)
    expect(canEncode(font, 'line\nbreak\ttab')).toBe(true)
    expect(canEncode(font, 'Привет')).toBe(false)
    expect(canEncode(font, '你好')).toBe(false)
    expect(canEncode(font, '→')).toBe(false)
    expect(sanitizeForFont(font, 'ab你c→d')).toBe('abcd')
  })
})
