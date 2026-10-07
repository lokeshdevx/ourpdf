'use client'

import { useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { digest, HASH_ALGOS, type HashAlgo } from '@/tools/lib/hash'
import { baseName, formatBytes, isPasswordError } from '@/tools/lib/pdf'
import { mask, PII_TYPES, type Box } from '@/tools/lib/pii'
import { hiddenRisks, scanPdfForPii, type HiddenRisk, type ScanResult } from '@/tools/lib/pii-scan'
import { applyRedactions } from '@/tools/lib/raster'
import { decryptPdf, encryptionInfo, encryptPdf, flattenPdf, repairPdf, stripMetadata, type EncryptionInfo } from '@/tools/lib/security'
import { ColorInput, FileChip, FileDrop, Grid, Note, Panel, PdfPicker, Results, RunBar, Segmented, TextArea, TextInput, Toggle, pdfOut, usePdfInput, useTask, type OutFile } from '../kit'

function RawPdfPicker({ file, setFile, extra }: { file: File | null; setFile: (f: File | null) => void; extra?: React.ReactNode }) {
  return file ? <FileChip file={file} extra={extra} onRemove={() => setFile(null)} /> : <FileDrop accept="application/pdf,.pdf" label="Choose PDF" onFiles={(f) => setFile(f[0])} />
}

function strength(pw: string): { score: number; label: string } {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return { score: s, label: ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][s] }
}

/* -------------------------------------------------------------- encrypt */

export function Encrypt() {
  const pdf = usePdfInput()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [owner, setOwner] = useState('')
  const [algo, setAlgo] = useState<'AES-256' | 'AES-128'>('AES-256')
  const [perm, setPerm] = useState({ print: true, copy: false, modify: false, annotate: false, forms: true })
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const st = strength(pw)
  const mismatch = pw2 !== '' && pw !== pw2
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={pdf} /></Panel>
      <Panel title="Password">
        <div className="space-y-4">
          <Grid>
            <TextInput label="Password to open the PDF" type={show ? 'text' : 'password'} value={pw} onChange={setPw} autoComplete="new-password" />
            <TextInput label="Repeat password" type={show ? 'text' : 'password'} value={pw2} onChange={setPw2} autoComplete="new-password" hint={mismatch ? 'The passwords do not match' : undefined} />
          </Grid>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm"><span className="flex gap-1">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={cn('h-1.5 w-8 rounded-full bg-muted', i < st.score && (st.score < 3 ? 'bg-amber-500' : 'bg-green-600'))} />)}</span>{pw && st.label}</div>
            <Button variant="ghost" size="sm" onClick={() => setShow(!show)}>{show ? <EyeOff className="mr-1.5 size-4" aria-hidden /> : <Eye className="mr-1.5 size-4" aria-hidden />}{show ? 'Hide' : 'Show'}</Button>
          </div>
          <Note tone="warn">There is no way to recover a forgotten password – nobody, including us, can open the file without it.</Note>
        </div>
      </Panel>
      <Panel title="Permissions (advanced)">
        <div className="space-y-4">
          <Grid>
            <Toggle label="Allow printing" checked={perm.print} onChange={(v) => setPerm({ ...perm, print: v })} />
            <Toggle label="Allow copying text & images" checked={perm.copy} onChange={(v) => setPerm({ ...perm, copy: v })} />
            <Toggle label="Allow editing" checked={perm.modify} onChange={(v) => setPerm({ ...perm, modify: v })} />
            <Toggle label="Allow comments" checked={perm.annotate} onChange={(v) => setPerm({ ...perm, annotate: v })} />
            <Toggle label="Allow form filling" checked={perm.forms} onChange={(v) => setPerm({ ...perm, forms: v })} />
          </Grid>
          <Grid>
            <TextInput label="Owner password (optional)" type="password" value={owner} onChange={setOwner} hint="Needed to change permissions later. A random one is generated if left blank." autoComplete="new-password" />
            <Segmented label="Encryption" value={algo} onChange={setAlgo} options={[['AES-256', 'AES-256 (recommended)'], ['AES-128', 'AES-128 (older readers)']]} />
          </Grid>
        </div>
      </Panel>
      <RunBar task={task} label="Encrypt PDF" disabled={!pdf.input || !pw || mismatch || pw !== pw2} onRun={async () => {
        const r = await task.run(() => encryptPdf(pdf.input!.bytes, { userPassword: pw, ownerPassword: owner, algorithm: algo, allowPrint: perm.print, allowCopy: perm.copy, allowModify: perm.modify, allowAnnotate: perm.annotate, allowForms: perm.forms }), 'Encrypting')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-protected.pdf`, algo)])
      }} />
      <Results files={out} onReset={() => { setOut([]); setPw(''); setPw2(''); pdf.reset() }} />
    </div>
  )
}

/* ------------------------------------------------------- remove password */

export function RemovePassword({ restrictionsOnly = false }: { restrictionsOnly?: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<EncryptionInfo | null>(null)
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const pick = async (f: File | null) => {
    setFile(f)
    setInfo(null)
    setOut([])
    if (f) setInfo(await encryptionInfo(new Uint8Array(await f.arrayBuffer())))
  }
  return (
    <div className="space-y-6">
      <Panel title="Protected PDF"><RawPdfPicker file={file} setFile={(f) => void pick(f)} extra={info && (info.encrypted ? (info.needsPassword ? 'needs a password to open' : 'has restrictions') : 'not encrypted')} /></Panel>
      {info && !info.encrypted && <Note tone="ok">This PDF is not encrypted – it has no password or restrictions to remove.</Note>}
      {info?.encrypted && (
        <Panel title={info.needsPassword ? 'Enter the password' : 'Restrictions found'}>
          <div className="space-y-4">
            {info.restrictions.length > 0 && <p className="text-sm">Blocked: <strong>{info.restrictions.join(', ')}</strong></p>}
            {info.needsPassword ? (
              <>
                <TextInput label="Current password" type="password" value={pw} onChange={setPw} autoComplete="current-password" />
                {restrictionsOnly && <Note>This file needs a password just to open it. Enter it to remove both the password and the restrictions.</Note>}
              </>
            ) : <p className="text-sm text-muted-foreground">No password is needed to open this file, so the restrictions can be removed directly.</p>}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> <span>I own this document or have permission to remove its protection.</span></label>
          </div>
        </Panel>
      )}
      <RunBar task={task} label={info?.needsPassword ? 'Remove password' : 'Remove restrictions'} disabled={!info?.encrypted || !confirm || (info.needsPassword && !pw)} onRun={async () => {
        const r = await task.run(async () => {
          try {
            return await decryptPdf(new Uint8Array(await file!.arrayBuffer()), pw)
          } catch (e) {
            if (isPasswordError(e)) throw new Error('That password is not correct.')
            throw e
          }
        }, 'Decrypting')
        if (r) setOut([pdfOut(r, `${baseName(file!.name)}-unlocked.pdf`, 'no password, no restrictions')])
      }} />
      <Results files={out} onReset={() => { setOut([]); setFile(null); setInfo(null); setPw('') }} />
    </div>
  )
}

export const UnlockPdf = () => <RemovePassword restrictionsOnly />

/* --------------------------------------------------------- auto-redact */

const DEFAULT_TYPES = ['aadhaar', 'pan', 'card', 'email', 'phone-in', 'phone', 'gstin', 'passport', 'voter', 'upi', 'ssn', 'iban']

function PiiTypePicker({ types, setTypes }: { types: string[]; setTypes: (t: string[]) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {PII_TYPES.map((t) => (
        <label key={t.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
          <input type="checkbox" checked={types.includes(t.id)} onChange={(e) => setTypes(e.target.checked ? [...types, t.id] : types.filter((x) => x !== t.id))} />
          <span className="flex-1">{t.label}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', t.risk === 'high' ? 'bg-red-500/15 text-red-700 dark:text-red-400' : t.risk === 'medium' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>{t.risk}</span>
        </label>
      ))}
    </div>
  )
}

function FindingsList({ scan, chosen, setChosen }: { scan: ScanResult; chosen: Set<number>; setChosen: (s: Set<number>) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, ScanResult['hits']>()
    for (const h of scan.hits) m.set(h.label, [...(m.get(h.label) ?? []), h])
    return [...m.entries()]
  }, [scan])
  if (!scan.hits.length) return <Note tone="ok">No personal data of the selected types was found{scan.scannedPages.length && !scan.ocrPages.length ? ` – but ${scan.scannedPages.length} page(s) are scanned images. Turn on “Read scanned pages” to check them.` : '.'}</Note>
  return (
    <div className="space-y-3">
      {groups.map(([label, hits]) => (
        <details key={label} open className="rounded-xl border">
          <summary className="flex cursor-pointer items-center justify-between gap-2 p-3 text-sm font-medium">
            <span>{label} <span className="text-muted-foreground">({hits.length})</span></span>
            <span className="flex gap-2 text-xs font-normal">
              <button type="button" className="text-primary hover:underline" onClick={(e) => { e.preventDefault(); const s = new Set(chosen); hits.forEach((h) => s.add(h.id)); setChosen(s) }}>all</button>
              <button type="button" className="text-primary hover:underline" onClick={(e) => { e.preventDefault(); const s = new Set(chosen); hits.forEach((h) => s.delete(h.id)); setChosen(s) }}>none</button>
            </span>
          </summary>
          <ul className="max-h-60 space-y-1 overflow-auto border-t p-2 text-sm">
            {hits.map((h) => (
              <li key={h.id}><label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted"><input type="checkbox" checked={chosen.has(h.id)} onChange={(e) => { const s = new Set(chosen); if (e.target.checked) s.add(h.id); else s.delete(h.id); setChosen(s) }} /><code className="font-mono">{mask(h.value)}</code><span className="ml-auto text-xs text-muted-foreground">page {h.page + 1}</span></label></li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

function boxesByPage(scan: ScanResult, chosen: Set<number>): Map<number, Box[]> {
  const m = new Map<number, Box[]>()
  for (const h of scan.hits) if (chosen.has(h.id)) m.set(h.page, [...(m.get(h.page) ?? []), ...h.boxes])
  return m
}

export function AutoRedact() {
  const pdf = usePdfInput()
  const [types, setTypes] = useState<string[]>(DEFAULT_TYPES)
  const [custom, setCustom] = useState('')
  const [ocr, setOcr] = useState(true)
  const [colour, setColour] = useState('#000000')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setScan(null); pdf.reset() } }} /></Panel>
      <Panel title="What to find">
        <div className="space-y-4">
          <PiiTypePicker types={types} setTypes={setTypes} />
          <TextArea label="Also redact these words or names (one per line)" value={custom} onChange={setCustom} rows={3} placeholder={'Ravi Kumar\nProject Falcon'} />
          <Toggle label="Read scanned pages (OCR)" hint="Pages that are pictures – e.g. a scanned Aadhaar card – are read on your device first" checked={ocr} onChange={setOcr} />
          <p className="text-xs text-muted-foreground">Aadhaar numbers are checked with the Verhoeff checksum and card numbers with the Luhn checksum, so random digit strings are not flagged.</p>
        </div>
      </Panel>
      <Button size="lg" variant={scan ? 'outline' : 'default'} disabled={!pdf.input || task.busy || (!types.length && !custom.trim())} onClick={async () => {
        const r = await task.run((p) => scanPdfForPii(pdf.input!.bytes, types, custom.split('\n'), { ocr, onProgress: p }), 'Scanning')
        if (r) {
          setScan(r)
          setChosen(new Set(r.hits.map((h) => h.id)))
          setOut([])
        }
      }}>{scan ? 'Scan again' : 'Find personal data'}</Button>
      {scan && <Panel title={`${scan.hits.length} item${scan.hits.length === 1 ? '' : 's'} found on ${new Set(scan.hits.map((h) => h.page)).size} page(s)`}><FindingsList scan={scan} chosen={chosen} setChosen={setChosen} /><div className="mt-4 max-w-xs"><ColorInput label="Redaction colour" value={colour} onChange={setColour} /></div></Panel>}
      <RunBar task={task} label={`Redact ${chosen.size} item${chosen.size === 1 ? '' : 's'}`} disabled={!scan || !chosen.size} onRun={async () => {
        const r = await task.run((p) => applyRedactions(pdf.input!.bytes, boxesByPage(scan!, chosen), { colour, onProgress: p }), 'Redacting')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-redacted.pdf`, `${chosen.size} items permanently removed`)])
      }} />
      {out.length > 0 && <Note tone="ok">Pages with redactions were rebuilt from pixels: the original text under each box is gone from the file, not just covered.</Note>}
      <Results files={out} onReset={() => { setOut([]); setScan(null); pdf.reset() }} />
    </div>
  )
}

/* ------------------------------------------------------ privacy scanner */

export function PrivacyScanner() {
  const pdf = usePdfInput()
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [risks, setRisks] = useState<HiddenRisk[]>([])
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [strip, setStrip] = useState(true)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const score = useMemo(() => {
    if (!scan) return 0
    const w = { high: 25, medium: 10, low: 3 }
    return Math.min(100, scan.hits.reduce((s, h) => s + w[h.risk], 0) + risks.reduce((s, r) => s + w[r.risk], 0))
  }, [scan, risks])
  const level = score >= 50 ? 'High' : score >= 20 ? 'Medium' : score > 0 ? 'Low' : 'None'
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setScan(null); pdf.reset() } }} /></Panel>
      <RunBar task={task} label={scan ? 'Scan again' : 'Scan for privacy risks'} disabled={!pdf.input} onRun={async () => {
        const r = await task.run(async (p) => {
          const hidden = await hiddenRisks(pdf.input!.bytes)
          const s = await scanPdfForPii(pdf.input!.bytes, PII_TYPES.map((t) => t.id), [], { ocr: true, onProgress: p })
          return { hidden, s }
        }, 'Scanning')
        if (r) {
          setRisks(r.hidden)
          setScan(r.s)
          setChosen(new Set(r.s.hits.filter((h) => h.risk !== 'low').map((h) => h.id)))
          setOut([])
        }
      }} />
      {scan && (
        <>
          <Panel>
            <div className="flex flex-wrap items-center gap-5">
              <div className={cn('grid size-24 place-items-center rounded-full border-8 text-2xl font-black', level === 'High' ? 'border-red-500 text-red-600' : level === 'Medium' ? 'border-amber-500 text-amber-600' : 'border-green-600 text-green-700')}>{score}</div>
              <div>
                <p className="flex items-center gap-2 text-lg font-bold">{level === 'None' || level === 'Low' ? <ShieldCheck className="size-5 text-green-600" aria-hidden /> : <ShieldAlert className="size-5 text-red-600" aria-hidden />} Privacy risk: {level}</p>
                <p className="text-sm text-muted-foreground">{scan.hits.length} personal data item{scan.hits.length === 1 ? '' : 's'} · {risks.length} hidden-information finding{risks.length === 1 ? '' : 's'} · {scan.pages} pages{scan.ocrPages.length ? ` (${scan.ocrPages.length} read with OCR)` : ''}</p>
              </div>
            </div>
          </Panel>
          {risks.length > 0 && (
            <Panel title="Hidden information">
              <ul className="space-y-2">{risks.map((r) => <li key={r.id} className="rounded-xl border p-3 text-sm"><p className="flex items-center justify-between gap-2 font-medium">{r.label}<span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase', r.risk === 'high' ? 'bg-red-500/15 text-red-700' : r.risk === 'medium' ? 'bg-amber-500/15 text-amber-700' : 'bg-muted')}>{r.risk}</span></p><p className="mt-1 break-words text-muted-foreground">{r.detail}</p></li>)}</ul>
              <div className="mt-4"><Toggle label="Remove metadata, scripts, attachments and comments in the cleaned copy" checked={strip} onChange={setStrip} /></div>
            </Panel>
          )}
          <Panel title="Personal data"><FindingsList scan={scan} chosen={chosen} setChosen={setChosen} /></Panel>
        </>
      )}
      <RunBar task={task} label="Export cleaned & redacted PDF" disabled={!scan || (!chosen.size && !strip)} onRun={async () => {
        const r = await task.run(async (p) => {
          let bytes = pdf.input!.bytes
          if (chosen.size) bytes = await applyRedactions(bytes, boxesByPage(scan!, chosen), { colour: '#000000', onProgress: (f, l) => p(f * 0.8, l) })
          if (strip) {
            bytes = (await flattenPdf(bytes, { forms: false, annotations: true, scripts: true, keepLinks: true })).bytes
            bytes = await stripMetadata(bytes)
            const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib')
            const d = await PDFDocument.load(bytes, { updateMetadata: false })
            const names = d.catalog.lookup(PDFName.of('Names'))
            if (names instanceof PDFDict) names.delete(PDFName.of('EmbeddedFiles'))
            bytes = await d.save({ useObjectStreams: true, addDefaultPage: false })
          }
          return bytes
        }, 'Cleaning')
        if (r) setOut([pdfOut(r, `${baseName(pdf.input!.file.name)}-clean.pdf`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); setScan(null); pdf.reset() }} />
    </div>
  )
}

/* ---------------------------------------------------------- fingerprint */

export function Fingerprint() {
  const [files, setFiles] = useState<File[]>([])
  const [algos, setAlgos] = useState<HashAlgo[]>(['SHA-256', 'SHA-1', 'MD5'])
  const [hashes, setHashes] = useState<Record<string, Record<string, string>>>({})
  const [expected, setExpected] = useState('')
  const task = useTask()
  const exp = expected.trim().toLowerCase()
  const matchCount = exp ? Object.values(hashes).filter((h) => Object.values(h).includes(exp)).length : 0
  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success('Copied') }
  return (
    <div className="space-y-6">
      <Panel title="Files (any type)">
        <div className="space-y-3">
          {files.map((f, i) => <FileChip key={i} file={f} onRemove={() => setFiles(files.filter((_, k) => k !== i))} />)}
          <FileDrop accept="*/*" multiple compact={files.length > 0} label={files.length ? 'Add files' : 'Choose files'} onFiles={(f) => setFiles([...files, ...f])} />
        </div>
      </Panel>
      <Panel title="Algorithms">
        <div className="flex flex-wrap gap-2">
          {HASH_ALGOS.map((a) => <label key={a} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={algos.includes(a)} onChange={(e) => setAlgos(e.target.checked ? [...algos, a] : algos.filter((x) => x !== a))} />{a}</label>)}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">SHA-256 is the standard for integrity checks. MD5 and SHA-1 are provided for compatibility but are no longer collision-resistant.</p>
      </Panel>
      <RunBar task={task} label="Generate hashes" disabled={!files.length || !algos.length} onRun={async () => {
        const r = await task.run(async (p) => {
          const res: Record<string, Record<string, string>> = {}
          for (let i = 0; i < files.length; i++) {
            const bytes = new Uint8Array(await files[i].arrayBuffer())
            const h: Record<string, string> = {}
            for (const a of HASH_ALGOS.filter((x) => algos.includes(x))) h[a] = await digest(bytes, a)
            res[`${i}:${files[i].name}`] = h
            p((i + 1) / files.length, files[i].name)
          }
          return res
        }, 'Hashing')
        if (r) setHashes(r)
      }} />
      {Object.keys(hashes).length > 0 && (
        <>
          <Panel title="Verify against a known hash"><TextInput label="Paste the expected hash" value={expected} onChange={setExpected} placeholder="e.g. 9f86d081884c7d65…" hint={exp ? (matchCount ? `✅ Matches ${matchCount} file${matchCount > 1 ? 's' : ''}` : '❌ No file matches this hash') : undefined} /></Panel>
          {Object.entries(hashes).map(([k, h]) => {
            const name = k.slice(k.indexOf(':') + 1)
            const f = files[Number(k.split(':')[0])]
            return (
              <Panel key={k} title={<span className="break-all">{name} <span className="font-normal text-muted-foreground">· {f ? formatBytes(f.size) : ''}</span></span>}>
                <dl className="space-y-2">{Object.entries(h).map(([a, v]) => (
                  <div key={a} className={cn('flex flex-wrap items-center gap-2 rounded-lg border p-2', exp && v === exp && 'border-green-600 bg-green-600/10')}>
                    <dt className="w-20 shrink-0 text-xs font-semibold">{a}</dt><dd className="min-w-0 flex-1 break-all font-mono text-xs">{v}</dd>
                    <Button variant="ghost" size="icon" onClick={() => copy(v)} aria-label={`Copy ${a}`}><Copy className="size-4" /></Button>
                  </div>
                ))}</dl>
              </Panel>
            )
          })}
          <Results files={[{ name: 'checksums.txt', blob: new Blob([Object.entries(hashes).flatMap(([k, h]) => Object.entries(h).map(([a, v]) => `${a}  ${v}  ${k.slice(k.indexOf(':') + 1)}`)).join('\n') + '\n'], { type: 'text/plain' }) }]} />
        </>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- repair */

export function Repair() {
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="Damaged PDF"><RawPdfPicker file={file} setFile={(f) => { setFile(f); setOut([]); setNotes([]) }} /></Panel>
      <Note>Repairs broken cross-reference tables, missing end-of-file markers, junk before the header and damaged page trees. If the structure can’t be rebuilt, every readable page is recovered visually.</Note>
      <RunBar task={task} label="Repair PDF" disabled={!file} onRun={async () => {
        const r = await task.run(async (p) => repairPdf(new Uint8Array(await file!.arrayBuffer()), p), 'Repairing')
        if (r) {
          setNotes(r.notes)
          setOut([pdfOut(r.bytes, `${baseName(file!.name)}-repaired.pdf`, `${r.pages} page${r.pages === 1 ? '' : 's'} recovered`)])
        }
      }} />
      <Results files={out} summary={notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{notes.map((n) => <li key={n}>{n}</li>)}</ul>} onReset={() => { setOut([]); setFile(null) }} />
    </div>
  )
}
