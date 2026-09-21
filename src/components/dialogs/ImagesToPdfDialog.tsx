'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, FilePlus2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DEFAULT_IMAGES_OPTIONS, imagesToPdfBlob, type ImagesOptions } from '@/services/convert/to-pdf'
import { openPdfWithPassword, pickFiles } from '@/services/import'
import { runTask } from '@/services/tasks'
import { detectFile } from '@/utils/file'
import { formatBytes } from '@/utils/format'
import { useUiStore } from '@/stores/ui-store'
import { toast } from 'sonner'
import { DialogShell, Field } from './DialogShell'

export default function ImagesToPdfDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const [files, setFiles] = useState<File[]>([])
  const [opts, setOpts] = useState<ImagesOptions>(DEFAULT_IMAGES_OPTIONS)
  const add = async () => {
    const picked = await pickFiles({ accept: 'image/png,image/jpeg,image/webp,image/tiff,.png,.jpg,.jpeg,.webp,.tif,.tiff', multiple: true })
    const ok: File[] = []
    for (const f of picked) {
      const k = await detectFile(f)
      if (['png', 'jpeg', 'webp', 'tiff'].includes(k)) ok.push(f)
      else toast.error(`${f.name} is not a supported image`)
    }
    setFiles((l) => [...l, ...ok])
  }
  const move = (i: number, d: number) => setFiles((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n })
  const run = () => {
    close()
    void runTask('Creating PDF from images', async (ctx) => {
      const blob = await imagesToPdfBlob(files, opts, (f) => ctx.progress(f))
      await openPdfWithPassword(blob, files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '.pdf') : 'Images.pdf')
    })
  }
  return (
    <DialogShell id="imagesToPdf" title="Images → PDF" description="Each image becomes a page. PNG, JPG, WEBP (and TIFF where your browser supports it)." footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={!files.length} onClick={run} data-testid="images-run">Create PDF ({files.length})</Button></>}>
      <Button variant="outline" size="sm" onClick={() => void add()} data-testid="images-add"><FilePlus2 className="size-4" /> Add images…</Button>
      <ol className="divide-y rounded-md border" aria-label="Images">
        {!files.length && <li className="p-4 text-center text-sm text-muted-foreground">No images yet.</li>}
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="w-5 text-muted-foreground">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
            <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === files.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${f.name}`} onClick={() => setFiles((l) => l.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Page size">
          <Select value={opts.pageSize} onValueChange={(v) => setOpts({ ...opts, pageSize: v as ImagesOptions['pageSize'] })}>
            <SelectTrigger aria-label="Page size"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="fit">Fit to image</SelectItem><SelectItem value="A4">A4</SelectItem><SelectItem value="Letter">Letter</SelectItem><SelectItem value="A3">A3</SelectItem><SelectItem value="Legal">Legal</SelectItem></SelectContent>
          </Select>
        </Field>
        {opts.pageSize !== 'fit' ? (
          <Field label="Orientation">
            <Select value={opts.orientation} onValueChange={(v) => setOpts({ ...opts, orientation: v as ImagesOptions['orientation'] })}>
              <SelectTrigger aria-label="Orientation"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="auto">Automatic</SelectItem><SelectItem value="portrait">Portrait</SelectItem><SelectItem value="landscape">Landscape</SelectItem></SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Image resolution (DPI)"><Input type="number" min={36} max={600} value={opts.dpi} onChange={(e) => setOpts({ ...opts, dpi: parseInt(e.target.value) || 96 })} /></Field>
        )}
        {opts.pageSize !== 'fit' && <Field label="Margin (pt)"><Input type="number" min={0} max={200} value={opts.margin} onChange={(e) => setOpts({ ...opts, margin: parseInt(e.target.value) || 0 })} /></Field>}
      </div>
    </DialogShell>
  )
}
