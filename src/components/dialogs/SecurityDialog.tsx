'use client'

import { useState } from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { bytesToBlob, saveBlob } from '@/services/download'
import { exportPdfBytes } from '@/services/pdf/export-service'
import { runTask } from '@/services/tasks'
import { useActiveDocInfo } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { stripExtension, withExtension } from '@/utils/file'
import { DialogShell, Field } from './DialogShell'

export default function SecurityDialog() {
  const doc = useActiveDocInfo()!
  const close = useUiStore((s) => s.closeDialog)
  const [user, setUser] = useState('')
  const [owner, setOwner] = useState('')
  const [perm, setPerm] = useState({ allowPrint: true, allowCopy: true, allowModify: true, allowAnnotate: true })
  const restricted = !Object.values(perm).every(Boolean)
  const needsOwner = restricted && !owner
  const encrypt = () => {
    close()
    void runTask('Encrypting PDF', async (ctx) => {
      const bytes = await exportPdfBytes(doc.id, { signal: ctx.signal, onProgress: ctx.progress, security: { userPassword: user, ownerPassword: owner, ...perm } })
      await saveBlob(bytesToBlob(bytes), `${stripExtension(doc.name)}-protected.pdf`)
    }, { successMessage: 'Encrypted copy downloaded' })
  }
  const unprotect = () => {
    close()
    void runTask('Removing password', async (ctx) => {
      const bytes = await exportPdfBytes(doc.id, { signal: ctx.signal, onProgress: ctx.progress, security: null })
      await saveBlob(bytesToBlob(bytes), withExtension(`${stripExtension(doc.name)}-unlocked`, 'pdf'))
    }, { successMessage: 'Unprotected copy downloaded' })
  }
  return (
    <DialogShell
      id="security"
      title="Password protection & permissions"
      description="Encrypts a downloaded copy with AES-256 in your browser. Your open document is not changed."
      size="lg"
      footer={<><Button variant="outline" onClick={close}>Cancel</Button>{doc.encrypted && <Button variant="secondary" onClick={unprotect} data-testid="sec-unprotect">Download without password</Button>}<Button onClick={encrypt} disabled={!user && !restricted} data-testid="sec-encrypt"><ShieldCheck className="size-4" /> Encrypt &amp; download</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Password to open (user)" hint="Leave empty to allow opening without a password." htmlFor="sec-user"><Input id="sec-user" type="password" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="new-password" data-testid="sec-user" /></Field>
        <Field label="Permissions password (owner)" hint={needsOwner ? 'A random owner password is generated if you leave this empty.' : 'Needed to change permissions later.'} htmlFor="sec-owner"><Input id="sec-owner" type="password" value={owner} onChange={(e) => setOwner(e.target.value)} autoComplete="new-password" /></Field>
      </div>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Allowed actions</legend>
        {([['allowPrint', 'Printing'], ['allowCopy', 'Copying text & images'], ['allowModify', 'Editing & assembling pages'], ['allowAnnotate', 'Annotating & filling forms']] as const).map(([k, label]) => (
          <Label key={k} className="flex items-center gap-2 font-normal"><Checkbox checked={perm[k]} onCheckedChange={(v) => setPerm({ ...perm, [k]: v === true })} /> {label}</Label>
        ))}
      </fieldset>
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>What this does and does not protect</AlertTitle>
        <AlertDescription className="space-y-1 text-xs">
          <p>The open-password uses real AES-256 encryption. Anyone without it cannot read the file.</p>
          <p>Permission flags (no printing / copying / editing) are only <em>requests</em> that compliant viewers honour – tools that ignore them can still read the content. Don’t rely on them for confidentiality.</p>
          <p>Passwords are never stored or sent anywhere. If you lose the password the file cannot be recovered.</p>
          {doc.encrypted && <p>This document was opened with a password. “Download without password” saves a decrypted copy.</p>}
        </AlertDescription>
      </Alert>
    </DialogShell>
  )
}
