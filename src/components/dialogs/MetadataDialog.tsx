'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { execute } from '@/services/history'
import { useActiveDocInfo, usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import type { DocMetadata } from '@/types'
import { formatBytes } from '@/utils/format'
import { DialogShell, Field } from './DialogShell'

const toLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : '')
const fromLocal = (s: string) => (s ? new Date(s).toISOString() : null)

export default function MetadataDialog() {
  const doc = useActiveDocInfo()!
  const close = useUiStore((s) => s.closeDialog)
  const [m, setM] = useState<DocMetadata>(doc.metadata)
  const set = (p: Partial<DocMetadata>) => setM((x) => ({ ...x, ...p }))
  const save = () => {
    const before = doc.metadata
    execute(doc.id, 'Edit metadata', () => usePdfStore.getState().updateDoc(doc.id, { metadata: m }), () => usePdfStore.getState().updateDoc(doc.id, { metadata: before }), { scope: 'document' })
    close()
  }
  return (
    <DialogShell
      id="metadata"
      title="Document properties & metadata"
      description="Edit the information stored inside the PDF. “Remove all metadata” strips title, author, dates, producer and XMP on save."
      size="lg"
      footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button variant="outline" onClick={() => setM({ ...m, title: '', author: '', subject: '', keywords: '', creator: '', producer: '', creationDate: null, modificationDate: null, strip: true })}>Clear everything</Button><Button onClick={save} data-testid="meta-save">Save</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="m-title"><Input id="m-title" value={m.title} onChange={(e) => set({ title: e.target.value })} data-testid="meta-title" /></Field>
        <Field label="Author" htmlFor="m-author"><Input id="m-author" value={m.author} onChange={(e) => set({ author: e.target.value })} data-testid="meta-author" /></Field>
        <Field label="Subject" htmlFor="m-subject"><Input id="m-subject" value={m.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
        <Field label="Creator (application)" htmlFor="m-creator"><Input id="m-creator" value={m.creator} onChange={(e) => set({ creator: e.target.value })} /></Field>
        <Field label="Producer" htmlFor="m-producer" hint="Defaults to “OurPDF”."><Input id="m-producer" value={m.producer} onChange={(e) => set({ producer: e.target.value })} /></Field>
        <Field label="Keywords" htmlFor="m-keywords" hint="Comma separated."><Textarea id="m-keywords" value={m.keywords} onChange={(e) => set({ keywords: e.target.value })} className="min-h-9" /></Field>
        <Field label="Creation date" htmlFor="m-cd"><Input id="m-cd" type="datetime-local" value={toLocal(m.creationDate)} onChange={(e) => set({ creationDate: fromLocal(e.target.value) })} /></Field>
        <Field label="Modification date" htmlFor="m-md" hint="Set to the save time automatically."><Input id="m-md" type="datetime-local" value={toLocal(m.modificationDate)} disabled /></Field>
      </div>
      <Label className="flex items-center gap-2 rounded-md border p-3 font-normal"><Checkbox checked={m.strip} onCheckedChange={(v) => set({ strip: v === true })} data-testid="meta-strip" /> Remove all metadata when saving / exporting</Label>
      <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        <div>File: {doc.name} · {formatBytes(doc.size)} · {doc.encrypted ? 'was encrypted' : 'not encrypted'}</div>
        <div>Original title: {doc.originalMetadata.title || '—'} · Original author: {doc.originalMetadata.author || '—'}</div>
      </div>
    </DialogShell>
  )
}
