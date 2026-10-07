'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { compressBytes, COMPRESS_LEVELS, type CompressLevel } from '@/tools/lib/compress'
import { cropMargins, flipPdf, nUp, resizePages, rotatePages } from '@/tools/lib/pages'
import { baseName, formatBytes, loadDoc, parseRanges, saveDoc } from '@/tools/lib/pdf'
import { invertColours, type ColourMode } from '@/tools/lib/raster'
import { encryptPdf, flattenPdf, stripMetadata } from '@/tools/lib/security'
import { addHeaderFooter, addPageNumbers, addWatermark, type Position } from '@/tools/lib/stamp'
import { FileDrop, FileOrderList, Note, Panel, Results, RunBar, pdfOut, useTask, type OutFile } from '../kit'

type StepKind = 'compress' | 'watermark' | 'pageNumbers' | 'headerFooter' | 'rotate' | 'flip' | 'invert' | 'nup' | 'resize' | 'crop' | 'metadata' | 'stripMetadata' | 'flatten' | 'encrypt'

interface Step { id: string; kind: StepKind; o: Record<string, string | number | boolean> }

const CATALOG: Record<StepKind, { label: string; defaults: Step['o'] }> = {
  compress: { label: 'Compress', defaults: { level: 'recommended' } },
  watermark: { label: 'Text watermark', defaults: { text: 'CONFIDENTIAL', opacity: 0.2, size: 60, color: '#d32f2f', rotation: 45 } },
  pageNumbers: { label: 'Page numbers', defaults: { template: 'Page {n} of {total}', position: 'bottom-center', size: 10 } },
  headerFooter: { label: 'Header & footer', defaults: { header: '{file}', footer: '{date}', size: 9 } },
  rotate: { label: 'Rotate pages', defaults: { angle: 90, pages: '' } },
  flip: { label: 'Flip / mirror', defaults: { mode: 'horizontal' } },
  invert: { label: 'Colour mode', defaults: { mode: 'grayscale' } },
  nup: { label: 'Pages per sheet', defaults: { per: 2 } },
  resize: { label: 'Resize to paper size', defaults: { size: 'A4' } },
  crop: { label: 'Crop margins', defaults: { mm: 10 } },
  metadata: { label: 'Set title & author', defaults: { title: '', author: '' } },
  stripMetadata: { label: 'Remove metadata', defaults: {} },
  flatten: { label: 'Flatten forms & annotations', defaults: {} },
  encrypt: { label: 'Password-protect (always last)', defaults: { password: '' } },
}

const PRESETS: { name: string; steps: [StepKind, Partial<Step['o']>?][] }[] = [
  { name: 'Share safely', steps: [['flatten'], ['stripMetadata'], ['compress', { level: 'recommended' }]] },
  { name: 'Print handouts', steps: [['nup', { per: 4 }], ['pageNumbers']] },
  { name: 'Confidential draft', steps: [['watermark', { text: 'DRAFT' }], ['pageNumbers'], ['compress']] },
  { name: 'Email-ready', steps: [['compress', { level: 'extreme' }]] },
]

const KEY = 'ourpdf.workflows.v1'
const mk = (kind: StepKind, o: Partial<Step['o']> = {}): Step => ({ id: crypto.randomUUID(), kind, o: { ...CATALOG[kind].defaults, ...o } as Step['o'] })

function StepEditor({ step, set }: { step: Step; set: (o: Step['o']) => void }) {
  const o = step.o
  const input = (k: string, label: string, type: 'text' | 'number' | 'password' = 'text', extra: Record<string, unknown> = {}) => (
    <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs font-medium">{label}<input className="h-9 rounded-lg border bg-background px-2 text-sm font-normal" type={type} value={String(o[k] ?? '')} onChange={(e) => set({ ...o, [k]: type === 'number' ? Number(e.target.value) : e.target.value })} {...extra} /></label>
  )
  const select = (k: string, label: string, opts: readonly (readonly [string | number, string])[]) => (
    <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs font-medium">{label}<select className="h-9 rounded-lg border bg-background px-2 text-sm font-normal" value={String(o[k])} onChange={(e) => set({ ...o, [k]: typeof opts[0][0] === 'number' ? Number(e.target.value) : e.target.value })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  )
  switch (step.kind) {
    case 'compress': return select('level', 'Level', COMPRESS_LEVELS)
    case 'watermark': return <>{input('text', 'Text')}{input('size', 'Size (pt)', 'number')}{input('opacity', 'Opacity (0–1)', 'number', { step: 0.05, min: 0.05, max: 1 })}{input('rotation', 'Rotation °', 'number')}<label className="flex flex-col gap-1 text-xs font-medium">Colour<input type="color" className="h-9 w-14 rounded-lg border" value={String(o.color)} onChange={(e) => set({ ...o, color: e.target.value })} /></label></>
    case 'pageNumbers': return <>{input('template', 'Format ({n}, {total})')}{select('position', 'Position', [['bottom-center', 'Bottom centre'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'], ['top-center', 'Top centre'], ['top-right', 'Top right']])}{input('size', 'Size (pt)', 'number')}</>
    case 'headerFooter': return <>{input('header', 'Header (centre)')}{input('footer', 'Footer (left)')}{input('size', 'Size (pt)', 'number')}</>
    case 'rotate': return <>{select('angle', 'Angle', [[90, '90° right'], [180, '180°'], [270, '90° left']])}{input('pages', 'Pages (blank = all)')}</>
    case 'flip': return select('mode', 'Direction', [['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['both', 'Both']])
    case 'invert': return select('mode', 'Mode', [['grayscale', 'Grayscale'], ['dark', 'Dark mode'], ['invert', 'Negative'], ['sepia', 'Sepia'], ['high-contrast', 'High contrast']])
    case 'nup': return select('per', 'Pages per sheet', [[2, '2'], [4, '4'], [6, '6'], [9, '9'], [16, '16']])
    case 'resize': return select('size', 'Paper', [['A4', 'A4'], ['Letter', 'Letter'], ['Legal', 'Legal'], ['A3', 'A3'], ['A5', 'A5']])
    case 'crop': return input('mm', 'Margin to remove (mm)', 'number')
    case 'metadata': return <>{input('title', 'Title')}{input('author', 'Author')}</>
    case 'encrypt': return input('password', 'Password', 'password', { autoComplete: 'new-password' })
    default: return <span className="text-xs text-muted-foreground">No options</span>
  }
}

async function runStep(bytes: Uint8Array, s: Step, file: string, onProgress: (f: number) => void): Promise<Uint8Array> {
  const o = s.o
  switch (s.kind) {
    case 'compress': return compressBytes(bytes, o.level as CompressLevel, (f) => onProgress(f))
    case 'watermark': return addWatermark(bytes, { kind: 'text', text: String(o.text), size: Number(o.size) || 60, color: String(o.color), opacity: Number(o.opacity) || 0.2, rotation: Number(o.rotation) || 0, position: 'center', tiled: false, scale: 0.4, bold: true })
    case 'pageNumbers': return addPageNumbers(bytes, { template: String(o.template), position: o.position as Position, start: 1, size: Number(o.size) || 10, margin: 24, color: '#333333', skipFirst: false }, file)
    case 'headerFooter': return addHeaderFooter(bytes, { header: ['', String(o.header), ''], footer: [String(o.footer), '', ''], size: Number(o.size) || 9, margin: 24, color: '#444444', skipFirst: false, start: 1 }, file)
    case 'rotate': {
      const n = (await loadDoc(bytes)).getPageCount()
      return rotatePages(bytes, parseRanges(String(o.pages ?? ''), n), Number(o.angle))
    }
    case 'flip': return flipPdf(bytes, o.mode as 'horizontal')
    case 'invert': return invertColours(bytes, o.mode as ColourMode, { scale: 2, quality: 0.85, keepText: true, onProgress })
    case 'nup': return nUp(bytes, { perSheet: Number(o.per), sheet: 'A4', orientation: 'auto', margin: 18, gap: 9, border: true, order: 'rows' })
    case 'resize': return resizePages(bytes, o.size as 'A4', 0)
    case 'crop': {
      const m = (Number(o.mm) || 0) * (72 / 25.4)
      return cropMargins(bytes, { top: m, right: m, bottom: m, left: m })
    }
    case 'metadata': {
      const d = await loadDoc(bytes)
      if (o.title) d.setTitle(String(o.title))
      if (o.author) d.setAuthor(String(o.author))
      return saveDoc(d)
    }
    case 'stripMetadata': return stripMetadata(bytes)
    case 'flatten': return (await flattenPdf(bytes, { forms: true, annotations: true, scripts: true, keepLinks: true })).bytes
    case 'encrypt':
      if (!o.password) throw new Error('The password step needs a password.')
      return encryptPdf(bytes, { userPassword: String(o.password), ownerPassword: '', algorithm: 'AES-256', allowPrint: true, allowCopy: false, allowModify: false, allowAnnotate: false, allowForms: true })
  }
}

export function Workflow() {
  const [files, setFiles] = useState<File[]>([])
  const [steps, setSteps] = useState<Step[]>([mk('compress'), mk('pageNumbers')])
  const [saved, setSaved] = useState<{ name: string; steps: Step[] }[]>([])
  const [log, setLog] = useState<string[]>([])
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of per-browser presets
      if (raw) setSaved(JSON.parse(raw))
    } catch {
      /* storage unavailable */
    }
  }, [])
  const persist = (list: typeof saved) => {
    setSaved(list)
    try {
      localStorage.setItem(KEY, JSON.stringify(list.map((w) => ({ ...w, steps: w.steps.map((s) => ({ ...s, o: s.kind === 'encrypt' ? { password: '' } : s.o })) }))))
    } catch {
      /* ignore */
    }
  }
  const ordered = [...steps.filter((s) => s.kind !== 'encrypt'), ...steps.filter((s) => s.kind === 'encrypt')]
  return (
    <div className="space-y-6">
      <Panel title="1 · Your PDFs">
        <div className="space-y-4">
          {files.length > 0 && <FileOrderList files={files} onChange={setFiles} />}
          <FileDrop accept="application/pdf,.pdf" multiple compact={files.length > 0} label={files.length ? 'Add more PDFs' : 'Choose PDFs'} onFiles={(f) => setFiles([...files, ...f])} />
          <p className="text-xs text-muted-foreground">Add several files to run the same workflow on each of them.</p>
        </div>
      </Panel>
      <Panel title="2 · Steps (run top to bottom)" actions={<div className="flex flex-wrap gap-1">{PRESETS.map((p) => <Button key={p.name} variant="outline" size="sm" onClick={() => setSteps(p.steps.map(([k, o]) => mk(k, o)))}>{p.name}</Button>)}</div>}>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.id} className="rounded-xl border bg-background p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                <span className="flex-1 text-sm font-semibold">{CATALOG[s.kind].label}</span>
                <Button variant="ghost" size="icon" disabled={i === 0} aria-label="Move step up" onClick={() => { const n = [...steps]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSteps(n) }}><ArrowUp className="size-4" /></Button>
                <Button variant="ghost" size="icon" disabled={i === steps.length - 1} aria-label="Move step down" onClick={() => { const n = [...steps]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setSteps(n) }}><ArrowDown className="size-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Remove step" onClick={() => setSteps(steps.filter((x) => x.id !== s.id))}><Trash2 className="size-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-3"><StepEditor step={s} set={(o) => setSteps(steps.map((x) => (x.id === s.id ? { ...x, o } : x)))} /></div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Plus className="size-4 text-muted-foreground" aria-hidden />
          <select aria-label="Add a step" className="h-9 rounded-lg border bg-background px-2 text-sm" value="" onChange={(e) => { if (e.target.value) setSteps([...steps, mk(e.target.value as StepKind)]) }}>
            <option value="">Add a step…</option>
            {(Object.keys(CATALOG) as StepKind[]).map((k) => <option key={k} value={k}>{CATALOG[k].label}</option>)}
          </select>
          <Button variant="ghost" size="sm" disabled={!steps.length} onClick={() => { const name = prompt('Name this workflow')?.trim(); if (name) persist([...saved.filter((w) => w.name !== name), { name, steps }]) }}><Save className="mr-1.5 size-4" aria-hidden /> Save workflow</Button>
        </div>
        {saved.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Saved:</span>
            {saved.map((w) => (
              <span key={w.name} className="inline-flex items-center gap-1 rounded-full border pl-3">
                <button type="button" className="py-1 hover:underline" onClick={() => setSteps(w.steps.map((s) => ({ ...s, id: crypto.randomUUID() })))}>{w.name}</button>
                <button type="button" aria-label={`Delete ${w.name}`} className="rounded-full p-1 hover:bg-muted" onClick={() => persist(saved.filter((x) => x.name !== w.name))}><Trash2 className="size-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        {steps.some((s) => s.kind === 'encrypt') && steps[steps.length - 1].kind !== 'encrypt' && <div className="mt-3"><Note>Password protection always runs last, so the other steps can still read the file.</Note></div>}
      </Panel>
      <RunBar task={task} label={`Run ${steps.length} step${steps.length === 1 ? '' : 's'}${files.length > 1 ? ` on ${files.length} files` : ''}`} disabled={!files.length || !steps.length} onRun={async () => {
        setLog([])
        const r = await task.run(async (p) => {
          const res: OutFile[] = []
          const lines: string[] = []
          for (let fi = 0; fi < files.length; fi++) {
            const f = files[fi]
            let bytes: Uint8Array = new Uint8Array(await f.arrayBuffer())
            lines.push(`${f.name}: ${formatBytes(bytes.length)}`)
            for (let si = 0; si < ordered.length; si++) {
              const s = ordered[si]
              const label = `${f.name} · step ${si + 1}/${ordered.length}: ${CATALOG[s.kind].label}`
              p((fi + si / ordered.length) / files.length, label)
              try {
                bytes = await runStep(bytes, s, baseName(f.name), (x) => p((fi + (si + x) / ordered.length) / files.length, label))
              } catch (e) {
                throw new Error(`${f.name} – step ${si + 1} (${CATALOG[s.kind].label}): ${(e as Error).message}`)
              }
              lines.push(`  ${si + 1}. ${CATALOG[s.kind].label} → ${formatBytes(bytes.length)}`)
              setLog([...lines])
            }
            res.push(pdfOut(bytes, `${baseName(f.name)}-processed.pdf`))
          }
          return res
        }, 'Running workflow')
        if (r) setOut(r)
      }} />
      {log.length > 0 && <Panel title="Log"><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{log.join('\n')}</pre></Panel>}
      <Results files={out} zipName="workflow-results.zip" onReset={() => { setOut([]); setFiles([]); setLog([]) }} />
    </div>
  )
}
