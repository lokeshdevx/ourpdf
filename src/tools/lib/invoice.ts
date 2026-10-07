import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import { safe, unicodeFonts, wrap } from './fonts'
import { formatInr, round2, rupeesInWords, stateName } from './india'
import { saveDoc } from './pdf'

export interface Party { name: string; address: string; gstin: string; state: string; phone: string; email: string }
export interface Item { desc: string; hsn: string; qty: number; unit: string; rate: number; discount: number; gst: number }
export interface Invoice {
  kind: 'TAX INVOICE' | 'BILL OF SUPPLY' | 'PROFORMA INVOICE'
  number: string; date: string; due: string; reverseCharge: boolean; copy: string
  seller: Party; buyer: Party; shipTo: string; placeOfSupply: string
  items: Item[]; notes: string; terms: string
  bank: { name: string; account: string; ifsc: string; branch: string; upi: string }
  signatory: string; logo?: { bytes: Uint8Array; mime: string }; signature?: { bytes: Uint8Array; mime: string }
  shipping: number; roundOff: boolean
}

export interface Line extends Item { taxable: number; cgst: number; sgst: number; igst: number; total: number }
export interface Totals { lines: Line[]; taxable: number; cgst: number; sgst: number; igst: number; shipping: number; round: number; grand: number; intra: boolean; byRate: { rate: number; hsn: string; taxable: number; cgst: number; sgst: number; igst: number }[] }

/** GST maths: CGST + SGST for intra-state supply (seller state = place of supply), IGST otherwise. */
export function computeTotals(inv: Invoice): Totals {
  const intra = !!inv.seller.state && inv.seller.state === inv.placeOfSupply
  const noTax = inv.kind === 'BILL OF SUPPLY'
  const lines: Line[] = inv.items.filter((i) => i.desc || i.rate).map((i) => {
    const gross = (Number(i.qty) || 0) * (Number(i.rate) || 0)
    const taxable = round2(gross * (1 - (Number(i.discount) || 0) / 100))
    const rate = noTax ? 0 : Number(i.gst) || 0
    const tax = round2((taxable * rate) / 100)
    const half = round2(tax / 2)
    return { ...i, taxable, cgst: intra ? half : 0, sgst: intra ? round2(tax - half) : 0, igst: intra ? 0 : tax, total: round2(taxable + tax) }
  })
  const sum = (k: keyof Line) => round2(lines.reduce((s, l) => s + (l[k] as number), 0))
  const taxable = sum('taxable'), cgst = sum('cgst'), sgst = sum('sgst'), igst = sum('igst')
  const raw = round2(taxable + cgst + sgst + igst + (Number(inv.shipping) || 0))
  const grand = inv.roundOff ? Math.round(raw) : raw
  const groups = new Map<string, Totals['byRate'][number]>()
  for (const l of lines) {
    const key = `${l.hsn || '—'}|${l.gst}`
    const g = groups.get(key) ?? { rate: noTax ? 0 : l.gst, hsn: l.hsn || '—', taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    g.taxable = round2(g.taxable + l.taxable)
    g.cgst = round2(g.cgst + l.cgst)
    g.sgst = round2(g.sgst + l.sgst)
    g.igst = round2(g.igst + l.igst)
    groups.set(key, g)
  }
  return { lines, taxable, cgst, sgst, igst, shipping: Number(inv.shipping) || 0, round: round2(grand - raw), grand, intra, byRate: [...groups.values()] }
}

const fmtDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '')

interface Cell { text: string; w: number; align?: 'left' | 'right' | 'center'; bold?: boolean }

export async function invoicePdf(inv: Invoice, accentHex = '#1f3a8a'): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  const { regular: R, bold: B } = await unicodeFonts(doc)
  const t = computeTotals(inv)
  const W = 595.28, H = 841.89, M = 32
  const accent: RGB = rgb(...([1, 3, 5].map((i) => parseInt(accentHex.slice(i, i + 2), 16) / 255) as [number, number, number]))
  const line = rgb(0.75, 0.77, 0.8)
  const grey = rgb(0.38, 0.4, 0.45)
  let page: PDFPage = doc.addPage([W, H])
  let y = H - M
  const txt = (s: string, x: number, yy: number, size: number, font: PDFFont = R, color: RGB = rgb(0.1, 0.1, 0.12)) => page.drawText(safe(font, s), { x, y: yy, size, font, color })
  const right = (s: string, x: number, yy: number, size: number, font: PDFFont = R, color?: RGB) => txt(s, x - font.widthOfTextAtSize(safe(font, s), size), yy, size, font, color)
  const para = (s: string, x: number, width: number, size: number, font: PDFFont = R, color?: RGB) => {
    for (const l of wrap(font, s, size, width)) {
      txt(l, x, y - size, size, font, color)
      y -= size * 1.3
    }
  }
  let logo: PDFImage | null = null
  if (inv.logo) logo = inv.logo.mime === 'image/png' ? await doc.embedPng(inv.logo.bytes) : await doc.embedJpg(inv.logo.bytes)

  // ---- header
  txt(inv.kind, M, y - 16, 16, B, accent)
  if (inv.copy) right(inv.copy, W - M, y - 12, 8, R, grey)
  y -= 28
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: accent })
  y -= 10
  const top = y
  let lx = M
  if (logo) {
    const k = Math.min(60 / logo.height, 120 / logo.width)
    page.drawImage(logo, { x: M, y: y - logo.height * k, width: logo.width * k, height: logo.height * k })
    lx = M + logo.width * k + 10
  }
  txt(inv.seller.name || 'Your business name', lx, y - 13, 13, B)
  y -= 18
  const leftW = W / 2 - lx - 10
  for (const l of [inv.seller.address, inv.seller.gstin && `GSTIN: ${inv.seller.gstin}`, inv.seller.state && `State: ${stateName(inv.seller.state)} (${inv.seller.state})`, [inv.seller.phone, inv.seller.email].filter(Boolean).join(' · ')].filter(Boolean) as string[]) {
    for (const w of wrap(R, l, 8.5, leftW)) {
      txt(w, lx, y - 8.5, 8.5, R, grey)
      y -= 11
    }
  }
  const leftEnd = y
  // meta box on the right
  y = top
  const meta: [string, string][] = [['Invoice No.', inv.number], ['Invoice Date', fmtDate(inv.date)], ...(inv.due ? [['Due Date', fmtDate(inv.due)] as [string, string]] : []), ['Place of Supply', inv.placeOfSupply ? `${stateName(inv.placeOfSupply)} (${inv.placeOfSupply})` : '—'], ['Reverse Charge', inv.reverseCharge ? 'Yes' : 'No']]
  for (const [k, v] of meta) {
    txt(k, W / 2 + 40, y - 9, 8.5, R, grey)
    right(v, W - M, y - 9, 9, B)
    y -= 13
  }
  y = Math.min(leftEnd, y) - 8

  // ---- parties
  page.drawRectangle({ x: M, y: y - 82, width: W - 2 * M, height: 82, borderColor: line, borderWidth: 0.6 })
  page.drawLine({ start: { x: W / 2, y }, end: { x: W / 2, y: y - 82 }, thickness: 0.6, color: line })
  const party = (label: string, p: { name: string; address: string; gstin?: string; state?: string }, x: number) => {
    let yy = y - 12
    txt(label, x, yy, 7.5, B, accent)
    yy -= 12
    txt(p.name || '—', x, yy, 9.5, B)
    yy -= 11
    for (const l of [p.address, p.gstin && `GSTIN: ${p.gstin}`, p.state && `State: ${stateName(p.state)} (${p.state})`].filter(Boolean) as string[]) for (const w of wrap(R, l, 8, W / 2 - M - 16).slice(0, 3)) {
      txt(w, x, yy, 8, R, grey)
      yy -= 10
    }
  }
  party('BILL TO', { name: inv.buyer.name, address: inv.buyer.address, gstin: inv.buyer.gstin, state: inv.buyer.state }, M + 8)
  party('SHIP TO', { name: inv.shipTo ? inv.shipTo.split('\n')[0] : inv.buyer.name, address: inv.shipTo ? inv.shipTo.split('\n').slice(1).join(', ') : inv.buyer.address }, W / 2 + 8)
  y -= 92

  // ---- items table
  const intra = t.intra
  const noTax = inv.kind === 'BILL OF SUPPLY'
  const hasDisc = t.lines.some((l) => l.discount)
  const cols: Cell[] = [
    { text: '#', w: 16, align: 'center' }, { text: 'Description', w: 0 }, { text: 'HSN/SAC', w: 44, align: 'center' }, { text: 'Qty', w: 38, align: 'right' }, { text: 'Rate', w: 52, align: 'right' },
    ...(hasDisc ? [{ text: 'Disc%', w: 30, align: 'right' as const }] : []), { text: 'Taxable', w: 58, align: 'right' },
    ...(noTax ? [] : [{ text: 'GST%', w: 28, align: 'right' as const }]),
    ...(noTax ? [] : intra ? [{ text: 'CGST', w: 46, align: 'right' as const }, { text: 'SGST', w: 46, align: 'right' as const }] : [{ text: 'IGST', w: 56, align: 'right' as const }]),
    { text: 'Amount', w: 60, align: 'right' },
  ]
  const fixed = cols.reduce((s, c) => s + c.w, 0)
  cols[1].w = W - 2 * M - fixed
  const drawRow = (cells: Cell[], opts: { header?: boolean; size?: number } = {}) => {
    const size = opts.size ?? 8
    const descLines = wrap(opts.header ? B : R, cells[1].text, size, cols[1].w - 8)
    const h = Math.max(16, descLines.length * (size * 1.25) + 7)
    if (y - h < M + 40) {
      page = doc.addPage([W, H])
      y = H - M
    }
    if (opts.header) page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: accent })
    let x = M
    cells.forEach((c, i) => {
      const col = cols[i]
      const font = opts.header || c.bold ? B : R
      const color = opts.header ? rgb(1, 1, 1) : undefined
      if (i === 1) descLines.forEach((l, k) => txt(l, x + 4, y - 10 - k * size * 1.25, size, font, color))
      else {
        const s = safe(font, c.text)
        const tw = font.widthOfTextAtSize(s, size)
        const tx = (c.align ?? col.align) === 'right' ? x + col.w - tw - 4 : (c.align ?? col.align) === 'center' ? x + (col.w - tw) / 2 : x + 4
        txt(s, tx, y - 10, size, font, color)
      }
      x += col.w
    })
    if (!opts.header) page.drawLine({ start: { x: M, y: y - h }, end: { x: W - M, y: y - h }, thickness: 0.4, color: line })
    y -= h
  }
  drawRow(cols, { header: true, size: 7.5 })
  t.lines.forEach((l, i) => drawRow([
    { text: String(i + 1), w: 0 }, { text: l.desc, w: 0 }, { text: l.hsn, w: 0 }, { text: `${l.qty} ${l.unit}`.trim(), w: 0 }, { text: formatInr(l.rate), w: 0 },
    ...(hasDisc ? [{ text: l.discount ? String(l.discount) : '–', w: 0 }] : []), { text: formatInr(l.taxable), w: 0 },
    ...(noTax ? [] : [{ text: `${l.gst}`, w: 0 }]),
    ...(noTax ? [] : intra ? [{ text: formatInr(l.cgst), w: 0 }, { text: formatInr(l.sgst), w: 0 }] : [{ text: formatInr(l.igst), w: 0 }]),
    { text: formatInr(l.total), w: 0, bold: true },
  ]))

  // ---- totals block
  y -= 8
  if (y < M + 230) {
    page = doc.addPage([W, H])
    y = H - M
  }
  const totalsTop = y
  const tx = W / 2 + 40
  const rowT = (k: string, v: string, bold = false, size = 9) => {
    txt(k, tx, y - size, size, bold ? B : R, bold ? undefined : grey)
    right(v, W - M, y - size, size, bold ? B : R)
    y -= size + 5
  }
  rowT('Taxable value', `₹${formatInr(t.taxable)}`)
  if (!noTax) {
    if (intra) {
      rowT('CGST', `₹${formatInr(t.cgst)}`)
      rowT('SGST / UTGST', `₹${formatInr(t.sgst)}`)
    } else rowT('IGST', `₹${formatInr(t.igst)}`)
  }
  if (t.shipping) rowT('Shipping / other charges', `₹${formatInr(t.shipping)}`)
  if (t.round) rowT('Round off', `${t.round > 0 ? '+' : '−'}₹${formatInr(Math.abs(t.round))}`)
  page.drawLine({ start: { x: tx, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.8, color: accent })
  y -= 4
  rowT('Grand Total', `₹${formatInr(t.grand)}`, true, 12)
  const totalsEnd = y

  // tax summary on the left
  y = totalsTop
  if (!noTax && t.byRate.length) {
    txt('Tax summary (HSN-wise)', M, y - 9, 8.5, B, accent)
    y -= 15
    const hdr = intra ? ['HSN/SAC', 'Taxable', 'Rate', 'CGST', 'SGST'] : ['HSN/SAC', 'Taxable', 'Rate', 'IGST']
    const cw = (W / 2 - M) / hdr.length
    hdr.forEach((h, i) => (i ? right(h, M + cw * (i + 1) - 4, y - 8, 7.5, B, grey) : txt(h, M, y - 8, 7.5, B, grey)))
    y -= 12
    for (const g of t.byRate) {
      const vals = intra ? [g.hsn, formatInr(g.taxable), `${g.rate}%`, formatInr(g.cgst), formatInr(g.sgst)] : [g.hsn, formatInr(g.taxable), `${g.rate}%`, formatInr(g.igst)]
      vals.forEach((v, i) => (i ? right(v, M + cw * (i + 1) - 4, y - 8, 7.5) : txt(v, M, y - 8, 7.5)))
      y -= 11
    }
  }
  y = Math.min(y, totalsEnd) - 8
  page.drawRectangle({ x: M, y: y - 20, width: W - 2 * M, height: 20, color: rgb(0.95, 0.96, 0.98) })
  txt('Amount in words: ', M + 6, y - 13, 8, B)
  txt(rupeesInWords(t.grand), M + 6 + B.widthOfTextAtSize('Amount in words: ', 8), y - 13, 8)
  y -= 32

  // ---- bank, notes, signature
  const footTop = y
  if (inv.bank.account || inv.bank.upi) {
    txt('Bank details', M, y - 9, 8.5, B, accent)
    y -= 14
    for (const [k, v] of [['Bank', inv.bank.name], ['A/c No.', inv.bank.account], ['IFSC', inv.bank.ifsc], ['Branch', inv.bank.branch], ['UPI', inv.bank.upi]] as [string, string][]) if (v) {
      txt(`${k}:`, M, y - 8, 8, R, grey)
      txt(v, M + 50, y - 8, 8, B)
      y -= 11
    }
    y -= 4
  }
  if (inv.notes.trim()) {
    txt('Notes', M, y - 9, 8.5, B, accent)
    y -= 13
    para(inv.notes, M, W / 2 - M, 8, R, grey)
    y -= 4
  }
  if (inv.terms.trim()) {
    txt('Terms & conditions', M, y - 9, 8.5, B, accent)
    y -= 13
    para(inv.terms, M, W / 2 - M, 7.5, R, grey)
  }
  // signature box
  const sy = footTop
  txt(`For ${inv.seller.name || 'the supplier'}`, W / 2 + 40, sy - 9, 8.5, B)
  if (inv.signature) {
    const img = inv.signature.mime === 'image/png' ? await doc.embedPng(inv.signature.bytes) : await doc.embedJpg(inv.signature.bytes)
    const k = Math.min(40 / img.height, 140 / img.width)
    page.drawImage(img, { x: W - M - img.width * k, y: sy - 58, width: img.width * k, height: img.height * k })
  }
  page.drawLine({ start: { x: W / 2 + 40, y: sy - 64 }, end: { x: W - M, y: sy - 64 }, thickness: 0.5, color: line })
  right(inv.signatory || 'Authorised Signatory', W - M, sy - 76, 8, R, grey)
  if (inv.kind === 'TAX INVOICE') right('This is a computer-generated invoice.', W - M, M - 12, 6.5, R, grey)

  doc.setTitle(`${inv.kind} ${inv.number}`)
  doc.setAuthor(inv.seller.name)
  return saveDoc(doc)
}
