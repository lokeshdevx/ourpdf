'use client'

import { AlertDialogLike } from './alert-dialog-like'
import { useConfirmStore } from '@/stores/confirm-store'

export function ConfirmDialog() {
  const req = useConfirmStore((s) => s.request)
  const close = useConfirmStore((s) => s.close)
  return <AlertDialogLike request={req} onClose={close} />
}
