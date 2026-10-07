'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useUiStore, type DialogId } from '@/stores/ui-store'

interface Props {
  id: DialogId
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }

/** Consistent accessible dialog frame (focus trap, Escape, labelled title) driven by the UI store. */
export function DialogShell({ id, title, description, children, footer, size = 'md', className }: Props) {
  const open = useUiStore((s) => s.dialog === id)
  const close = useUiStore((s) => s.closeDialog)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className={cn('flex max-h-[90dvh] flex-col gap-4', SIZES[size], className)} data-testid={`dialog-${id}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <div className="scroll-thin -mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

export function useDialogData<T>(): T | null {
  return useUiStore((s) => s.dialogData) as T | null
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
