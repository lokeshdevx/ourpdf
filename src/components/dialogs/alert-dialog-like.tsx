'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ConfirmRequest } from '@/stores/confirm-store'

export function AlertDialogLike({ request, onClose }: { request: (ConfirmRequest & { resolve: unknown }) | null; onClose: (r: 'confirm' | 'cancel' | 'alt') => void }) {
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose('cancel')}>
      <DialogContent role="alertdialog" data-testid="confirm-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {request?.destructive && <AlertTriangle className="size-5 text-destructive" aria-hidden />}
            {request?.title}
          </DialogTitle>
          {request?.description && <DialogDescription>{request.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onClose('cancel')} data-testid="confirm-cancel">{request?.cancelLabel ?? 'Cancel'}</Button>
          {request?.altLabel && <Button variant="secondary" onClick={() => onClose('alt')}>{request.altLabel}</Button>}
          <Button variant={request?.destructive ? 'destructive' : 'default'} onClick={() => onClose('confirm')} autoFocus data-testid="confirm-ok">{request?.confirmLabel ?? 'Confirm'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
