'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { addMargins, alignFrame, resizeFrame, type Align } from '@/lib/frame'
import { MM, PAGE_SIZES, displaySize } from '@/lib/geometry'
import { pagesForScope, type CropScope } from '@/services/pdf/crop-actions'
import { setPageGeometry } from '@/services/pdf/page-service'
import { getPages } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import type { PageModel } from '@/types'
import { toast } from 'sonner'
import { DialogShell, Field } from './DialogShell'
import { cn } from '@/lib/utils'

const ALIGNS: Align[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']

function ScopeSelect({ value, onChange }: { value: CropScope; onChange: (v: CropScope) => void }) {
  return (
    <Field label="Apply to">
      <Select value={value} onValueChange={(v) => onChange(v as CropScope)}>
        <SelectTrigger aria-label="Apply to"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="current">Current page</SelectItem><SelectItem value="selected">Selected pages</SelectItem><SelectItem value="all">All pages</SelectItem></SelectContent>
      </Select>
    </Field>
  )
}

function AlignPicker({ value, onChange }: { value: Align; onChange: (a: Align) => void }) {
  return (
    <div className="grid w-28 grid-cols-3 gap-1" role="radiogroup" aria-label="Alignment">
      {ALIGNS.map((a) => (
        <button key={a} type="button" role="radio" aria-checked={value === a} aria-label={a} onClick={() => onChange(a)} className={cn('aspect-square rounded border', value === a ? 'border-primary bg-primary' : 'bg-muted hover:bg-accent')} />
      ))}
    </div>
  )
}

export default function PageSetupDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const close = useUiStore((s) => s.closeDialog)
  const [scope, setScope] = useState<CropScope>('all')
  const [size, setSize] = useState<string>('A4')
  const [cw, setCw] = useState(210)
  const [ch, setCh] = useState(297)
  const [orient, setOrient] = useState<'keep' | 'portrait' | 'landscape'>('keep')
  const [fit, setFit] = useState(true)
  const [align, setAlign] = useState<Align>('center')
  const [margin, setMargin] = useState(0)
  const [m, setM] = useState({ top: 18, right: 18, bottom: 18, left: 18 })
  const [normalizeTo, setNormalizeTo] = useState<'first' | 'A4' | 'Letter'>('first')

  const apply = (fn: (p: PageModel) => Partial<PageModel>, label: string) => {
    const targets = pagesForScope(docId, scope)
    const patches: Record<string, Partial<PageModel>> = {}
    for (const p of targets) patches[p.id] = fn(p)
    setPageGeometry(docId, patches, label)
    toast.success(`${label}: ${targets.length} page${targets.length > 1 ? 's' : ''}`)
    close()
  }

  const targetSize = (p: PageModel): [number, number] => {
    let [w, h] = size === 'custom' ? [cw * MM, ch * MM] : PAGE_SIZES[size]
    const d = displaySize(p)
    const land = orient === 'landscape' || (orient === 'keep' && d.w > d.h)
    if (orient !== 'keep' || size !== 'custom') [w, h] = land ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)]
    return [w, h]
  }

  return (
    <DialogShell id="pageSetup" title="Page size, margins & alignment" description="Resize pages, add or remove margins, centre or align content, and normalise mixed page sizes." size="lg" footer={<Button variant="outline" onClick={close}>Close</Button>}>
      <ScopeSelect value={scope} onChange={setScope} />
      <Tabs defaultValue="size">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="size">Resize</TabsTrigger>
          <TabsTrigger value="margins">Margins</TabsTrigger>
          <TabsTrigger value="align">Align</TabsTrigger>
          <TabsTrigger value="normalize">Normalise</TabsTrigger>
        </TabsList>
        <TabsContent value="size" className="space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Page size">
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger aria-label="Page size"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(PAGE_SIZES).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}<SelectItem value="custom">Custom (mm)</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Orientation">
              <Select value={orient} onValueChange={(v) => setOrient(v as typeof orient)}>
                <SelectTrigger aria-label="Orientation"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="keep">Keep each page’s</SelectItem><SelectItem value="portrait">Portrait</SelectItem><SelectItem value="landscape">Landscape</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          {size === 'custom' && <div className="grid grid-cols-2 gap-3"><Field label="Width (mm)"><Input type="number" value={cw} onChange={(e) => setCw(parseFloat(e.target.value) || 1)} /></Field><Field label="Height (mm)"><Input type="number" value={ch} onChange={(e) => setCh(parseFloat(e.target.value) || 1)} /></Field></div>}
          <Label className="flex items-center gap-2 font-normal"><Checkbox checked={fit} onCheckedChange={(v) => setFit(v === true)} /> Scale content to fit the new size</Label>
          <div className="flex items-center gap-4"><AlignPicker value={align} onChange={setAlign} /><Field label="Inner margin (pt)"><Input type="number" min={0} value={margin} onChange={(e) => setMargin(parseFloat(e.target.value) || 0)} className="w-24" /></Field></div>
          <Button onClick={() => apply((p) => { const [w, h] = targetSize(p); return { frame: resizeFrame(p, w, h, { fit, align, margin }) } }, 'Resized')} data-testid="setup-resize">Resize pages</Button>
          <p className="text-xs text-muted-foreground">Scaling re-draws the page as a form object, so links and form fields on scaled pages are not preserved in the export. Without scaling, only the page boxes change.</p>
        </TabsContent>
        <TabsContent value="margins" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">Positive values add blank margin; negative values remove margin (crop inward).</p>
          <div className="grid grid-cols-2 gap-3">
            {(['top', 'right', 'bottom', 'left'] as const).map((k) => <Field key={k} label={`${k[0].toUpperCase() + k.slice(1)} (pt)`}><Input type="number" value={m[k]} onChange={(e) => setM({ ...m, [k]: parseFloat(e.target.value) || 0 })} /></Field>)}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => apply((p) => ({ frame: addMargins(p, m) }), 'Margins added')} data-testid="setup-add-margins">Add margins</Button>
            <Button variant="outline" onClick={() => apply((p) => ({ frame: addMargins(p, { top: -Math.abs(m.top), right: -Math.abs(m.right), bottom: -Math.abs(m.bottom), left: -Math.abs(m.left) }) }), 'Margins removed')}>Remove margins</Button>
          </div>
        </TabsContent>
        <TabsContent value="align" className="space-y-3 pt-3">
          <div className="flex items-center gap-4"><AlignPicker value={align} onChange={setAlign} /><p className="text-sm text-muted-foreground">Positions the current content inside the same page size.</p></div>
          <div className="flex gap-2">
            <Button onClick={() => apply((p) => ({ frame: alignFrame(p, align) }), 'Content aligned')}>Align content</Button>
            <Button variant="outline" onClick={() => apply((p) => ({ frame: alignFrame(p, 'center') }), 'Content centred')}>Centre content</Button>
          </div>
        </TabsContent>
        <TabsContent value="normalize" className="space-y-3 pt-3">
          <Field label="Make every page the size of">
            <Select value={normalizeTo} onValueChange={(v) => setNormalizeTo(v as typeof normalizeTo)}>
              <SelectTrigger aria-label="Normalise to"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="first">The first page</SelectItem><SelectItem value="A4">A4</SelectItem><SelectItem value="Letter">US Letter</SelectItem></SelectContent>
            </Select>
          </Field>
          <Button data-testid="setup-normalize" onClick={() => {
            const pages = getPages(docId)
            const first = displaySize(pages[0])
            const [tw, th] = normalizeTo === 'first' ? [first.w, first.h] : PAGE_SIZES[normalizeTo]
            apply((p) => { const d = displaySize(p); const land = d.w > d.h; const [w, h] = land ? [Math.max(tw, th), Math.min(tw, th)] : [Math.min(tw, th), Math.max(tw, th)]; return { frame: resizeFrame(p, w, h, { fit: true, align: 'center', margin: 0 }) } }, 'Sizes normalised')
          }}>Normalise page sizes</Button>
          <p className="text-xs text-muted-foreground">Each page is scaled to fit and centred, keeping its own orientation.</p>
        </TabsContent>
      </Tabs>
    </DialogShell>
  )
}
