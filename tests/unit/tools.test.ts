import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName } from 'pdf-lib'
import { makeFormPdf, makePdf } from '../helpers'
import { md5 } from '@/tools/lib/hash'
import { formatInr, numberToWords, rupeesInWords, validGstin } from '@/tools/lib/india'
import { computeTotals, type Invoice } from '@/tools/lib/invoice'
import { markdownToHtml } from '@/tools/lib/markdown'
import { Bm25, extractAnswer, makePassages, sentences, summarize } from '@/tools/lib/nlp'
import { alternatePdfs, bookmarkGroups, cropMargins, flipPdf, gridFor, invert, mergePdfs, mul, nUp, rotatePages, rotationMatrix, splitByGroups, splitBySize, splitPagesInHalf } from '@/tools/lib/pages'
import { parseRangeGroups, parseRanges } from '@/tools/lib/pdf'
import { boxesFor, findPii, indexRuns, luhn, verhoeff } from '@/tools/lib/pii'
import { encryptPdf, encryptionInfo, decryptPdf, flattenPdf, readMetadata, writeMetadata, EMPTY_META } from '@/tools/lib/security'
import { addPageNumbers, batesNumber, fillTokens } from '@/tools/lib/stamp'
import { detectTable, parseCsv, toCsv } from '@/tools/lib/extract'
import { billTotals } from '@/tools/lib/receipt'
import { diffWords } from '@/tools/ui/tools/compare'
import { transformPixels } from '@/tools/lib/raster'

const pages = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount()

describe('ranges', () => {
  it('parses ranges, open ends, odd/even', () => {
    expect(parseRanges('1-3, 5, 8-', 10)).toEqual([0, 1, 2, 4, 7, 8, 9])
    expect(parseRanges('odd', 5)).toEqual([0, 2, 4])
    expect(parseRanges('', 3)).toEqual([0, 1, 2])
    expect(() => parseRanges('12', 5)).toThrow()
    expect(parseRangeGroups('1-2; 3-4', 4)).toEqual([[0, 1], [2, 3]])
  })
})

describe('page operations', () => {
  it('merges and interleaves (with reversed backs)', async () => {
    const a = await makePdf(3, { label: 'A' })
    const b = await makePdf(3, { label: 'B' })
    expect(await pages(await mergePdfs([{ bytes: a }, { bytes: b }]))).toBe(6)
    expect(await pages(await alternatePdfs([a, b], { chunk: 1, reverse: [false, true] }))).toBe(6)
  })
  it('splits by groups and by size', async () => {
    const src = await makePdf(6)
    const parts = await splitByGroups(src, [[0, 1], [2, 3, 4, 5]], (i) => `p${i}.pdf`)
    expect(parts.map((p) => p.pages)).toEqual([2, 4])
    const single = (await splitByGroups(src, [[0]], () => 'x')).at(0)!.bytes.length
    const { parts: sized } = await splitBySize(src, single * 2.5)
    expect(sized.reduce((s, p) => s + p.pages, 0)).toBe(6)
    for (const p of sized) expect(p.bytes.length).toBeLessThanOrEqual(single * 2.5)
  })
  it('slices pages in half, keeping the cover', async () => {
    const out = await splitPagesInHalf(await makePdf(3, { size: [800, 600] }), { direction: 'vertical', rtl: false, skipFirst: true, skipLast: false })
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(5)
    expect(Math.round(doc.getPage(1).getCropBox().width)).toBe(400)
  })
  it('rotates, flips, imposes n-up and crops', async () => {
    const src = await makePdf(5)
    const rot = await PDFDocument.load(await rotatePages(src, [0, 2], 90))
    expect(rot.getPage(0).getRotation().angle).toBe(90)
    expect(rot.getPage(1).getRotation().angle).toBe(0)
    expect(await pages(await flipPdf(src, 'horizontal'))).toBe(5)
    expect(await pages(await nUp(src, { perSheet: 4, sheet: 'A4', orientation: 'auto', margin: 10, gap: 5, border: true, order: 'rows' }))).toBe(2)
    const crop = await PDFDocument.load(await cropMargins(src, { top: 10, right: 20, bottom: 30, left: 40 }))
    const box = crop.getPage(0).getCropBox()
    expect([box.x, box.y, box.width, box.height]).toEqual([40, 30, 552, 752])
    expect(gridFor(6)).toEqual([3, 2])
  })
  it('rotation matrices invert correctly', () => {
    for (const r of [0, 90, 180, 270]) {
      const m = rotationMatrix(r, 100, 50)
      const id = mul(m, invert(m))
      expect(id.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, 0, 1, 0, 0])
    }
  })
  it('groups bookmarks into sections', () => {
    const g = bookmarkGroups([{ title: 'One', page: 1, level: 1 }, { title: 'Sub', page: 2, level: 2 }, { title: 'Two', page: 4, level: 1 }], 1, 6)
    expect(g.map((x) => [x.title, x.pages])).toEqual([['Front matter', [0]], ['One', [1, 2, 3]], ['Two', [4, 5]]])
  })
})

describe('stamping', () => {
  it('fills tokens and numbers pages', async () => {
    expect(fillTokens('Page {n} of {total} – {file}', { n: 2, total: 9, file: 'x', now: new Date(2024, 0, 5) })).toBe('Page 2 of 9 – x')
    const out = await addPageNumbers(await makePdf(3), { template: '{n}', position: 'bottom-center', start: 1, size: 10, margin: 20, color: '#000000', skipFirst: false })
    expect(await pages(out)).toBe(3)
  })
  it('continues Bates numbers across files', async () => {
    const r = await batesNumber([{ name: 'a.pdf', bytes: await makePdf(2) }, { name: 'b.pdf', bytes: await makePdf(3) }], { prefix: 'X', suffix: '', start: 7, digits: 4, position: 'bottom-right', size: 9, margin: 18, color: '#000000' })
    expect(r.map((x) => [x.first, x.last])).toEqual([['X0007', 'X0008'], ['X0009', 'X0011']])
  })
})

describe('security', () => {
  it('encrypts, reports restrictions and decrypts', async () => {
    const enc = await encryptPdf(await makePdf(1), { userPassword: 'secret', ownerPassword: 'owner', algorithm: 'AES-256', allowPrint: false, allowCopy: false, allowModify: false, allowAnnotate: false, allowForms: false })
    const info = await encryptionInfo(enc)
    expect(info.encrypted).toBe(true)
    expect(info.needsPassword).toBe(true)
    expect(info.restrictions).toContain('Printing')
    await expect(decryptPdf(enc, 'wrong')).rejects.toThrow()
    const plain = await decryptPdf(enc, 'secret')
    expect((await encryptionInfo(plain)).encrypted).toBe(false)
  })
  it('flattens forms', async () => {
    const r = await flattenPdf(await makeFormPdf(), { forms: true, annotations: true, scripts: true, keepLinks: true })
    expect(r.fields).toBe(2)
    const doc = await PDFDocument.load(r.bytes)
    expect(doc.catalog.has(PDFName.of('AcroForm'))).toBe(false)
  })
  it('round-trips metadata', async () => {
    const out = await writeMetadata(await makePdf(1), { ...EMPTY_META, title: 'Report', author: 'Asha', keywords: 'a, b' }, { stripXmp: true })
    const m = await readMetadata(out)
    expect([m.title, m.author]).toEqual(['Report', 'Asha'])
  })
})

describe('PII detection', () => {
  it('validates checksums', () => {
    expect(verhoeff('234123412346')).toBe(true)
    expect(verhoeff('234123412347')).toBe(false)
    expect(luhn('4111 1111 1111 1111')).toBe(true)
    expect(luhn('4111 1111 1111 1112')).toBe(false)
  })
  it('finds Aadhaar, PAN, card, email and phone but not random digits', () => {
    const text = 'Aadhaar 2341 2341 2346, PAN ABCPE1234F, card 4111-1111-1111-1111, mail a.b@x.in, call 98765 43210. Ref 1234 5678 9012.'
    const ids = findPii(text, 0, ['aadhaar', 'pan', 'card', 'email', 'phone-in']).map((f) => f.type)
    expect(ids).toEqual(['aadhaar', 'pan', 'card', 'email', 'phone-in'])
  })
  it('maps matches to run boxes', () => {
    const runs = [{ str: 'PAN: ABCPE1234F', x: 10, y: 10, w: 150, h: 10, size: 10, font: '', bold: false, italic: false, eol: true }]
    const idx = indexRuns(runs)
    const [f] = findPii(idx.text, 0, ['pan'])
    const [b] = boxesFor(runs, idx, f.start, f.end, 0)
    expect(b.x).toBeCloseTo(10 + 150 * (5 / 15))
    expect(b.w).toBeCloseTo(100)
  })
})

describe('text tools', () => {
  it('md5 matches known vectors', () => {
    const enc = new TextEncoder()
    expect(md5(enc.encode(''))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5(enc.encode('The quick brown fox jumps over the lazy dog'))).toBe('9e107d9d372bb6826bd81d3542a419d6')
  })
  it('converts markdown', () => {
    const h = markdownToHtml('# T\n\n- a\n  - b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n**bold** `c`')
    expect(h).toContain('<h1>T</h1>')
    expect(h).toContain('<ul><li>a<ul><li>b</li></ul></li></ul>')
    expect(h).toContain('<th>x</th>')
    expect(h).toContain('<strong>bold</strong> <code>c</code>')
  })
  it('summarises and answers questions extractively', () => {
    const text = 'The invoice total is 5000 rupees. Payment is due in 30 days. The supplier is based in Pune. Late payments attract interest of 2 percent per month. The goods were delivered on 3 March. The buyer must inspect goods within 7 days.'
    expect(sentences(text)).toHaveLength(6)
    expect(summarize(text, { count: 2 }).sentences).toHaveLength(2)
    const passages = makePassages([text])
    const hits = new Bm25(passages).search('when is payment due?')
    expect(extractAnswer('when is payment due?', hits).answer).toContain('30 days')
  })
  it('CSV round-trips', () => {
    const rows = [['a', 'b,c'], ['"q"', 'x\ny']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
  it('detects table columns', () => {
    const r = (str: string, x: number, y: number) => ({ str, x, y, w: str.length * 5, h: 10, size: 10, font: '', bold: false, italic: false, eol: false })
    const rows = detectTable([r('Item', 10, 10), r('Qty', 200, 10), r('Pens', 10, 30), r('10', 200, 30), r('Paper', 10, 50), r('2', 200, 50)], { numbers: true, onlyTables: true })
    expect(rows).toEqual([['Item', 'Qty'], ['Pens', 10], ['Paper', 2]])
  })
  it('diffs words', () => {
    const d = diffWords('the cat sat', 'the dog sat')
    expect(d.filter((o) => o.t !== 'same').map((o) => `${o.t}:${o.w}`)).toEqual(['del:cat', 'add:dog'])
  })
})

describe('India business maths', () => {
  it('formats and spells amounts', () => {
    expect(formatInr(1234567.5)).toBe('12,34,567.50')
    expect(numberToWords(12345678)).toBe('One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight')
    expect(rupeesInWords(101.5)).toBe('Rupees One Hundred One and Fifty Paise Only')
    expect(validGstin('29ABCDE1234F1ZW')).toBe(true)
    expect(validGstin('29ABCDE1234F1Z5')).toBe(false)
  })
  const inv = (pos: string): Invoice => ({
    kind: 'TAX INVOICE', number: '1', date: '2024-01-01', due: '', reverseCharge: false, copy: '', seller: { name: 'S', address: '', gstin: '', state: '29', phone: '', email: '' }, buyer: { name: 'B', address: '', gstin: '', state: pos, phone: '', email: '' }, shipTo: '', placeOfSupply: pos,
    items: [{ desc: 'x', hsn: '1', qty: 2, unit: '', rate: 100, discount: 10, gst: 18 }], notes: '', terms: '', bank: { name: '', account: '', ifsc: '', branch: '', upi: '' }, signatory: '', shipping: 0, roundOff: true,
  })
  it('splits CGST/SGST intra-state and IGST inter-state', () => {
    const intra = computeTotals(inv('29'))
    expect([intra.taxable, intra.cgst, intra.sgst, intra.igst, intra.grand]).toEqual([180, 16.2, 16.2, 0, 212])
    const inter = computeTotals(inv('27'))
    expect([inter.igst, inter.cgst]).toEqual([32.4, 0])
  })
  it('handles GST-inclusive retail bills', () => {
    const t = billTotals([{ name: 'Soap', qty: 1, price: 118, gst: 18, hsn: '' }], 0, true)
    expect([t.taxable, t.cgst + t.sgst, t.total]).toEqual([100, 18, 118])
  })
})

describe('pixel transforms', () => {
  it('inverts and keeps hue in dark mode', () => {
    const d = new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255])
    transformPixels(d, 'dark')
    expect(Array.from(d.slice(0, 3))).toEqual([0, 0, 0])
    expect(Array.from(d.slice(4, 7))).toEqual([255, 0, 0])
  })
})
