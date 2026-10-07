'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Download, Eye, FileUp, Loader2, Lock, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { saveBlob } from '@/services/download'
import { formatBytes, isPasswordError, zipFiles } from '@/tools/lib/pdf'

/* ------------------------------------------------------------- layout */

export function Panel({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn('animate-in fade-in-0 slide-in-from-bottom-1 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.08)] duration-300 sm:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 | 4 }) {
  return <div className={cn('grid gap-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3', cols === 4 && 'grid-cols-2 lg:grid-cols-4')}>{children}</div>
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'ok' }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm', tone === 'info' && 'bg-primary/5', tone === 'warn' && 'border-amber-500/40 bg-amber-500/10', tone === 'ok' && 'border-green-600/40 bg-green-600/10')}>
      {tone === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> : <AlertCircle className={cn('mt-0.5 size-4 shrink-0', tone === 'warn' ? 'text-amber-600' : 'text-primary')} aria-hidden />}
      <span>{children}</span>
    </p>
  )
}

/* ------------------------------------------------------------- fields */

const inputCls = 'h-10 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function TextInput({ label, value, onChange, hint, placeholder, type = 'text', disabled, autoComplete }: { label: ReactNode; value: string; onChange: (v: string) => void; hint?: ReactNode; placeholder?: string; type?: string; disabled?: boolean; autoComplete?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} type={type} className={inputCls} value={value} placeholder={placeholder} disabled={disabled} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function NumberInput({ label, value, onChange, min, max, step = 1, hint, suffix }: { label: ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: ReactNode; suffix?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <input id={id} type="number" inputMode="decimal" className={cn(inputCls, suffix && 'pr-12')} value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </Field>
  )
}

export function TextArea({ label, value, onChange, rows = 6, placeholder, hint, mono }: { label: ReactNode; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; hint?: ReactNode; mono?: boolean }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea id={id} rows={rows} className={cn('w-full rounded-lg border bg-background p-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring', mono && 'font-mono')} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function Select<T extends string>({ label, value, onChange, options, hint }: { label: ReactNode; value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]; hint?: ReactNode }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
      </select>
    </Field>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function Segmented<T extends string | number>({ label, value, onChange, options }: { label?: ReactNode; value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[] }) {
  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div role="radiogroup" className="flex flex-wrap gap-1 rounded-lg border bg-muted/50 p-[3px]">
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn('min-h-8 flex-1 rounded-md px-3 py-1 text-sm font-medium transition', value === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>
    </div>
  )
}

export function ColorInput({ label, value, onChange }: { label: ReactNode; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input id={id} type="color" className="h-10 w-14 cursor-pointer rounded-lg border bg-background p-1" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
    </Field>
  )
}

export function Range({ label, value, onChange, min, max, step = 1, format }: { label: ReactNode; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string }) {
  const id = useId()
  return (
    <Field label={<span className="flex justify-between gap-2"><span>{label}</span><span className="font-normal text-muted-foreground">{format ? format(value) : value}</span></span>} htmlFor={id}>
      <input id={id} type="range" className="w-full accent-primary" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  )
}

/* ----------------------------------------------------------- files */

export function FileDrop({ accept, multiple, onFiles, label = 'Choose files', hint, compact, capture }: { accept: string; multiple?: boolean; onFiles: (files: File[]) => void; label?: string; hint?: string; compact?: boolean; capture?: 'environment' | 'user' }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (files.length) onFiles(multiple ? files : files.slice(0, 1))
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        take(e.dataTransfer.files)
      }}
      className={cn('flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-center transition-all duration-200', compact ? 'p-4' : 'min-h-56 p-8 sm:p-12', over ? 'scale-[1.01] border-primary bg-primary/10' : 'border-primary/25 bg-gradient-to-b from-primary/[0.04] to-transparent hover:border-primary/50')}
      data-testid="file-drop"
    >
      {!compact && <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/25"><FileUp className="size-8" aria-hidden /></span>}
      <div>
        <Button type="button" size={compact ? 'sm' : 'lg'} onClick={() => input.current?.click()}>{label}</Button>
        <input ref={input} type="file" className="sr-only" accept={accept} multiple={multiple} capture={capture} onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }} aria-label={label} />
      </div>
      <p className="text-sm text-muted-foreground">{hint ?? (multiple ? 'or drop files here' : 'or drop a file here')} · <Lock className="inline size-3.5" aria-hidden /> stays on your device</p>
    </div>
  )
}

export function FileChip({ file, onRemove, extra }: { file: File; onRemove?: () => void; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background p-3">
      <FileUp className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(file.size)}{extra ? <> · {extra}</> : null}</p>
      </div>
      {onRemove && <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${file.name}`}><X className="size-4" /></Button>}
    </div>
  )
}

/** A re-orderable list of files (merge, alternate, ZIP, Bates). */
export function FileOrderList({ files, onChange, render }: { files: File[]; onChange: (f: File[]) => void; render?: (f: File, i: number) => ReactNode }) {
  const move = (i: number, d: number) => {
    const next = [...files]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    onChange(next)
  }
  const [drag, setDrag] = useState<number | null>(null)
  return (
    <ol className="space-y-2">
      {files.map((f, i) => (
        <li
          key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
          draggable
          onDragStart={() => setDrag(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (drag === null || drag === i) return
            const next = [...files]
            const [x] = next.splice(drag, 1)
            next.splice(i, 0, x)
            onChange(next)
            setDrag(null)
          }}
          className="flex items-center gap-2 rounded-xl border bg-background p-2 pl-3"
        >
          <span className="w-6 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{f.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(f.size)}{render ? <> · {render(f, i)}</> : null}</p>
          </div>
          <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${f.name} up`}><ArrowUp className="size-4" /></Button>
          <Button variant="ghost" size="icon" disabled={i === files.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${f.name} down`}><ArrowDown className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onChange(files.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`}><Trash2 className="size-4" /></Button>
        </li>
      ))}
    </ol>
  )
}

/* ------------------------------------------------------------ tasks */

export interface TaskState { busy: boolean; progress: number; label: string; error: string | null }

/** Runs an async job with progress, error capture and a password retry hook. */
export function useTask() {
  const [s, set] = useState<TaskState>({ busy: false, progress: 0, label: '', error: null })
  const progress = useCallback((f: number, label?: string) => set((p) => ({ ...p, progress: Math.max(0, Math.min(1, f)), label: label ?? p.label })), [])
  const run = useCallback(async <T,>(fn: (progress: (f: number, label?: string) => void) => Promise<T>, label = 'Working…'): Promise<T | undefined> => {
    set({ busy: true, progress: 0, label, error: null })
    try {
      const r = await fn(progress)
      set({ busy: false, progress: 1, label: '', error: null })
      return r
    } catch (e) {
      console.error(e)
      set({ busy: false, progress: 0, label: '', error: (e as Error)?.message || String(e) })
      return undefined
    }
  }, [progress])
  const clearError = useCallback(() => set((p) => ({ ...p, error: null })), [])
  return { ...s, run, clearError, setError: (error: string) => set((p) => ({ ...p, error })) }
}

export function TaskStatus({ task }: { task: TaskState }) {
  if (task.error) return <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {task.error}</div>
  if (!task.busy) return null
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> {task.label || 'Working…'} {task.progress > 0 && <span>{Math.round(task.progress * 100)}%</span>}</div>
      <Progress value={task.progress * 100} />
    </div>
  )
}

export function RunBar({ task, onRun, label, disabled, extra }: { task: TaskState; onRun: () => void; label: string; disabled?: boolean; extra?: ReactNode }) {
  return (
    <div className="space-y-3">
      <TaskStatus task={task} />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onRun} disabled={disabled || task.busy} data-testid="run-tool">
          {task.busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
          {label}
        </Button>
        {extra}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- results */

export interface OutFile { name: string; blob: Blob; note?: string }

export function Results({ files, onReset, zipName = 'ourpdf-files.zip', summary }: { files: OutFile[]; onReset?: () => void; zipName?: string; summary?: ReactNode }) {
  const [zipping, setZipping] = useState(false)
  if (!files.length) return null
  const preview = (f: OutFile) => {
    const url = URL.createObjectURL(f.blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return (
    <Panel title={<span className="flex items-center gap-2"><CheckCircle2 className="size-5 text-green-600" aria-hidden /> {files.length === 1 ? 'Your file is ready' : `${files.length} files are ready`}</span>} actions={onReset && <Button variant="ghost" size="sm" onClick={onReset}><RotateCcw className="mr-1.5 size-4" aria-hidden /> Start over</Button>} className="border-green-600/30" >
      {summary && <div className="mb-4 text-sm">{summary}</div>}
      <ul className="space-y-2" data-testid="results">
        {files.slice(0, 200).map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(f.blob.size)}{f.note ? ` · ${f.note}` : ''}</p>
            </div>
            {/(pdf|image|text\/plain|html)/.test(f.blob.type) && <Button variant="ghost" size="sm" onClick={() => preview(f)}><Eye className="mr-1.5 size-4" aria-hidden /> View</Button>}
            <Button size="sm" onClick={() => void saveBlob(f.blob, f.name)} data-testid="download"><Download className="mr-1.5 size-4" aria-hidden /> Download</Button>
          </li>
        ))}
        {files.length > 200 && <li className="text-sm text-muted-foreground">…and {files.length - 200} more (included in the ZIP).</li>}
      </ul>
      {files.length > 1 && (
        <Button className="mt-4" variant="outline" disabled={zipping} onClick={async () => {
          setZipping(true)
          try {
            await saveBlob(await zipFiles(files.map((f) => ({ name: f.name, data: f.blob }))), zipName)
          } finally {
            setZipping(false)
          }
        }}>{zipping ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Download className="mr-2 size-4" aria-hidden />} Download all as ZIP</Button>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------ PDF input */

export interface PdfInput { file: File; bytes: Uint8Array; pages: number; password?: string }

/**
 * Single-PDF picker that reads the file, counts pages and asks for a password when needed.
 * The returned bytes are decrypted when a password was given, so every tool can work with them directly.
 */
export function usePdfInput() {
  const [input, setInput] = useState<PdfInput | null>(null)
  const [needPassword, setNeedPassword] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const open = useCallback(async (file: File, password?: string) => {
    setLoading(true)
    setError(null)
    try {
      const raw = new Uint8Array(await file.arrayBuffer())
      if (new TextDecoder().decode(raw.subarray(0, 1024)).indexOf('%PDF') < 0) throw new Error(`${file.name} is not a PDF file.`)
      const { PDFDocument } = await import('pdf-lib')
      let doc
      try {
        doc = await PDFDocument.load(raw, { password: password ?? '', updateMetadata: false, throwOnInvalidObject: false })
      } catch (e) {
        if (isPasswordError(e)) {
          setNeedPassword(file)
          if (password) setError('That password is not correct.')
          return
        }
        throw new Error(`Could not read ${file.name}. It may be damaged – try Repair PDF.`)
      }
      let bytes = raw
      if (doc.isEncrypted) bytes = await doc.save({ addDefaultPage: false })
      setNeedPassword(null)
      setInput({ file, bytes, pages: doc.getPageCount(), password })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  return { input, open, reset: () => { setInput(null); setNeedPassword(null); setError(null) }, needPassword, error, loading }
}

export function PdfPicker({ pdf, label = 'Choose PDF', extra }: { pdf: ReturnType<typeof usePdfInput>; label?: string; extra?: ReactNode }) {
  const [pw, setPw] = useState('')
  if (pdf.input) return <FileChip file={pdf.input.file} extra={<>{pdf.input.pages} page{pdf.input.pages === 1 ? '' : 's'}{extra}</>} onRemove={pdf.reset} />
  return (
    <div className="space-y-3">
      {pdf.needPassword ? (
        <form className="space-y-3 rounded-2xl border p-4" onSubmit={(e) => {
          e.preventDefault()
          void pdf.open(pdf.needPassword!, pw)
        }}>
          <p className="flex items-center gap-2 text-sm font-medium"><Lock className="size-4 text-primary" aria-hidden /> {pdf.needPassword.name} is password-protected</p>
          <TextInput label="Password" type="password" value={pw} onChange={setPw} autoComplete="off" />
          <div className="flex gap-2"><Button type="submit">Unlock</Button><Button type="button" variant="ghost" onClick={pdf.reset}>Cancel</Button></div>
        </form>
      ) : (
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => void pdf.open(f[0])} label={pdf.loading ? 'Reading…' : label} />
      )}
      {pdf.error && <Note tone="warn">{pdf.error}</Note>}
    </div>
  )
}

/* ------------------------------------------------- page thumbnails */

/** Small rendered previews of the first pages (lazy), with optional selection. */
export function Thumbs({ bytes, max = 60, selected, onToggle, rotation, overlay }: { bytes: Uint8Array; max?: number; selected?: Set<number>; onToggle?: (i: number) => void; rotation?: (i: number) => number; overlay?: (i: number) => ReactNode }) {
  const [urls, setUrls] = useState<string[]>([])
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    const made: string[] = []
    ;(async () => {
      const { closePdf, openPdfjs, renderPage } = await import('@/tools/lib/pdf')
      const doc = await openPdfjs(bytes)
      if (cancelled) return
      setCount(doc.numPages)
      for (let i = 1; i <= Math.min(max, doc.numPages) && !cancelled; i++) {
        const page = await doc.getPage(i)
        const vp = page.getViewport({ scale: 1 })
        const c = await renderPage(page, 160 / Math.max(vp.width, vp.height))
        const url = await new Promise<string>((r) => c.toBlob((b) => r(b ? URL.createObjectURL(b) : ''), 'image/jpeg', 0.7))
        made.push(url)
        if (!cancelled) setUrls([...made])
        page.cleanup()
      }
      await closePdf(doc)
    })().catch(() => {})
    return () => {
      cancelled = true
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [bytes, max])
  return (
    <div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
        {urls.map((u, i) => {
          const on = selected?.has(i)
          return (
            <li key={i}>
              <button type="button" disabled={!onToggle} onClick={() => onToggle?.(i)} aria-pressed={onToggle ? on : undefined} aria-label={`Page ${i + 1}`} className={cn('group relative flex w-full flex-col items-center gap-1 rounded-xl border bg-muted/40 p-2 transition', onToggle && 'hover:border-primary', on && 'border-primary ring-2 ring-primary/40')}>
                <span className="grid h-28 w-full place-items-center overflow-hidden">
                  { }
                  <img src={u} alt="" className="max-h-28 max-w-full bg-white shadow-sm transition-transform" style={{ transform: `rotate(${rotation?.(i) ?? 0}deg)` }} />
                </span>
                <span className="text-xs text-muted-foreground">{i + 1}</span>
                {overlay?.(i)}
              </button>
            </li>
          )
        })}
      </ul>
      {count > max && <p className="mt-2 text-xs text-muted-foreground">Showing the first {max} of {count} pages.</p>}
    </div>
  )
}

export const pdfOut = (bytes: Uint8Array, name: string, note?: string): OutFile => ({ name, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), note })
