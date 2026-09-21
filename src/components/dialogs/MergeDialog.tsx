'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, FilePlus2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { detectFile } from '@/utils/file'
import { formatBytes } from '@/utils/format'
import { pickFiles } from '@/services/import'
import { mergeFilesIntoDoc, mergeOpenDocs } from '@/services/pdf/merge-service'
import { runTask } from '@/services/tasks'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { toast } from 'sonner'
import { DialogShell } from './DialogShell'

interface Item {
  key: string
  name: string
  size: number
  file?: File
  docId?: string
}

export default function MergeDialog() {
  const docs = usePdfStore((s) => s.docs)
  const [items, setItems] = useState<Item[]>([])
  const close = useUiStore((s) => s.closeDialog)
  const openDocs = docs.filter((d) => !items.some((i) => i.docId === d.id))

  const addFiles = async () => {
    const files = await pickFiles({ accept: '.pdf,application/pdf', multiple: true })
    const ok: Item[] = []
    for (const f of files) {
      if ((await detectFile(f)) !== 'pdf') toast.error(`${f.name} is not a PDF`)
      else ok.push({ key: `${f.name}-${f.size}-${Math.random()}`, name: f.name, size: f.size, file: f })
    }
    setItems((l) => [...l, ...ok])
  }
  const move = (i: number, d: number) => setItems((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n })

  const run = async () => {
    close()
    const allDocs = items.every((i) => i.docId)
    await runTask('Merging PDFs', async (ctx) => {
      if (allDocs) await mergeOpenDocs(items.map((i) => i.docId!), ctx)
      else {
        // mixed: export open docs to files first
        const files: File[] = []
        for (const it of items) {
          if (it.file) files.push(it.file)
          else {
            const { exportPdfBytes } = await import('@/services/pdf/export-service')
            const bytes = await exportPdfBytes(it.docId!, { signal: ctx.signal })
            files.push(new File([bytes as BlobPart], it.name, { type: 'application/pdf' }))
          }
        }
        await mergeFilesIntoDoc(files, ctx)
      }
    }, { successMessage: 'Merged into a new document' })
  }

  return (
    <DialogShell
      id="merge"
      title="Merge PDFs"
      description="Combine several PDFs (files or open documents) into one new document. Order matters – use the arrows."
      footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={items.length < 2} onClick={() => void run()} data-testid="merge-run">Merge {items.length || ''} documents</Button></>}
    >
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void addFiles()} data-testid="merge-add"><FilePlus2 className="size-4" /> Add files…</Button>
      </div>
      {openDocs.length > 0 && (
        <div className="space-y-1.5 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground">Open documents (includes your unsaved edits)</p>
          {openDocs.map((d) => (
            <Label key={d.id} className="flex items-center gap-2 text-sm font-normal">
              <Checkbox onCheckedChange={(v) => v === true && setItems((l) => [...l, { key: d.id, name: d.name, size: d.size, docId: d.id }])} /> {d.name}
            </Label>
          ))}
        </div>
      )}
      <ol className="divide-y rounded-md border" aria-label="Documents to merge" data-testid="merge-list">
        {!items.length && <li className="p-4 text-center text-sm text-muted-foreground">No documents yet. Add at least two.</li>}
        {items.map((it, i) => (
          <li key={it.key} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="w-5 text-muted-foreground">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate">{it.name}</span>
            <span className="text-xs text-muted-foreground">{formatBytes(it.size)}</span>
            <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${it.name}`} onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Note: form fields from merged files are flattened into page content so they cannot clash; bookmarks of merged files are not carried over.</p>
    </DialogShell>
  )
}
