'use client'

import { Download, Paperclip, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pickFiles } from '@/services/import'
import { addAttachment, downloadAttachment, removeAttachment } from '@/services/pdf/attachment-service'
import { useActiveDocInfo } from '@/stores/pdf-store'
import { formatBytes } from '@/utils/format'

export function AttachmentsPanel() {
  const doc = useActiveDocInfo()
  if (!doc) return null
  return (
    <div className="flex h-full flex-col" data-testid="attachments-panel">
      <div className="border-b p-2">
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={async () => { const f = (await pickFiles({ accept: '*/*', multiple: false }))[0]; if (f) void addAttachment(doc.id, f) }}>
          <Plus className="size-3.5" /> Attach file
        </Button>
      </div>
      <ul className="scroll-thin min-h-0 flex-1 overflow-auto p-1">
        {!doc.attachments.length && <li className="p-3 text-xs text-muted-foreground">This PDF has no attachments. Attached files are embedded in the exported PDF.</li>}
        {doc.attachments.map((a) => (
          <li key={a.id} className="group flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent">
            <Paperclip className="size-3.5 shrink-0" />
            <span className="flex-1 truncate" title={a.name}>{a.name}</span>
            <span className="text-muted-foreground">{formatBytes(a.size)}</span>
            {a.staged && <span className="rounded bg-amber-500/20 px-1 text-[10px]">new</span>}
            <Button size="icon-sm" variant="ghost" className="size-6" aria-label={`Download ${a.name}`} onClick={() => void downloadAttachment(a.name, a.blobKey)}><Download className="size-3.5" /></Button>
            {a.staged && <Button size="icon-sm" variant="ghost" className="size-6" aria-label={`Remove ${a.name}`} onClick={() => removeAttachment(doc.id, a.id)}><Trash2 className="size-3.5" /></Button>}
          </li>
        ))}
      </ul>
    </div>
  )
}
