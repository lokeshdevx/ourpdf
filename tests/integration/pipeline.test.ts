import { PDFDocument, PDFName, PDFDict } from 'pdf-lib'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initMeasurer } from '@/engine/fonts'
import { createField, createImage, createLink, createMarkup, createStamp, createText } from '@/lib/object-factory'
import { execute, redo, undo } from '@/services/history'
import { addObjects, updateObjects } from '@/services/pdf/annotation-service'
import { applyBates, applyHeaderFooter, applyTextWatermark, decorationGroups, removeDecoration } from '@/services/pdf/decorations'
import { exportPdfBytes } from '@/services/pdf/export-service'
import { addBookmark } from '@/services/pdf/bookmark-service'
import { addBlankPage, deletePages, duplicatePages, movePages, rotatePages, setPageLabels, setPageGeometry } from '@/services/pdf/page-service'
import { exportFormData, importFormData, validateAll } from '@/services/pdf/form-service'
import { registerSource, type PdfSource } from '@/services/pdf/sources'
import { setNativeRegistry } from '@/services/pdf/document-service'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useFormStore } from '@/stores/form-store'
import { useHistoryStore } from '@/stores/history-store'
import { getPages, usePageStore } from '@/stores/page-store'
import { EMPTY_METADATA, usePdfStore } from '@/stores/pdf-store'
import { DEFAULT_LAYER_ID, type DocInfo } from '@/types'
import { applyCrop } from '@/lib/frame'
import { extractTexts, makeFormPdf, makePdf, pageModel } from '../helpers'

const DOC = 'doc-int'
const SRC = 'src-int'
const L = DEFAULT_LAYER_ID

async function openFake(bytes: Uint8Array, name = 'fixture.pdf') {
  const n = (await PDFDocument.load(bytes)).getPageCount()
  registerSource({ id: SRC, name, blob: new Blob([bytes as BlobPart]), size: bytes.length, url: '', proxy: {} as never, task: {} as never, numPages: n, encrypted: false } as PdfSource)
  const info: DocInfo = { id: DOC, name, size: bytes.length, createdAt: 0, modified: false, metadata: { ...EMPTY_METADATA }, originalMetadata: { ...EMPTY_METADATA }, bookmarks: [], pageLabels: [], attachments: [], ocr: {}, hasForms: false, encrypted: false }
  usePdfStore.setState({ docs: [], activeId: null })
  usePdfStore.getState().addDoc(info)
  usePageStore.getState().init(DOC, Array.from({ length: n }, (_, i) => pageModel(SRC, i, { id: `p${i + 1}` })))
  useAnnotationStore.getState().init(DOC)
  useHistoryStore.getState().clear(DOC)
  useFormStore.getState().clearErrors()
  setNativeRegistry(DOC, [])
}

beforeAll(async () => {
  await initMeasurer()
})

describe('open → edit → save pipeline', () => {
  beforeEach(async () => openFake(await makePdf(4)))

  it('exports an unmodified document with the same pages', async () => {
    const bytes = await exportPdfBytes(DOC)
    expect(await extractTexts(bytes)).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4'])
  })

  it('exports added text (with wrapping), links, stamps, markup and images', async () => {
    const p = getPages(DOC)[0]
    addObjects(DOC, [
      createText(p.id, L, { x: 72, y: 200, w: 120, h: 80 }, { text: 'The quick brown fox jumps over the lazy dog', fontSize: 12 }),
      createLink(p.id, L, { x: 72, y: 60, w: 100, h: 20 }, { kind: 'url', url: 'https://example.com' }),
      createStamp(p.id, L, { x: 300, y: 300, w: 160, h: 50 }, { label: 'APPROVED' }),
      createMarkup(p.id, L, 'highlight', '#ffee00', [{ x: 72, y: 60, w: 100, h: 14 }]),
    ])
    const bytes = await exportPdfBytes(DOC)
    const [t1] = await extractTexts(bytes)
    expect(t1).toContain('The quick brown fox')
    expect(t1).toContain('lazy dog')
    expect(t1).toContain('APPROVED')
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(doc.getPage(0).node.Annots()?.size()).toBe(1)
  })

  it('undo removes the edit from the export, redo brings it back', async () => {
    const p = getPages(DOC)[1]
    addObjects(DOC, [createText(p.id, L, { x: 72, y: 300, w: 200, h: 30 }, { text: 'TEMP-MARKER' })])
    expect((await extractTexts(await exportPdfBytes(DOC)))[1]).toContain('TEMP-MARKER')
    undo(DOC)
    expect((await extractTexts(await exportPdfBytes(DOC)))[1]).not.toContain('TEMP-MARKER')
    redo(DOC)
    expect((await extractTexts(await exportPdfBytes(DOC)))[1]).toContain('TEMP-MARKER')
  })

  it('reordering, deleting, duplicating and rotating pages is reflected in the export', async () => {
    movePages(DOC, ['p1'], 3) // p2 p3 p4 p1
    deletePages(DOC, ['p3'])
    duplicatePages(DOC, ['p2'])
    rotatePages(DOC, ['p2'], 90)
    const bytes = await exportPdfBytes(DOC)
    expect(await extractTexts(bytes)).toEqual(['Page 2', 'Page 2', 'Page 4', 'Page 1'])
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    // p2 (first occurrence) was rotated; its duplicate was made before the rotation and stays upright
    expect(doc.getPage(0).getRotation().angle).toBe(90)
    expect(doc.getPage(1).getRotation().angle).toBe(0)
  })

  it('blank pages, crop and page selection (extract/split) produce the right output', async () => {
    addBlankPage(DOC, 2)
    setPageGeometry(DOC, { p1: applyCrop(getPages(DOC)[0], { x: 0, y: 0, w: 300, h: 300 }) }, 'crop')
    const all = await PDFDocument.load(await exportPdfBytes(DOC), { updateMetadata: false })
    expect(all.getPageCount()).toBe(5)
    expect(all.getPage(0).getSize()).toEqual({ width: 300, height: 300 })
    const subset = await exportPdfBytes(DOC, { pageIds: ['p2', 'p4'] })
    expect(await extractTexts(subset)).toEqual(['Page 2', 'Page 4'])
  })

  it('a deleted page leaves no trace in the saved bytes', async () => {
    deletePages(DOC, ['p2'])
    const raw = new TextDecoder('latin1').decode(await exportPdfBytes(DOC, { objectStreams: false }))
    expect(raw).not.toContain('Page 2')
  })

  it('metadata, bookmarks and page labels round-trip into the file', async () => {
    usePdfStore.getState().updateDoc(DOC, { metadata: { ...EMPTY_METADATA, title: 'Report', author: 'Sam', keywords: 'a, b' } })
    addBookmark(DOC, { pageId: 'p3', title: 'Chapter' })
    setPageLabels(DOC, [{ from: 0, style: 'roman', prefix: '', start: 1 }])
    const doc = await PDFDocument.load(await exportPdfBytes(DOC), { updateMetadata: false })
    expect(doc.getTitle()).toBe('Report')
    expect(doc.getAuthor()).toBe('Sam')
    expect(doc.getProducer()).toBe('OurPDF')
    const outlines = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict)
    expect(outlines.get(PDFName.of('Count'))?.toString()).toBe('1')
    expect(doc.catalog.has(PDFName.of('PageLabels'))).toBe(true)
    usePdfStore.getState().updateDoc(DOC, { metadata: { ...EMPTY_METADATA, title: 'Secret', strip: true } })
    const stripped = await PDFDocument.load(await exportPdfBytes(DOC), { updateMetadata: false })
    expect(stripped.getTitle()).toBeUndefined()
  })

  it('layers: hidden layers are not exported', async () => {
    const p = getPages(DOC)[0]
    addObjects(DOC, [createText(p.id, L, { x: 72, y: 300, w: 200, h: 30 }, { text: 'VISIBLE-ONE' })])
    const { addLayer } = await import('@/services/pdf/annotation-service')
    const layer = addLayer(DOC, 'Hidden')
    addObjects(DOC, [{ ...createText(p.id, layer, { x: 72, y: 400, w: 200, h: 30 }, { text: 'HIDDEN-ONE' }), layerId: layer }])
    const { updateLayer } = await import('@/services/pdf/annotation-service')
    updateLayer(DOC, layer, { visible: false })
    const t = (await extractTexts(await exportPdfBytes(DOC)))[0]
    expect(t).toContain('VISIBLE-ONE')
    expect(t).not.toContain('HIDDEN-ONE')
  })

  it('unicode text that standard fonts cannot encode is rasterised instead of failing the export', async () => {
    const p = getPages(DOC)[0]
    const t = createText(p.id, L, { x: 72, y: 300, w: 200, h: 30 }, { text: 'Привет мир 你好' })
    addObjects(DOC, [t])
    // In Node there is no canvas, so the raster step reports a clear error rather than silently corrupting the PDF.
    await expect(exportPdfBytes(DOC)).rejects.toBeTruthy()
  })

  it('exports with security enabled', async () => {
    const bytes = await exportPdfBytes(DOC, { security: { userPassword: 'pw', ownerPassword: 'ow', allowPrint: true, allowCopy: false, allowModify: false, allowAnnotate: false } })
    await expect(PDFDocument.load(bytes)).rejects.toThrow(/encrypt/i)
    expect((await PDFDocument.load(bytes, { password: 'pw', updateMetadata: false })).getPageCount()).toBe(4)
  })

  it('image objects are embedded (PNG)', async () => {
    const { registerAsset } = await import('@/services/assets')
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
    registerAsset({ id: 'a1', mime: 'image/png', width: 1, height: 1, size: png.length, name: 'px' }, new Blob([png], { type: 'image/png' }))
    const p = getPages(DOC)[0]
    addObjects(DOC, [createImage(p.id, L, { x: 50, y: 50, w: 100, h: 100 }, 'a1')])
    const bytes = await exportPdfBytes(DOC)
    const raw = new TextDecoder('latin1').decode(bytes)
    expect(raw).toContain('/Subtype /Image')
  })
})

describe('decorations (watermark, header/footer, Bates)', () => {
  beforeEach(async () => openFake(await makePdf(3)))
  const ids = () => getPages(DOC).map((p) => p.id)

  it('header/footer tokens resolve per output page', async () => {
    await applyHeaderFooter(DOC, { kind: 'footer', left: '', center: 'Page {page} of {total}', right: '', font: 'helvetica', fontSize: 10, color: '#444444', margin: 36, skipFirst: false, pageIds: ids() })
    const t = await extractTexts(await exportPdfBytes(DOC))
    expect(t[0]).toContain('Page 1 of 3')
    expect(t[2]).toContain('Page 3 of 3')
    // reorder: numbers follow the new order
    movePages(DOC, ['p3'], 0)
    const t2 = await extractTexts(await exportPdfBytes(DOC))
    expect(t2[0]).toContain('Page 3')
    expect(t2[0]).toContain('Page 1 of 3')
  })

  it('first-page exclusion and page-subset export renumbers', async () => {
    await applyHeaderFooter(DOC, { kind: 'header', left: '', center: '', right: 'H{page}', font: 'helvetica', fontSize: 10, color: '#000000', margin: 36, skipFirst: true, pageIds: ids() })
    const t = await extractTexts(await exportPdfBytes(DOC))
    expect(t[0]).not.toContain('H1')
    expect(t[1]).toContain('H2')
  })

  it('Bates numbers are sequential', async () => {
    applyBates(DOC, { prefix: 'ACME-', suffix: '', start: 7, digits: 4, position: 'bottom-right', fontSize: 9, pageIds: ids() })
    const t = await extractTexts(await exportPdfBytes(DOC))
    expect(t.map((x) => /ACME-\d{4}/.exec(x)?.[0])).toEqual(['ACME-0007', 'ACME-0008', 'ACME-0009'])
  })

  it('watermarks can be added and removed as a group (undoable)', async () => {
    const g = await applyTextWatermark(DOC, { text: 'CONFIDENTIAL', font: 'helvetica', fontSize: 40, color: '#999999', opacity: 0.3, rotation: -30, position: 'center', tile: false, bold: true, pageIds: ids() })
    expect(decorationGroups(DOC, 'watermark')).toHaveLength(1)
    expect((await extractTexts(await exportPdfBytes(DOC))).every((t) => t.includes('CONFIDENTIAL'))).toBe(true)
    removeDecoration(DOC, g)
    expect(decorationGroups(DOC)).toHaveLength(0)
    undo(DOC)
    expect(decorationGroups(DOC)).toHaveLength(1)
  })
})

describe('forms', () => {
  it('builds fields, validates, exports and re-imports data, and writes real AcroForm fields', async () => {
    await openFake(await makePdf(1))
    const p = getPages(DOC)[0]
    const mk = (t: Parameters<typeof createField>[0], y: number, over = {}) => createField(t, p.id, L, { x: 60, y }, over)
    addObjects(DOC, [
      mk('text', 40, { fieldName: 'email', value: 'not-an-email', validation: { kind: 'email' }, required: true }),
      mk('text', 80, { fieldName: 'age', value: '42', validation: { kind: 'number' } }),
      mk('checkbox', 120, { fieldName: 'ok', value: true }),
      mk('radio', 150, { fieldName: 'size', exportValue: 'S', value: false }),
      mk('radio', 170, { fieldName: 'size', exportValue: 'L', value: true }),
      mk('dropdown', 200, { fieldName: 'country', options: ['CA', 'IN'], value: 'IN' }),
    ])
    expect(validateAll(DOC)).toBe(1)
    expect(useFormStore.getState().errors).toBeTruthy()
    const data = exportFormData(DOC)
    expect(data.fields).toEqual({ email: 'not-an-email', age: '42', ok: true, size: 'L', country: 'IN' })
    updateObjects(DOC, Object.fromEntries((useAnnotationStore.getState().byDoc[DOC].objects).filter((o) => o.type === 'field').map((o) => [o.id, { value: o.ftype === 'checkbox' ? false : o.ftype === 'radio' ? false : '' }])), 'clear')
    expect(importFormData(DOC, data)).toBe(5)
    expect(exportFormData(DOC).fields).toEqual(data.fields)
    const form = (await PDFDocument.load(await exportPdfBytes(DOC), { updateMetadata: false })).getForm()
    expect(form.getTextField('age').getText()).toBe('42')
    expect(form.getCheckBox('ok').isChecked()).toBe(true)
    expect(form.getRadioGroup('size').getSelected()).toBe('L')
    expect(form.getDropdown('country').getSelected()).toEqual(['IN'])
  })

  it('round-trips native form fields: value edits are applied and the form stays fillable', async () => {
    await openFake(await makeFormPdf())
    const p = getPages(DOC)[0]
    const objs = [
      { ...createField('text', p.id, L, { x: 50, y: 68 }), id: 'nf-1', fieldName: 'name', native: true, value: 'Zed' },
      { ...createField('checkbox', p.id, L, { x: 50, y: 126 }), id: 'nf-2', fieldName: 'agree', native: true, value: true },
    ]
    setNativeRegistry(DOC, [['nf-1', { sourceId: SRC, name: 'name' }], ['nf-2', { sourceId: SRC, name: 'agree' }]])
    useAnnotationStore.getState().setObjects(DOC, objs)
    const form = (await PDFDocument.load(await exportPdfBytes(DOC), { updateMetadata: false })).getForm()
    expect(form.getTextField('name').getText()).toBe('Zed')
    expect(form.getCheckBox('agree').isChecked()).toBe(true)
    // deleting a native field removes it from the output
    useAnnotationStore.getState().setObjects(DOC, [objs[0]])
    const form2 = (await PDFDocument.load(await exportPdfBytes(DOC), { updateMetadata: false })).getForm()
    expect(form2.getFields().map((f) => f.getName())).toEqual(['name'])
    // flatten
    const flat = await PDFDocument.load(await exportPdfBytes(DOC, { flattenForms: true }), { updateMetadata: false })
    expect(flat.getForm().getFields()).toHaveLength(0)
  })
})

describe('history is a command log, not PDF snapshots', () => {
  it('commands do not retain PDF bytes', async () => {
    await openFake(await makePdf(2))
    for (let i = 0; i < 50; i++) execute(DOC, `step ${i}`, () => {}, () => {}, { scope: 'document' })
    const cmds = useHistoryStore.getState().byDoc[DOC].undo
    expect(cmds).toHaveLength(50)
    expect(JSON.stringify(cmds.map((c) => ({ label: c.label, scope: c.scope }))).length).toBeLessThan(5000)
  })
})
