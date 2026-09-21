'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { safeUri } from '@/engine/assemble'
import { updateObjects } from '@/services/pdf/annotation-service'
import { useActiveObjects } from '@/stores/annotation-store'
import { useActivePages } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import type { LinkObj, LinkTarget } from '@/types'
import { toast } from 'sonner'
import { DialogShell, Field, useDialogData } from './DialogShell'

export default function LinkDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const data = useDialogData<{ objectId: string }>()
  const objects = useActiveObjects()
  const pages = useActivePages()
  const close = useUiStore((s) => s.closeDialog)
  const link = objects.find((o) => o.id === data?.objectId && o.type === 'link') as LinkObj | undefined
  const [t, setT] = useState<LinkTarget>(link?.target ?? { kind: 'url', url: 'https://' })
  if (!link) return null
  const save = () => {
    let target = t
    if (t.kind === 'url') { const u = safeUri(t.url ?? ''); if (!u) return void toast.error('Enter a valid http(s), mailto or tel address. Other schemes are blocked for safety.'); target = { ...t, url: u } }
    if (t.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.address ?? '')) return void toast.error('Enter a valid email address')
    if (t.kind === 'page' && !t.pageId) return void toast.error('Choose a page')
    updateObjects(docId, { [link.id]: { target } }, 'Edit link')
    close()
  }
  return (
    <DialogShell id="link" title="Link target" description="Where should this rectangle link to?" footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save} data-testid="link-save">Save link</Button></>}>
      <Field label="Type">
        <Select value={t.kind} onValueChange={(v) => setT(v === 'url' ? { kind: 'url', url: 'https://' } : v === 'email' ? { kind: 'email', address: '', subject: '' } : { kind: 'page', pageId: pages[0]?.id })}>
          <SelectTrigger aria-label="Link type" data-testid="link-type"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="url">Web address (URL)</SelectItem><SelectItem value="email">Email address</SelectItem><SelectItem value="page">Page in this document</SelectItem></SelectContent>
        </Select>
      </Field>
      {t.kind === 'url' && <Field label="URL" htmlFor="lk-url"><Input id="lk-url" value={t.url ?? ''} onChange={(e) => setT({ ...t, url: e.target.value })} data-testid="link-url" autoFocus /></Field>}
      {t.kind === 'email' && (<><Field label="Email address" htmlFor="lk-mail"><Input id="lk-mail" type="email" value={t.address ?? ''} onChange={(e) => setT({ ...t, address: e.target.value })} data-testid="link-email" /></Field><Field label="Subject (optional)"><Input value={t.subject ?? ''} onChange={(e) => setT({ ...t, subject: e.target.value })} /></Field></>)}
      {t.kind === 'page' && (
        <Field label="Go to page">
          <Select value={t.pageId} onValueChange={(v) => setT({ kind: 'page', pageId: v })}><SelectTrigger aria-label="Target page" data-testid="link-page"><SelectValue placeholder="Choose page" /></SelectTrigger><SelectContent className="max-h-64">{pages.map((p, i) => <SelectItem key={p.id} value={p.id}>Page {i + 1}</SelectItem>)}</SelectContent></Select>
        </Field>
      )}
    </DialogShell>
  )
}
