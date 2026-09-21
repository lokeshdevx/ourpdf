'use client'

import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { saveBlob } from '@/services/download'
import { pickFiles } from '@/services/import'
import { exportFormData, fieldsOf, formDataToCsv, importFormData } from '@/services/pdf/form-service'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { stripExtension } from '@/utils/file'
import { DialogShell } from './DialogShell'

export default function FormDataDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const name = usePdfStore((s) => s.docs.find((d) => d.id === s.activeId)?.name ?? 'form')
  const close = useUiStore((s) => s.closeDialog)
  const count = fieldsOf(docId).length
  return (
    <DialogShell id="formData" title="Form data" description={`${count} field${count === 1 ? '' : 's'} in this document.`} footer={<Button onClick={close}>Done</Button>}>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!count} data-testid="form-export-json" onClick={() => void saveBlob(new Blob([JSON.stringify(exportFormData(docId), null, 2)], { type: 'application/json' }), `${stripExtension(name)}-data.json`)}>Export JSON</Button>
        <Button variant="outline" disabled={!count} onClick={() => void saveBlob(new Blob([formDataToCsv(exportFormData(docId))], { type: 'text/csv' }), `${stripExtension(name)}-data.csv`)}>Export CSV</Button>
        <Button variant="outline" disabled={!count} data-testid="form-import" onClick={async () => {
          const f = (await pickFiles({ accept: '.json,application/json', multiple: false }))[0]
          if (!f) return
          try {
            const n = importFormData(docId, JSON.parse(await f.text()))
            toast[n ? 'success' : 'info'](n ? `Imported values into ${n} field(s)` : 'No field names matched')
            if (n) close()
          } catch (e) { toast.error('Could not import form data', { description: (e as Error).message }) }
        }}>Import JSON…</Button>
      </div>
      <p className="text-xs text-muted-foreground">Values are matched by field name. Radio groups use the choice value. Data never leaves your device.</p>
    </DialogShell>
  )
}
