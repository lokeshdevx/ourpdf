'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** Tooltip with a bold title, an optional shortcut and a short explanation of what the control does. */
export function Tip({ title, help, shortcut, children, side, className }: { title?: string; help?: string; shortcut?: string; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left'; className?: string }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(hide.current) }, [])
  if (!title && !help) return <>{children}</>
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        asChild
        // touch screens have no hover: press and hold for the explanation (the tap that follows is swallowed)
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return
          held.current = false
          timer.current = setTimeout(() => {
            held.current = true
            setOpen(true)
            hide.current = setTimeout(() => setOpen(false), 3500)
          }, 450)
        }}
        onPointerUp={() => clearTimeout(timer.current)}
        onPointerCancel={() => clearTimeout(timer.current)}
        onPointerMove={(e) => { if (e.pointerType === 'touch' && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearTimeout(timer.current) }}
        onClickCapture={(e) => {
          if (held.current) {
            held.current = false
            e.stopPropagation()
            e.preventDefault()
          }
        }}
        onContextMenu={(e) => { if (held.current) e.preventDefault() }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} collisionPadding={8} className={cn('block max-w-72 whitespace-normal text-left', className)}>
        {title && (
          <div className="flex items-baseline gap-2 font-medium">
            <span>{title}</span>
            {shortcut && <span className="rounded bg-background/20 px-1 font-mono text-[10px] font-normal">{shortcut}</span>}
          </div>
        )}
        {help && <div className={cn('text-[11px] leading-snug opacity-85', title && 'mt-1')}>{help}</div>}
      </TooltipContent>
    </Tooltip>
  )
}
