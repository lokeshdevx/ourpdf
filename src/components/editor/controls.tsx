'use client'

import { useId } from 'react'
import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

const SWATCHES = ['#000000', '#374151', '#9ca3af', '#ffffff', '#dc2626', '#ea580c', '#f59e0b', '#ffe14d', '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777', '#92400e']

export function ColorField({ value, onChange, label, allowNone, className, compact }: { value: string | null; onChange: (v: string | null) => void; label: string; allowNone?: boolean; className?: string; compact?: boolean }) {
  const id = useId()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size={compact ? 'icon-sm' : 'sm'} aria-label={label} title={label} className={cn(compact ? 'size-7 p-0' : 'h-8 gap-2 px-2', className)}>
          <span className="relative block size-4 rounded-sm border" style={{ background: value ?? 'transparent' }}>
            {!value && <Ban className="absolute inset-0 size-4 text-muted-foreground" aria-hidden />}
          </span>
          {!compact && <span className="text-xs font-normal">{value ?? 'None'}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2 p-3" align="start">
        <div className="grid grid-cols-7 gap-1.5" role="listbox" aria-label={`${label} presets`}>
          {SWATCHES.map((c) => (
            <button key={c} type="button" role="option" aria-selected={value === c} aria-label={c} onClick={() => onChange(c)} className={cn('size-6 rounded border', value === c && 'ring-2 ring-primary ring-offset-1')} style={{ background: c }} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="text-xs">Custom</Label>
          <input id={id} type="color" value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-7 w-full cursor-pointer rounded border bg-transparent" />
        </div>
        {allowNone && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(null)}>
            <Ban className="size-3.5" /> No colour
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function NumberField({ value, onChange, label, min, max, step = 1, className, suffix, disabled }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number; className?: string; suffix?: string; disabled?: boolean }) {
  const id = useId()
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Label htmlFor={id} className="sr-only">{label}</Label>
      <Input
        id={id}
        type="number"
        title={label}
        aria-label={label}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ''}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)))
        }}
        className="h-8 w-full min-w-0 px-2 text-xs"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  )
}

export function SliderField({ value, onChange, label, min, max, step, format }: { value: number; onChange: (v: number) => void; label: string; min: number; max: number; step: number; format?: (v: number) => string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{format ? format(value) : value}</span>
      </div>
      <Slider aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  )
}

export function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2 border-b px-3 py-3', className)} aria-label={title}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
