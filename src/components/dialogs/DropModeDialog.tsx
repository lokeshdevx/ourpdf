'use client'

import { Combine, Files } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { importFiles } from '@/services/import'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell, useDialogData } from './DialogShell'

export default function DropModeDialog() {
  const data = useDialogData<{ files: File[] }>()
  const close = useUiStore((s) => s.closeDialog)
  const n = data?.files.length ?? 0
  return (
    <DialogShell id="dropMode" title={`${n} files dropped`} description="Open them as separate tabs, or merge the PDFs into one document (merge mode)?">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" className="h-auto flex-col gap-1 py-4" onClick={() => { close(); void importFiles(data!.files, { merge: false }) }} data-testid="drop-separate"><Files className="size-6" /> Open separately</Button>
        <Button className="h-auto flex-col gap-1 py-4" onClick={() => { close(); void importFiles(data!.files, { merge: true }) }} data-testid="drop-merge"><Combine className="size-6" /> Merge into one PDF</Button>
      </div>
    </DialogShell>
  )
}
