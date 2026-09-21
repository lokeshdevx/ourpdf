'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { resolvePassword } from '@/services/import'
import { useUiStore } from '@/stores/ui-store'

export function PasswordDialog() {
  const open = useUiStore((s) => s.dialog === 'password')
  const data = useUiStore((s) => s.dialogData) as { name: string; incorrect: boolean } | null
  const [pw, setPw] = useState('')
  const close = (v: string | null) => {
    setPw('')
    resolvePassword(v)
    useUiStore.getState().closeDialog()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close(null)}>
      <DialogContent className="sm:max-w-sm" data-testid="password-dialog">
        <form onSubmit={(e) => { e.preventDefault(); close(pw) }} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Password required</DialogTitle>
            <DialogDescription>“{data?.name}” is encrypted. The password is used only in this browser to decrypt the file locally.</DialogDescription>
          </DialogHeader>
          <Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" aria-label="PDF password" aria-invalid={data?.incorrect} autoComplete="off" data-testid="password-input" />
          {data?.incorrect && <p className="text-sm text-destructive" role="alert">Incorrect password. Try again.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(null)}>Cancel</Button>
            <Button type="submit" data-testid="password-submit">Open</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
