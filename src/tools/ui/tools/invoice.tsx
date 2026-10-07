'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { GST_RATES, GST_STATES, formatInr, rupeesInWords, validGstin } from '@/tools/lib/india'
import { computeTotals, invoicePdf, type Invoice, type Item, type Party } from '@/tools/lib/invoice'
import { closePdf, openPdfjs, renderPage } from '@/tools/lib/pdf'
import { ColorInput, FileDrop, Grid, Note, Panel, Results, RunBar, Select, TextArea, TextInput, Toggle, pdfOut, useTask, type OutFile } from '../kit'

const KEY = 'ourpdf.gst-invoice.v1'
const today = () => new Date().toISOString().slice(0, 10)
const EMPTY_PARTY: Party = { name: '', address: '', gstin: '', state: '', phone: '', email: '' }
const ITEM: Item = { desc: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, discount: 0, gst: 18 }
const STATE_OPTIONS = [['', 'Select state'] as const, ...GST_STATES.map(([c, n]) => [c, `${c} – ${n}`] as const)]

const initial = (): Invoice => ({
  kind: 'TAX INVOICE', number: 'INV-0001', date: today(), due: '', reverseCharge: false, copy: 'Original for Recipient',
  seller: { ...EMPTY_PARTY, name: 'Sharma Electronics', address: '12 MG Road, Bengaluru 560001', gstin: '29ABCDE1234F1ZW', state: '29', phone: '+91 80 1234 5678' },
  buyer: { ...EMPTY_PARTY, name: 'Mehta Traders', address: '45 Linking Road, Mumbai 400050', gstin: '27AAACM1234A1Z8', state: '27' },
  shipTo: '', placeOfSupply: '27',
  items: [{ desc: 'LED Monitor 24"', hsn: '8528', qty: 2, unit: 'Nos', rate: 8500, discount: 0, gst: 18 }, { desc: 'Installation service', hsn: '998713', qty: 1, unit: 'Job', rate: 1000, discount: 0, gst: 18 }],
  notes: 'Thank you for your business!', terms: 'Payment due within 15 days. Goods once sold will not be taken back. Subject to Bengaluru jurisdiction.',
  bank: { name: 'State Bank of India', account: '00000012345678', ifsc: 'SBIN0001234', branch: 'MG Road', upi: '' }, signatory: 'Authorised Signatory', shipping: 0, roundOff: true,
})

function PartyFields({ p, set, label, gstinRequired }: { p: Party; set: (p: Party) => void; label: string; gstinRequired?: boolean }) {
  const bad = p.gstin && !validGstin(p.gstin)
  return (
    <Panel title={label}>
      <Grid>
        <TextInput label="Name" value={p.name} onChange={(v) => set({ ...p, name: v })} />
        <TextInput label={`GSTIN${gstinRequired ? '' : ' (optional for B2C)'}`} value={p.gstin} onChange={(v) => { const g = v.toUpperCase(); set({ ...p, gstin: g, state: /^\d{2}/.test(g) && GST_STATES.some(([c]) => c === g.slice(0, 2)) ? g.slice(0, 2) : p.state }) }} hint={bad ? '⚠ This GSTIN’s format or check digit looks wrong' : undefined} />
        <div className="sm:col-span-2"><TextArea label="Address" value={p.address} onChange={(v) => set({ ...p, address: v })} rows={2} /></div>
        <Select label="State" value={p.state} onChange={(v) => set({ ...p, state: v })} options={STATE_OPTIONS} />
        <TextInput label="Phone / email" value={p.phone} onChange={(v) => set({ ...p, phone: v })} />
      </Grid>
    </Panel>
  )
}

export function GstInvoice() {
  const [inv, setInv] = useState<Invoice>(initial)
  const [accent, setAccent] = useState('#1f3a8a')
  const [preview, setPreview] = useState('')
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const s = JSON.parse(raw)
        const next = initial()
        // keep the seller profile, bank and counter; start a fresh invoice
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved business profile
        setInv({ ...next, seller: s.seller ?? next.seller, bank: s.bank ?? next.bank, terms: s.terms ?? next.terms, signatory: s.signatory ?? next.signatory, number: s.next ?? next.number })
        if (s.accent) setAccent(s.accent)
      }
    } catch {
      /* ignore */
    }
  }, [])
  const t = useMemo(() => computeTotals(inv), [inv])
  useEffect(() => {
    let cancel = false
    const h = setTimeout(async () => {
      try {
        const bytes = await invoicePdf(inv, accent)
        const doc = await openPdfjs(bytes)
        const url = (await renderPage(await doc.getPage(1), 1.1)).toDataURL('image/jpeg', 0.85)
        await closePdf(doc)
        if (!cancel) setPreview(url)
      } catch {
        /* preview is best effort */
      }
    }, 450)
    return () => {
      cancel = true
      clearTimeout(h)
    }
  }, [inv, accent])
  const setItem = (i: number, patch: Partial<Item>) => setInv({ ...inv, items: inv.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) })
  const bump = (n: string) => n.replace(/(\d+)(?!.*\d)/, (d) => String(Number(d) + 1).padStart(d.length, '0'))
  return (
    <div className="space-y-6">
      <Panel title="Invoice">
        <Grid cols={3}>
          <Select label="Document type" value={inv.kind} onChange={(v) => setInv({ ...inv, kind: v })} options={[['TAX INVOICE', 'Tax Invoice'], ['BILL OF SUPPLY', 'Bill of Supply (composition / exempt)'], ['PROFORMA INVOICE', 'Proforma Invoice']]} />
          <TextInput label="Invoice number" value={inv.number} onChange={(v) => setInv({ ...inv, number: v })} hint="Up to 16 characters; must be unique in the financial year" />
          <Select label="Copy" value={inv.copy} onChange={(v) => setInv({ ...inv, copy: v })} options={[['Original for Recipient', 'Original for Recipient'], ['Duplicate for Transporter', 'Duplicate for Transporter'], ['Triplicate for Supplier', 'Triplicate for Supplier'], ['', 'None']]} />
          <TextInput label="Invoice date" type="date" value={inv.date} onChange={(v) => setInv({ ...inv, date: v })} />
          <TextInput label="Due date" type="date" value={inv.due} onChange={(v) => setInv({ ...inv, due: v })} />
          <Select label="Place of supply" value={inv.placeOfSupply} onChange={(v) => setInv({ ...inv, placeOfSupply: v })} options={STATE_OPTIONS} />
        </Grid>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Toggle label="Reverse charge applies" checked={inv.reverseCharge} onChange={(v) => setInv({ ...inv, reverseCharge: v })} />
          <Toggle label="Round off the total" checked={inv.roundOff} onChange={(v) => setInv({ ...inv, roundOff: v })} />
        </div>
        <p className="mt-3 text-sm">{inv.kind === 'BILL OF SUPPLY' ? 'No GST is charged on a Bill of Supply.' : t.intra ? <>Intra-state supply → <strong>CGST + SGST</strong></> : <>Inter-state supply → <strong>IGST</strong></>}</p>
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <PartyFields label="Your business (supplier)" p={inv.seller} set={(p) => setInv({ ...inv, seller: p })} gstinRequired />
        <PartyFields label="Customer (bill to)" p={inv.buyer} set={(p) => setInv({ ...inv, buyer: p, placeOfSupply: p.state && p.state !== inv.buyer.state ? p.state : inv.placeOfSupply })} />
      </div>
      <Panel title="Items" actions={<Button variant="outline" size="sm" onClick={() => setInv({ ...inv, items: [...inv.items, { ...ITEM }] })}><Plus className="mr-1 size-4" aria-hidden /> Add item</Button>}>
        <div className="space-y-3">
          {inv.items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_0.7fr_0.7fr_1fr_0.7fr_0.8fr_auto] sm:items-end">
              <div className="col-span-2 sm:col-span-1"><TextInput label="Description" value={it.desc} onChange={(v) => setItem(i, { desc: v })} /></div>
              <TextInput label="HSN / SAC" value={it.hsn} onChange={(v) => setItem(i, { hsn: v.replace(/\D/g, '').slice(0, 8) })} />
              <TextInput label="Qty" type="number" value={String(it.qty)} onChange={(v) => setItem(i, { qty: Number(v) })} />
              <TextInput label="Unit" value={it.unit} onChange={(v) => setItem(i, { unit: v })} />
              <TextInput label="Rate (₹)" type="number" value={String(it.rate)} onChange={(v) => setItem(i, { rate: Number(v) })} />
              <TextInput label="Disc %" type="number" value={String(it.discount)} onChange={(v) => setItem(i, { discount: Number(v) })} />
              <Select label="GST %" value={String(it.gst)} onChange={(v) => setItem(i, { gst: Number(v) })} options={GST_RATES.map((r) => [String(r), `${r}%`] as const)} />
              <Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => setInv({ ...inv, items: inv.items.filter((_, k) => k !== i) })}><Trash2 className="size-4" /></Button>
              <p className="col-span-2 text-right text-xs text-muted-foreground sm:col-span-8">Line total: ₹{formatInr(t.lines[i]?.total ?? 0)}</p>
            </div>
          ))}
          <Grid cols={3}><TextInput label="Shipping / other charges (₹)" type="number" value={String(inv.shipping)} onChange={(v) => setInv({ ...inv, shipping: Number(v) })} /></Grid>
        </div>
        <dl className="mt-4 grid gap-1 rounded-xl bg-muted/50 p-4 text-sm sm:ml-auto sm:w-80">
          {[['Taxable value', t.taxable], ...(t.intra ? [['CGST', t.cgst], ['SGST', t.sgst]] : [['IGST', t.igst]]), ...(t.shipping ? [['Shipping', t.shipping]] : []), ...(t.round ? [['Round off', t.round]] : [])].map(([k, v]) => <div key={k as string} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd>₹{formatInr(v as number)}</dd></div>)}
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold"><dt>Total</dt><dd>₹{formatInr(t.grand)}</dd></div>
          <p className="mt-1 text-xs text-muted-foreground">{rupeesInWords(t.grand)}</p>
        </dl>
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Payment & terms">
          <div className="space-y-4">
            <Grid>
              <TextInput label="Bank" value={inv.bank.name} onChange={(v) => setInv({ ...inv, bank: { ...inv.bank, name: v } })} />
              <TextInput label="Account number" value={inv.bank.account} onChange={(v) => setInv({ ...inv, bank: { ...inv.bank, account: v } })} />
              <TextInput label="IFSC" value={inv.bank.ifsc} onChange={(v) => setInv({ ...inv, bank: { ...inv.bank, ifsc: v.toUpperCase() } })} />
              <TextInput label="Branch" value={inv.bank.branch} onChange={(v) => setInv({ ...inv, bank: { ...inv.bank, branch: v } })} />
              <TextInput label="UPI ID" value={inv.bank.upi} onChange={(v) => setInv({ ...inv, bank: { ...inv.bank, upi: v } })} />
              <TextInput label="Signatory" value={inv.signatory} onChange={(v) => setInv({ ...inv, signatory: v })} />
            </Grid>
            <TextArea label="Notes" value={inv.notes} onChange={(v) => setInv({ ...inv, notes: v })} rows={2} />
            <TextArea label="Terms & conditions" value={inv.terms} onChange={(v) => setInv({ ...inv, terms: v })} rows={3} />
          </div>
        </Panel>
        <Panel title="Branding">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="mb-1.5 text-sm font-medium">Logo</p>{inv.logo ? <Button variant="outline" size="sm" onClick={() => setInv({ ...inv, logo: undefined })}>Remove logo</Button> : <FileDrop compact accept="image/png,image/jpeg" label="Add logo" onFiles={async (f) => setInv({ ...inv, logo: { bytes: new Uint8Array(await f[0].arrayBuffer()), mime: f[0].type } })} />}</div>
              <div><p className="mb-1.5 text-sm font-medium">Signature / stamp</p>{inv.signature ? <Button variant="outline" size="sm" onClick={() => setInv({ ...inv, signature: undefined })}>Remove signature</Button> : <FileDrop compact accept="image/png,image/jpeg" label="Add signature" onFiles={async (f) => setInv({ ...inv, signature: { bytes: new Uint8Array(await f[0].arrayBuffer()), mime: f[0].type } })} />}</div>
            </div>
            <ColorInput label="Accent colour" value={accent} onChange={setAccent} />
            <Note>Includes every field required by Rule 46 of the CGST Rules: supplier & recipient GSTIN, serial number, date, HSN/SAC, taxable value, rate and amount of each tax, place of supply, reverse charge and signature. Check e-invoicing (IRN) obligations if your turnover requires it.</Note>
          </div>
        </Panel>
      </div>
      <Panel title="Preview">
        { }
        {preview ? <img src={preview} alt="Invoice preview" className={cn('mx-auto w-full max-w-2xl rounded border shadow-sm')} /> : <div className="mx-auto aspect-[1/1.414] max-w-2xl animate-pulse rounded bg-muted" />}
      </Panel>
      <RunBar task={task} label="Download invoice PDF" onRun={async () => {
        const r = await task.run(() => invoicePdf(inv, accent), 'Generating')
        if (!r) return
        setOut([pdfOut(r, `${inv.number.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`, `₹${formatInr(t.grand)}`)])
        try {
          localStorage.setItem(KEY, JSON.stringify({ seller: inv.seller, bank: inv.bank, terms: inv.terms, signatory: inv.signatory, next: bump(inv.number), accent }))
        } catch {
          /* ignore */
        }
      }} extra={<Button variant="ghost" onClick={() => setInv({ ...inv, number: bump(inv.number), buyer: { ...EMPTY_PARTY }, items: [{ ...ITEM }], date: today(), due: '' })}>New invoice</Button>} />
      <Results files={out} onReset={() => setOut([])} />
    </div>
  )
}
