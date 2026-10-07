'use client'

import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Printer, Search, Settings, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { saveBlob } from '@/services/download'
import { parseCsv, toCsv } from '@/tools/lib/extract'
import { formatInr, GST_RATES, round2 } from '@/tools/lib/india'
import { billTotals, receiptHtml, receiptPdf, type CartLine, type Product, type Sale, type Shop } from '@/tools/lib/receipt'
import { Grid, NumberInput, Panel, Results, Segmented, Select, TextInput, Toggle, pdfOut, type OutFile } from '../kit'

const KEY = 'ourpdf.pos.v1'
interface Store { shop: Shop; products: Product[]; sales: Sale[]; next: number }
const DEFAULT: Store = {
  shop: { name: 'My Kirana Store', address: 'Shop 4, Main Market', gstin: '', phone: '', footer: 'Thank you! Visit again.', inclusive: true, width: 80 },
  products: [
    { id: 'p1', name: 'Milk 1L', price: 64, gst: 0, hsn: '0401', category: 'Dairy', sku: '' },
    { id: 'p2', name: 'Bread', price: 45, gst: 0, hsn: '1905', category: 'Bakery', sku: '' },
    { id: 'p3', name: 'Tea 250g', price: 150, gst: 5, hsn: '0902', category: 'Grocery', sku: '' },
    { id: 'p4', name: 'Soap', price: 40, gst: 18, hsn: '3401', category: 'Personal care', sku: '' },
    { id: 'p5', name: 'Biscuits', price: 30, gst: 18, hsn: '1905', category: 'Bakery', sku: '' },
  ],
  sales: [], next: 1,
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT
  } catch {
    return DEFAULT
  }
}

function makeSale(next: number, lines: Sale['lines'], discount: number, payment: Sale['payment'], tendered: number, customer: string): Sale {
  return { id: crypto.randomUUID(), number: `B${String(next).padStart(5, '0')}`, at: Date.now(), lines, discount, payment, tendered, customer }
}

function printHtml(html: string, width: number) {
  const host = document.createElement('div')
  host.id = 'ourpdf-print-receipt'
  host.innerHTML = html
  const style = document.createElement('style')
  style.textContent = `@media print{body>*:not(#ourpdf-print-receipt){display:none!important}#ourpdf-print-receipt{display:block!important}@page{size:${width}mm auto;margin:2mm}}#ourpdf-print-receipt{display:none;font:12px/1.35 ui-monospace,monospace;color:#000}#ourpdf-print-receipt .r{display:flex;justify-content:space-between;gap:6px}#ourpdf-print-receipt .c{text-align:center}#ourpdf-print-receipt .b{font-weight:700}#ourpdf-print-receipt .big{font-size:15px}#ourpdf-print-receipt hr{border:0;border-top:1px dashed #000;margin:3px 0}`
  document.head.appendChild(style)
  document.body.appendChild(host)
  const done = () => { host.remove(); style.remove(); window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  window.print()
  setTimeout(done, 60_000)
}

export function PosBilling() {
  const [store, setStore] = useState<Store>(DEFAULT)
  const [cart, setCart] = useState<CartLine[]>([])
  const [q, setQ] = useState('')
  const [discount, setDiscount] = useState(0)
  const [payment, setPayment] = useState<Sale['payment']>('Cash')
  const [tendered, setTendered] = useState(0)
  const [customer, setCustomer] = useState('')
  const [tab, setTab] = useState<'bill' | 'products' | 'sales' | 'settings'>('bill')
  const [last, setLast] = useState<Sale | null>(null)
  const [out, setOut] = useState<OutFile[]>([])
  const [draft, setDraft] = useState<Product>({ id: '', name: '', price: 0, gst: 0, hsn: '', category: '', sku: '' })
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the shop data saved in this browser
  useEffect(() => setStore(load()), [])
  const save = (s: Store) => {
    setStore(s)
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }
  const lines = cart.map((c) => ({ name: c.product.name, qty: c.qty, price: c.product.price, gst: c.product.gst, hsn: c.product.hsn }))
  const totals = billTotals(lines, discount, store.shop.inclusive)
  const filtered = useMemo(() => store.products.filter((p) => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q.toLowerCase())), [store.products, q])
  const add = (p: Product, d = 1) => setCart((c) => {
    const i = c.findIndex((x) => x.product.id === p.id)
    if (i < 0) return d > 0 ? [...c, { product: p, qty: d }] : c
    const next = [...c]
    next[i] = { ...next[i], qty: next[i].qty + d }
    return next.filter((x) => x.qty > 0)
  })
  const checkout = async (print: boolean) => {
    if (!cart.length) return
    const sale = makeSale(store.next, lines, discount, payment, tendered, customer)
    save({ ...store, sales: [sale, ...store.sales].slice(0, 2000), next: store.next + 1 })
    setLast(sale)
    setOut([pdfOut(await receiptPdf(store.shop, sale), `bill-${sale.number}.pdf`, `₹${formatInr(totals.total)}`)])
    if (print) printHtml(receiptHtml(store.shop, sale), store.shop.width)
    setCart([])
    setDiscount(0)
    setTendered(0)
    setCustomer('')
  }
  const todays = store.sales.filter((s) => new Date(s.at).toDateString() === new Date().toDateString())
  const saleTotal = (s: Sale) => billTotals(s.lines, s.discount, store.shop.inclusive).total
  return (
    <div className="space-y-6">
      <Segmented value={tab} onChange={setTab} options={[['bill', 'New bill'], ['products', `Products (${store.products.length})`], ['sales', `Sales (${store.sales.length})`], ['settings', 'Shop settings']]} />
      {tab === 'bill' && (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Panel title="Products">
            <label className="relative mb-3 block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) { add(filtered[0]); setQ('') } }} placeholder="Search or scan barcode, Enter to add" aria-label="Search products" className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm" /></label>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtered.map((p) => (
                <li key={p.id}><button type="button" onClick={() => add(p)} className="flex h-full w-full flex-col rounded-xl border bg-background p-3 text-left transition hover:border-primary active:scale-[0.98]"><span className="text-sm font-medium">{p.name}</span><span className="mt-auto pt-1 text-sm font-bold text-primary">₹{formatInr(p.price)}</span>{p.gst > 0 && <span className="text-[10px] text-muted-foreground">GST {p.gst}%</span>}</button></li>
              ))}
            </ul>
            {!filtered.length && <p className="text-sm text-muted-foreground">No products. Add them in the Products tab.</p>}
          </Panel>
          <Panel title={`Cart · ${totals.items} item${totals.items === 1 ? '' : 's'}`} className="lg:sticky lg:top-20 lg:self-start">
            <ul className="max-h-72 space-y-1 overflow-auto">
              {cart.map((c) => (
                <li key={c.product.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm odd:bg-muted/40">
                  <span className="min-w-0 flex-1 truncate">{c.product.name}</span>
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Less ${c.product.name}`} onClick={() => add(c.product, -1)}><Minus className="size-3.5" /></Button>
                  <input aria-label={`Quantity of ${c.product.name}`} className="h-7 w-12 rounded border bg-background text-center" type="number" min={0} step="any" value={c.qty} onChange={(e) => { const v = Number(e.target.value); setCart(cart.map((x) => (x.product.id === c.product.id ? { ...x, qty: v } : x)).filter((x) => x.qty > 0)) }} />
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`More ${c.product.name}`} onClick={() => add(c.product, 1)}><Plus className="size-3.5" /></Button>
                  <span className="w-20 text-right font-medium">₹{formatInr(c.qty * c.product.price)}</span>
                </li>
              ))}
              {!cart.length && <li className="py-6 text-center text-sm text-muted-foreground">Tap products to add them.</li>}
            </ul>
            <div className="mt-4 space-y-3 border-t pt-3">
              <Grid>
                <NumberInput label="Discount" value={discount} min={0} max={100} suffix="%" onChange={(v) => setDiscount(v || 0)} />
                <TextInput label="Customer (optional)" value={customer} onChange={setCustomer} />
              </Grid>
              <Segmented value={payment} onChange={setPayment} options={[['Cash', 'Cash'], ['UPI', 'UPI'], ['Card', 'Card']]} />
              {payment === 'Cash' && <NumberInput label="Cash received" value={tendered} min={0} onChange={(v) => setTendered(v || 0)} hint={tendered > totals.total ? `Return change: ₹${formatInr(round2(tendered - totals.total))}` : undefined} />}
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>₹{formatInr(totals.subtotal)}</dd></div>
                {totals.discount > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd>−₹{formatInr(totals.discount)}</dd></div>}
                <div className="flex justify-between"><dt className="text-muted-foreground">GST {store.shop.inclusive ? '(included)' : ''}</dt><dd>₹{formatInr(totals.cgst + totals.sgst)}</dd></div>
                <div className="flex justify-between border-t pt-2 text-xl font-bold"><dt>Total</dt><dd>₹{formatInr(totals.total)}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="lg" className="flex-1" disabled={!cart.length} onClick={() => void checkout(true)}><Printer className="mr-2 size-4" aria-hidden /> Save & print</Button>
                <Button size="lg" variant="outline" disabled={!cart.length} onClick={() => void checkout(false)}>Save bill</Button>
                <Button size="lg" variant="ghost" disabled={!cart.length} onClick={() => setCart([])} aria-label="Clear cart"><X className="size-4" /></Button>
              </div>
            </div>
          </Panel>
        </div>
      )}
      {tab === 'products' && (
        <Panel title="Products" actions={<div className="flex gap-2">
          <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm">Import CSV<input type="file" accept=".csv" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const rows = parseCsv(await f.text())
            const head = rows[0].map((h) => h.toLowerCase())
            const col = (n: string) => head.findIndex((h) => h.includes(n))
            const [ni, pi, gi, hi, ci, si] = ['name', 'price', 'gst', 'hsn', 'categ', 'sku'].map(col)
            const items = rows.slice(1).map((r) => ({ id: crypto.randomUUID(), name: r[ni] ?? '', price: Number(r[pi]) || 0, gst: Number(r[gi]) || 0, hsn: r[hi] ?? '', category: r[ci] ?? '', sku: r[si] ?? '' })).filter((p) => p.name)
            save({ ...store, products: [...store.products, ...items] })
          }} /></label>
          <Button variant="outline" size="sm" onClick={() => void saveBlob(new Blob([toCsv([['name', 'price', 'gst', 'hsn', 'category', 'sku'], ...store.products.map((p) => [p.name, p.price, p.gst, p.hsn, p.category, p.sku])])], { type: 'text/csv' }), 'products.csv')}>Export CSV</Button>
        </div>}>
          <form className="mb-4 grid gap-2 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); if (!draft.name.trim()) return; save({ ...store, products: [...store.products, { ...draft, id: crypto.randomUUID() }] }); setDraft({ ...draft, name: '', price: 0, sku: '' }) }}>
            <TextInput label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            <TextInput label="Price (₹)" type="number" value={String(draft.price)} onChange={(v) => setDraft({ ...draft, price: Number(v) })} />
            <Select label="GST" value={String(draft.gst)} onChange={(v) => setDraft({ ...draft, gst: Number(v) })} options={GST_RATES.map((r) => [String(r), `${r}%`] as const)} />
            <TextInput label="HSN" value={draft.hsn} onChange={(v) => setDraft({ ...draft, hsn: v })} />
            <TextInput label="Barcode / SKU" value={draft.sku} onChange={(v) => setDraft({ ...draft, sku: v })} />
            <Button type="submit"><Plus className="mr-1 size-4" aria-hidden /> Add</Button>
          </form>
          <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Name</th><th className="p-2 text-right">Price</th><th className="p-2 text-right">GST</th><th className="p-2">HSN</th><th className="p-2">SKU</th><th /></tr></thead>
            <tbody>{store.products.map((p) => <tr key={p.id} className="border-b last:border-0"><td className="p-2">{p.name}</td><td className="p-2 text-right">₹{formatInr(p.price)}</td><td className="p-2 text-right">{p.gst}%</td><td className="p-2">{p.hsn}</td><td className="p-2">{p.sku}</td><td className="p-2 text-right"><Button variant="ghost" size="icon" aria-label={`Delete ${p.name}`} onClick={() => save({ ...store, products: store.products.filter((x) => x.id !== p.id) })}><Trash2 className="size-4" /></Button></td></tr>)}</tbody></table></div>
        </Panel>
      )}
      {tab === 'sales' && (
        <Panel title="Sales history" actions={<Button variant="outline" size="sm" disabled={!store.sales.length} onClick={() => void saveBlob(new Blob([toCsv([['bill', 'date', 'items', 'payment', 'customer', 'total'], ...store.sales.map((s) => [s.number, new Date(s.at).toLocaleString('en-IN'), s.lines.length, s.payment, s.customer, saleTotal(s)])])], { type: 'text/csv' }), 'sales.csv')}>Export CSV</Button>}>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Today’s bills</p><p className="text-2xl font-bold">{todays.length}</p></div>
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Today’s sales</p><p className="text-2xl font-bold">₹{formatInr(todays.reduce((s, x) => s + saleTotal(x), 0), 0)}</p></div>
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">All time</p><p className="text-2xl font-bold">₹{formatInr(store.sales.reduce((s, x) => s + saleTotal(x), 0), 0)}</p></div>
          </div>
          <ul className="max-h-96 space-y-1 overflow-auto text-sm">
            {store.sales.map((s) => <li key={s.id} className="flex items-center gap-3 rounded-lg p-2 odd:bg-muted/40"><span className="font-mono">{s.number}</span><span className="text-muted-foreground">{new Date(s.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span><span>{s.payment}</span><span className="ml-auto font-medium">₹{formatInr(saleTotal(s))}</span><Button variant="ghost" size="sm" onClick={() => printHtml(receiptHtml(store.shop, s), store.shop.width)}><Printer className="size-4" aria-label="Reprint" /></Button></li>)}
            {!store.sales.length && <li className="text-muted-foreground">No bills yet.</li>}
          </ul>
        </Panel>
      )}
      {tab === 'settings' && (
        <Panel title={<span className="flex items-center gap-2"><Settings className="size-4" aria-hidden /> Shop details</span>}>
          <Grid>
            <TextInput label="Shop name" value={store.shop.name} onChange={(v) => save({ ...store, shop: { ...store.shop, name: v } })} />
            <TextInput label="Phone" value={store.shop.phone} onChange={(v) => save({ ...store, shop: { ...store.shop, phone: v } })} />
            <TextInput label="Address" value={store.shop.address} onChange={(v) => save({ ...store, shop: { ...store.shop, address: v } })} />
            <TextInput label="GSTIN (leave blank if unregistered)" value={store.shop.gstin} onChange={(v) => save({ ...store, shop: { ...store.shop, gstin: v.toUpperCase() } })} />
            <TextInput label="Receipt footer" value={store.shop.footer} onChange={(v) => save({ ...store, shop: { ...store.shop, footer: v } })} />
            <Segmented label="Paper width" value={store.shop.width} onChange={(v) => save({ ...store, shop: { ...store.shop, width: v } })} options={[[58, '58 mm'], [80, '80 mm']]} />
          </Grid>
          <div className="mt-4"><Toggle label="Prices include GST (MRP)" hint="Off = GST is added on top of the price" checked={store.shop.inclusive} onChange={(v) => save({ ...store, shop: { ...store.shop, inclusive: v } })} /></div>
          <p className="mt-4 text-xs text-muted-foreground">Products, settings and sales are stored only in this browser. Export them regularly as a backup.</p>
          <Button variant="ghost" className="mt-2 text-destructive" onClick={() => { if (confirm('Delete all sales history?')) save({ ...store, sales: [], next: 1 }) }}>Clear sales history</Button>
        </Panel>
      )}
      {last && <Results files={out} summary={<p className="text-muted-foreground">Bill {last.number} saved.</p>} onReset={() => { setOut([]); setLast(null) }} />}
      <p className={cn('text-xs text-muted-foreground')}>Tip: plug in a USB/Bluetooth thermal printer, choose it in the print dialog, and set margins to “None”.</p>
    </div>
  )
}
