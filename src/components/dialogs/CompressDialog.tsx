'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SliderField } from '@/components/editor/controls'
import { bytesToBlob, saveBlob } from '@/services/download'
import { compressDocument, PRESETS, type CompressionOutcome, type CompressionSettings } from '@/services/pdf/compression-service'
import { exportPdfBytes } from '@/services/pdf/export-service'
import { replaceDocContent } from '@/services/pdf/document-service'
import { saveSnapshot } from '@/services/storage/projects'
import { runTask } from '@/services/tasks'
import { useActiveDocInfo } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { stripExtension } from '@/utils/file'
import { formatBytes } from '@/utils/format'
import { DialogShell } from './DialogShell'

type Result = CompressionOutcome & { blob: Blob }

export default function CompressDialog() {
  const doc = useActiveDocInfo()!
  const close = useUiStore((s) => s.closeDialog)
  const [s, setS] = useState<CompressionSettings>(PRESETS.medium)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [baseline, setBaseline] = useState<number | null>(null)

  const choose = (p: string) => { setResult(null); setS(p === 'custom' ? { ...s, preset: 'custom' } : PRESETS[p as keyof typeof PRESETS]) }
  const run = async () => {
    setBusy(true)
    setResult(null)
    const out = await runTask('Compressing PDF', async (ctx) => {
      // baseline = the uncompressed edited output so the ratio compares like with like
      const base = baseline ?? (await exportPdfBytes(doc.id, { signal: ctx.signal, onProgress: (f) => ctx.progress(f * 0.2, 'Measuring') })).byteLength
      setBaseline(base)
      const r = await compressDocument(doc.id, s, { signal: ctx.signal, progress: (f, l) => ctx.progress(0.2 + (f ?? 0) * 0.8, l) }, base)
      return { ...r, blob: bytesToBlob(r.bytes) }
    }, { quiet: true })
    setBusy(false)
    if (out) setResult(out)
  }
  const download = async () => { if (result) await saveBlob(result.blob, `${stripExtension(doc.name)}-compressed.pdf`) }
  const replace = async () => {
    if (!result) return
    await runTask('Applying compression', async () => {
      await saveSnapshot(doc.id, 'Before compression')
      await replaceDocContent(doc.id, result.blob, { keepMetadata: !s.removeMetadata })
    })
    close()
  }
  return (
    <DialogShell
      id="compress"
      title="Compress PDF"
      description="Recompresses images, packs objects and removes unused data locally. The result size is measured for real, not estimated."
      size="lg"
      footer={<><Button variant="outline" onClick={close}>Close</Button><Button onClick={() => void run()} disabled={busy} data-testid="compress-run">{busy && <Loader2 className="size-4 animate-spin" />} {result ? 'Recompress' : 'Compress & measure'}</Button></>}
    >
      <RadioGroup value={s.preset} onValueChange={choose} className="grid gap-2 sm:grid-cols-2">
        {([['lossless', 'Lossless', 'Repacks objects, removes unused data. No visible change.'], ['medium', 'Balanced', 'JPEG 75%, images capped ≈150 dpi.'], ['high', 'Smallest', 'JPEG 60%, ≈96 dpi, metadata removed.'], ['custom', 'Custom', 'Set quality and resolution yourself.']] as const).map(([v, t, d]) => (
          <Label key={v} className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value={v} className="mt-0.5" data-testid={`preset-${v}`} />
            <span><span className="block text-sm font-medium">{t}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
          </Label>
        ))}
      </RadioGroup>
      {s.preset === 'custom' && (
        <div className="space-y-3 rounded-md border p-3">
          <SliderField label="JPEG quality" value={Math.round(s.jpegQuality * 100)} min={10} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => setS({ ...s, jpegQuality: v / 100 })} />
          <SliderField label="Downsample images to (dpi)" value={s.maxDpi} min={0} max={300} step={12} format={(v) => (v === 0 ? 'Keep' : `${v} dpi`)} onChange={(v) => setS({ ...s, maxDpi: v })} />
          <Label className="flex items-center gap-2 font-normal"><Checkbox checked={s.recompressFlate} onCheckedChange={(v) => setS({ ...s, recompressFlate: v === true })} /> Also recompress lossless (Flate) images as JPEG</Label>
          <Label className="flex items-center gap-2 font-normal"><Checkbox checked={s.removeMetadata} onCheckedChange={(v) => setS({ ...s, removeMetadata: v === true })} /> Remove metadata</Label>
          <Label className="flex items-center gap-2 font-normal"><Checkbox checked={s.rasterize} onCheckedChange={(v) => setS({ ...s, rasterize: v === true })} /> Rasterise pages (maximum compression – vector graphics and links are lost; text stays searchable)</Label>
        </div>
      )}
      {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Working… progress is shown in the status bar.</p>}
      {result && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-4" data-testid="compress-result">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="text-xs text-muted-foreground">Before</div><div className="text-lg font-semibold">{formatBytes(result.before)}</div></div>
            <div><div className="text-xs text-muted-foreground">After</div><div className="text-lg font-semibold" data-testid="compress-after">{formatBytes(result.after)}</div></div>
            <div><div className="text-xs text-muted-foreground">Saved</div><div className={`text-lg font-semibold ${result.ratio > 0 ? 'text-green-600' : 'text-amber-600'}`} data-testid="compress-ratio">{result.ratio > 0 ? `${Math.round(result.ratio * 100)}%` : 'no gain'}</div></div>
          </div>
          <p className="text-xs text-muted-foreground">{result.imagesRecompressed} of {result.imagesTotal} images recompressed{result.imagesSkipped ? ` (${result.imagesSkipped} kept as-is)` : ''} · {result.objectsRemoved} unused objects removed.</p>
          {result.ratio <= 0 && <p className="text-xs text-amber-600">This file is already well compressed – try “Smallest”, or a custom setting with lower quality.</p>}
          <div className="flex gap-2"><Button size="sm" onClick={() => void download()} data-testid="compress-download">Download compressed PDF</Button><Button size="sm" variant="outline" onClick={() => void replace()}>Replace open document</Button></div>
        </div>
      )}
    </DialogShell>
  )
}
