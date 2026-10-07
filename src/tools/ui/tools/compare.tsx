'use client'

import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { allPageText, closePdf, openPdfjs, renderPage } from '@/tools/lib/pdf'
import { Note, Panel, PdfPicker, RunBar, Segmented, usePdfInput, useTask } from '../kit'

type Op = { t: 'same' | 'add' | 'del'; w: string }

/** Word-level diff (LCS). Long inputs are diffed line by line first to keep it fast. */
export function diffWords(a: string, b: string): Op[] {
  const A = a.split(/(\s+)/).filter((x) => x !== '')
  const B = b.split(/(\s+)/).filter((x) => x !== '')
  if (A.length * B.length > 9e6) return [...A.map((w) => ({ t: 'del' as const, w })), ...B.map((w) => ({ t: 'add' as const, w }))]
  const n = A.length, m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: Op[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: 'same', w: A[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: 'del', w: A[i++] })
    else out.push({ t: 'add', w: B[j++] })
  }
  while (i < n) out.push({ t: 'del', w: A[i++] })
  while (j < m) out.push({ t: 'add', w: B[j++] })
  return out
}

interface Rendered { a: string[]; b: string[]; diff: string[]; changed: number[]; textA: string[]; textB: string[] }

async function renderAll(bytes: Uint8Array, scale: number, onProgress: (f: number) => void): Promise<HTMLCanvasElement[]> {
  const doc = await openPdfjs(bytes)
  const out: HTMLCanvasElement[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    out.push(await renderPage(await doc.getPage(i), scale))
    onProgress(i / doc.numPages)
  }
  await closePdf(doc)
  return out
}

function pixelDiff(a: HTMLCanvasElement | undefined, b: HTMLCanvasElement | undefined): { url: string; changed: boolean } {
  const w = Math.max(a?.width ?? 0, b?.width ?? 0), h = Math.max(a?.height ?? 0, b?.height ?? 0)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const get = (x?: HTMLCanvasElement) => {
    const t = document.createElement('canvas')
    t.width = w
    t.height = h
    const tc = t.getContext('2d', { willReadFrequently: true })!
    tc.fillStyle = '#fff'
    tc.fillRect(0, 0, w, h)
    if (x) tc.drawImage(x, 0, 0)
    return tc.getImageData(0, 0, w, h).data
  }
  const da = get(a), db = get(b)
  const img = ctx.createImageData(w, h)
  let changed = 0
  for (let i = 0; i < da.length; i += 4) {
    const la = (da[i] + da[i + 1] + da[i + 2]) / 3, lb = (db[i] + db[i + 1] + db[i + 2]) / 3
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
    if (d > 60) {
      changed++
      // red = only in the original (removed), green = only in the new version (added)
      if (la < lb) { img.data[i] = 220; img.data[i + 1] = 38; img.data[i + 2] = 38 } else { img.data[i] = 22; img.data[i + 1] = 163; img.data[i + 2] = 74 }
      img.data[i + 3] = 255
    } else {
      const v = 255 - (255 - Math.min(la, lb)) * 0.25
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return { url: c.toDataURL('image/jpeg', 0.8), changed: changed > (w * h) / 20000 }
}

export function ComparePdfs() {
  const a = usePdfInput()
  const b = usePdfInput()
  const [res, setRes] = useState<Rendered | null>(null)
  const [view, setView] = useState<'side' | 'overlay' | 'text'>('side')
  const [page, setPage] = useState(0)
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const task = useTask()
  const n = res ? Math.max(res.a.length, res.b.length) : 0
  const textDiff = useMemo(() => (res && view === 'text' ? diffWords(res.textA[page] ?? '', res.textB[page] ?? '') : []), [res, view, page])
  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return
    syncing.current = true
    to.scrollTop = (from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight)) * (to.scrollHeight - to.clientHeight)
    requestAnimationFrame(() => (syncing.current = false))
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Original"><PdfPicker pdf={{ ...a, reset: () => { setRes(null); a.reset() } }} label="Choose original" /></Panel>
        <Panel title="Changed version"><PdfPicker pdf={{ ...b, reset: () => { setRes(null); b.reset() } }} label="Choose new version" /></Panel>
      </div>
      <RunBar task={task} label="Compare" disabled={!a.input || !b.input} onRun={async () => {
        const r = await task.run(async (p) => {
          const [ca, cb] = [await renderAll(a.input!.bytes, 1.3, (f) => p(f * 0.35, 'Rendering original')), await renderAll(b.input!.bytes, 1.3, (f) => p(0.35 + f * 0.35, 'Rendering new version'))]
          const docA = await openPdfjs(a.input!.bytes), docB = await openPdfjs(b.input!.bytes)
          const [tA, tB] = [await allPageText(docA), await allPageText(docB)]
          await closePdf(docA)
          await closePdf(docB)
          const len = Math.max(ca.length, cb.length)
          const out: Rendered = { a: [], b: [], diff: [], changed: [], textA: tA.map((x) => x.text), textB: tB.map((x) => x.text) }
          for (let i = 0; i < len; i++) {
            out.a.push(ca[i]?.toDataURL('image/jpeg', 0.8) ?? '')
            out.b.push(cb[i]?.toDataURL('image/jpeg', 0.8) ?? '')
            const d = pixelDiff(ca[i], cb[i])
            out.diff.push(d.url)
            if (d.changed || (out.textA[i] ?? '') !== (out.textB[i] ?? '')) out.changed.push(i)
            p(0.7 + (0.3 * (i + 1)) / len, 'Finding differences')
          }
          return out
        }, 'Comparing')
        if (r) {
          setRes(r)
          setPage(r.changed[0] ?? 0)
        }
      }} />
      {res && (
        <>
          <Note tone={res.changed.length ? 'warn' : 'ok'}>{res.changed.length ? <>Differences on {res.changed.length} of {n} page{n === 1 ? '' : 's'}: {res.changed.slice(0, 30).map((i) => <button key={i} type="button" onClick={() => setPage(i)} className="mx-0.5 underline">{i + 1}</button>)}{res.changed.length > 30 ? '…' : ''}</> : 'No visible or text differences were found.'}{res.a.length !== res.b.length && ` The original has ${res.a.length} pages, the new version ${res.b.length}.`}</Note>
          <Panel>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Segmented value={view} onChange={setView} options={[['side', 'Side by side'], ['overlay', 'Highlight changes'], ['text', 'Text changes']]} />
              {view !== 'side' && <label className="flex items-center gap-2 text-sm">Page <select className="h-9 rounded-lg border bg-background px-2" value={page} onChange={(e) => setPage(Number(e.target.value))}>{Array.from({ length: n }, (_, i) => <option key={i} value={i}>{i + 1}{res.changed.includes(i) ? ' •' : ''}</option>)}</select></label>}
            </div>
            {view === 'side' && (
              <div className="grid grid-cols-2 gap-3">
                {[res.a, res.b].map((list, k) => (
                  <div key={k} ref={k ? right : left} onScroll={() => (k ? sync(right.current, left.current) : sync(left.current, right.current))} className="h-[70vh] space-y-3 overflow-auto rounded-lg bg-muted/40 p-2">
                    {Array.from({ length: n }, (_, i) => (
                      <div key={i} className={cn('rounded border bg-white', res.changed.includes(i) && 'ring-2 ring-amber-500')}>
                        { }
                        {list[i] ? <img src={list[i]} alt={`${k ? 'New' : 'Original'} page ${i + 1}`} className="w-full" /> : <p className="p-6 text-center text-sm text-muted-foreground">No page {i + 1}</p>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {view === 'overlay' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground"><span className="font-semibold text-red-600">Red</span> = removed / only in the original · <span className="font-semibold text-green-700">Green</span> = added / only in the new version</p>
                { }
                <img src={res.diff[page]} alt={`Differences on page ${page + 1}`} className="mx-auto max-h-[75vh] rounded border" />
              </div>
            )}
            {view === 'text' && (
              <div className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-4 text-sm leading-relaxed">
                {textDiff.length ? textDiff.map((o, i) => <span key={i} className={o.t === 'add' ? 'bg-green-500/25 text-green-900 dark:text-green-200' : o.t === 'del' ? 'bg-red-500/25 text-red-900 line-through dark:text-red-200' : ''}>{o.w}</span>) : <span className="text-muted-foreground">No text on this page.</span>}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
