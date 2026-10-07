import { PDFDocument, rgb } from 'pdf-lib'
import { safe, unicodeFonts, wrap } from './fonts'
import { formatInr, round2 } from './india'
import { saveDoc } from './pdf'

export interface Product { id: string; name: string; price: number; gst: number; hsn: string; category: string; sku: string }
export interface CartLine { product: Product; qty: number }
export interface Shop { name: string; address: string; gstin: string; phone: string; footer: string; inclusive: boolean; width: 58 | 80 }
export interface Sale { id: string; number: string; at: number; lines: { name: string; qty: number; price: number; gst: number; hsn: string }[]; discount: number; payment: 'Cash' | 'UPI' | 'Card'; tendered: number; customer: string }

export interface BillTotals { lines: { name: string; qty: number; price: number; amount: number; taxable: number; tax: number; gst: number; hsn: string }[]; subtotal: number; discount: number; taxable: number; cgst: number; sgst: number; total: number; round: number; items: number }

/** Prices may include GST (typical retail MRP) or exclude it. Discount is applied on the bill before tax. */
export function billTotals(lines: Sale['lines'], discountPct: number, inclusive: boolean): BillTotals {
  const k = 1 - Math.max(0, Math.min(100, discountPct)) / 100
  const out = lines.map((l) => {
    const gross = l.qty * l.price * k
    const taxable = inclusive ? gross / (1 + l.gst / 100) : gross
    const tax = inclusive ? gross - taxable : (taxable * l.gst) / 100
    return { name: l.name, qty: l.qty, price: l.price, amount: round2(l.qty * l.price), taxable: round2(taxable), tax: round2(tax), gst: l.gst, hsn: l.hsn }
  })
  const subtotal = round2(out.reduce((s, l) => s + l.amount, 0))
  const taxable = round2(out.reduce((s, l) => s + l.taxable, 0))
  const tax = round2(out.reduce((s, l) => s + l.tax, 0))
  const raw = round2(taxable + tax)
  const total = Math.round(raw)
  return { lines: out, subtotal, discount: round2(subtotal * (1 - k)), taxable, cgst: round2(tax / 2), sgst: round2(tax - round2(tax / 2)), total, round: round2(total - raw), items: lines.reduce((s, l) => s + l.qty, 0) }
}

/** Thermal-roll receipt (58 or 80 mm wide, height grows with the bill). */
export async function receiptPdf(shop: Shop, sale: Sale): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  const { regular: R, bold: B } = await unicodeFonts(doc)
  const W = (shop.width / 25.4) * 72
  const M = shop.width === 58 ? 8 : 12
  const size = shop.width === 58 ? 7 : 8
  const t = billTotals(sale.lines, sale.discount, shop.inclusive)
  type Op = { kind: 'text'; s: string; bold?: boolean; align?: 'left' | 'center' | 'right'; size?: number } | { kind: 'pair'; l: string; r: string; bold?: boolean; size?: number } | { kind: 'rule' } | { kind: 'gap'; h: number }
  const ops: Op[] = []
  const w = W - 2 * M
  const center = (s: string, bold = false, sz = size) => wrap(bold ? B : R, s, sz, w).forEach((x) => ops.push({ kind: 'text', s: x, bold, align: 'center', size: sz }))
  center(shop.name || 'My Shop', true, size + 4)
  if (shop.address) center(shop.address)
  if (shop.phone) center(`Ph: ${shop.phone}`)
  if (shop.gstin) center(`GSTIN: ${shop.gstin}`, true)
  ops.push({ kind: 'gap', h: 3 }, { kind: 'text', s: shop.gstin ? 'TAX INVOICE' : 'BILL', bold: true, align: 'center', size: size + 1 }, { kind: 'rule' })
  ops.push({ kind: 'pair', l: `Bill: ${sale.number}`, r: new Date(sale.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) })
  if (sale.customer) ops.push({ kind: 'text', s: `Customer: ${sale.customer}` })
  ops.push({ kind: 'rule' }, { kind: 'pair', l: 'Item', r: 'Amount', bold: true }, { kind: 'rule' })
  for (const l of t.lines) {
    wrap(R, l.name, size, w).forEach((x) => ops.push({ kind: 'text', s: x }))
    ops.push({ kind: 'pair', l: `  ${l.qty} × ${formatInr(l.price)}${l.gst ? `  (${l.gst}%)` : ''}`, r: formatInr(l.amount) })
  }
  ops.push({ kind: 'rule' }, { kind: 'pair', l: `Items: ${t.items}`, r: `Subtotal ${formatInr(t.subtotal)}` })
  if (t.discount) ops.push({ kind: 'pair', l: `Discount (${sale.discount}%)`, r: `−${formatInr(t.discount)}` })
  if (shop.gstin) {
    ops.push({ kind: 'pair', l: 'Taxable value', r: formatInr(t.taxable) }, { kind: 'pair', l: 'CGST', r: formatInr(t.cgst) }, { kind: 'pair', l: 'SGST', r: formatInr(t.sgst) })
  }
  if (t.round) ops.push({ kind: 'pair', l: 'Round off', r: formatInr(t.round) })
  ops.push({ kind: 'rule' }, { kind: 'pair', l: 'TOTAL', r: `₹${formatInr(t.total)}`, bold: true, size: size + 3 }, { kind: 'rule' })
  ops.push({ kind: 'pair', l: `Paid by ${sale.payment}`, r: formatInr(sale.payment === 'Cash' && sale.tendered ? sale.tendered : t.total) })
  if (sale.payment === 'Cash' && sale.tendered > t.total) ops.push({ kind: 'pair', l: 'Change', r: formatInr(round2(sale.tendered - t.total)), bold: true })
  if (shop.gstin && !shop.inclusive) ops.push({ kind: 'gap', h: 2 })
  if (shop.footer) {
    ops.push({ kind: 'gap', h: 4 })
    center(shop.footer)
  }
  ops.push({ kind: 'gap', h: 4 })
  // measure height
  const lh = (o: Op) => (o.kind === 'gap' ? o.h : o.kind === 'rule' ? 6 : ((o as { size?: number }).size ?? size) * 1.35)
  const H = Math.max(120, ops.reduce((s, o) => s + lh(o), 0) + 2 * M)
  const page = doc.addPage([W, H])
  let y = H - M
  for (const o of ops) {
    const h = lh(o)
    if (o.kind === 'rule') {
      page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.4, color: rgb(0.3, 0.3, 0.3), dashArray: [2, 1.5] })
    } else if (o.kind === 'text') {
      const f = o.bold ? B : R
      const sz = o.size ?? size
      const s = safe(f, o.s)
      const tw = f.widthOfTextAtSize(s, sz)
      page.drawText(s, { x: o.align === 'center' ? (W - tw) / 2 : o.align === 'right' ? W - M - tw : M, y: y - sz, size: sz, font: f })
    } else if (o.kind === 'pair') {
      const f = o.bold ? B : R
      const sz = o.size ?? size
      const r = safe(f, o.r)
      page.drawText(safe(f, o.l), { x: M, y: y - sz, size: sz, font: f })
      page.drawText(r, { x: W - M - f.widthOfTextAtSize(r, sz), y: y - sz, size: sz, font: f })
    }
    y -= h
  }
  doc.setTitle(`Bill ${sale.number}`)
  return saveDoc(doc)
}

/** HTML for printing directly on a thermal printer (browser print dialog). */
export function receiptHtml(shop: Shop, sale: Sale): string {
  const t = billTotals(sale.lines, sale.discount, shop.inclusive)
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const row = (l: string, r: string, b = false) => `<div class="r${b ? ' b' : ''}"><span>${e(l)}</span><span>${e(r)}</span></div>`
  return `<div class="rc" style="width:${shop.width - 6}mm">
<div class="c b big">${e(shop.name || 'My Shop')}</div>${shop.address ? `<div class="c">${e(shop.address)}</div>` : ''}${shop.phone ? `<div class="c">Ph: ${e(shop.phone)}</div>` : ''}${shop.gstin ? `<div class="c b">GSTIN: ${e(shop.gstin)}</div>` : ''}
<div class="c b">${shop.gstin ? 'TAX INVOICE' : 'BILL'}</div><hr>${row(`Bill: ${sale.number}`, new Date(sale.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }))}${sale.customer ? `<div>Customer: ${e(sale.customer)}</div>` : ''}<hr>
${t.lines.map((l) => `<div>${e(l.name)}</div>${row(`  ${l.qty} × ${formatInr(l.price)}`, formatInr(l.amount))}`).join('')}<hr>
${row(`Items: ${t.items}`, `Subtotal ${formatInr(t.subtotal)}`)}${t.discount ? row(`Discount (${sale.discount}%)`, `−${formatInr(t.discount)}`) : ''}${shop.gstin ? row('Taxable', formatInr(t.taxable)) + row('CGST', formatInr(t.cgst)) + row('SGST', formatInr(t.sgst)) : ''}${t.round ? row('Round off', formatInr(t.round)) : ''}<hr>
${row('TOTAL', `₹${formatInr(t.total)}`, true)}<hr>${row(`Paid by ${sale.payment}`, formatInr(sale.payment === 'Cash' && sale.tendered ? sale.tendered : t.total))}${sale.payment === 'Cash' && sale.tendered > t.total ? row('Change', formatInr(round2(sale.tendered - t.total)), true) : ''}
${shop.footer ? `<div class="c" style="margin-top:6px">${e(shop.footer)}</div>` : ''}</div>`
}
