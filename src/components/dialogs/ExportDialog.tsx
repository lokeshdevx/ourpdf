'use client'

import { Braces, FileDown, FileImage, FileText, FileType, Files, FolderArchive, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runCommand } from '@/features/commands'
import { downloadPages, selectedPageIndices } from '@/services/actions'
import { useUiStore } from '@/stores/ui-store'
import { usePdfStore } from '@/stores/pdf-store'
import { DialogShell } from './DialogShell'

export default function ExportDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const docId = usePdfStore((s) => s.activeId)!
  const sel = selectedPageIndices(docId)
  const items: [React.ComponentType<{ className?: string }>, string, string, () => void, boolean?][] = [
    [FileDown, 'Download PDF', 'Saves the whole document with all edits.', () => void runCommand('file.save')],
    [Files, `Download selected pages${sel.length ? ` (${sel.length})` : ''}`, 'Saves only the pages selected in the thumbnails.', () => void downloadPages(docId, sel), sel.length === 0],
    [FileImage, 'Export images', 'PNG or JPG per page.', () => void runCommand('convert.toPng')],
    [FileText, 'Export text', 'Plain text from the text layer / OCR.', () => void runCommand('convert.toText')],
    [FileType, 'Export HTML', 'Reflowable HTML.', () => void runCommand('convert.toHtml')],
    [Braces, 'Export annotations', 'Instant-JSON style .json', () => void runCommand('convert.exportAnnotations')],
    [Table2, 'Export form data', 'JSON or CSV of field values.', () => void runCommand('form.data')],
    [FolderArchive, 'Export project', 'Editable project file (.ourpdf) with all sources.', () => void runCommand('file.exportProject')],
  ]
  return (
    <DialogShell id="export" title="Export" footer={<Button variant="outline" onClick={close}>Close</Button>} size="lg">
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(([Icon, title, desc, run, disabled]) => (
          <Button key={title} variant="outline" disabled={disabled} className="h-auto justify-start gap-3 whitespace-normal py-3 text-left" onClick={() => { close(); setTimeout(run, 50) }}>
            <Icon className="size-5 shrink-0" />
            <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs font-normal text-muted-foreground">{desc}</span></span>
          </Button>
        ))}
      </div>
    </DialogShell>
  )
}
