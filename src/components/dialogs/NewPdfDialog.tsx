'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MM, PAGE_SIZES } from '@/lib/geometry'
import { createBlankDocument } from '@/services/import'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell, Field } from './DialogShell'

export default function NewPdfDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const [name, setName] = useState('Untitled')
  const [pages, setPages] = useState(1)
  const [size, setSize] = useState<keyof typeof PAGE_SIZES | 'custom'>('A4')
  const [landscape, setLandscape] = useState(false)
  const [w, setW] = useState(210)
  const [h, setH] = useState(297)
  const run = () => {
    createBlankDocument({ pages, size, width: w * MM, height: h * MM, landscape, name })
    close()
    useUiStore.getState().set({ fit: 'page' })
  }
  return (
    <DialogShell id="newPdf" title="Create a new PDF" description="Start from blank pages, then add text, shapes, images, form fields and more." footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={run} data-testid="newpdf-create">Create</Button></>}>
      <Field label="Name" htmlFor="np-name"><Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pages" htmlFor="np-pages"><Input id="np-pages" type="number" min={1} max={500} value={pages} onChange={(e) => setPages(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))} /></Field>
        <Field label="Page size">
          <Select value={size} onValueChange={(v) => setSize(v as typeof size)}>
            <SelectTrigger aria-label="Page size"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.keys(PAGE_SIZES).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}<SelectItem value="custom">Custom…</SelectItem></SelectContent>
          </Select>
        </Field>
      </div>
      {size === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width (mm)"><Input type="number" min={20} max={2000} value={w} onChange={(e) => setW(parseFloat(e.target.value) || 210)} /></Field>
          <Field label="Height (mm)"><Input type="number" min={20} max={2000} value={h} onChange={(e) => setH(parseFloat(e.target.value) || 297)} /></Field>
        </div>
      )}
      <Label className="flex items-center gap-2 font-normal"><Checkbox checked={landscape} onCheckedChange={(v) => setLandscape(v === true)} /> Landscape</Label>
    </DialogShell>
  )
}
