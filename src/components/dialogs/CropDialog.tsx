'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { applyCrop } from '@/lib/frame'
import { MM, effectiveCrop } from '@/lib/geometry'
import { cropMargins, pagesForScope, resetCropFor, trimWhitespace, type CropScope } from '@/services/pdf/crop-actions'
import { setPageGeometry } from '@/services/pdf/page-service'
import { usePdfStore } from '@/stores/pdf-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import type { PageModel } from '@/types'
import { toast } from 'sonner'
import { DialogShell, Field } from './DialogShell'

export default function CropDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const close = useUiStore((s) => s.closeDialog)
  const [scope, setScope] = useState<CropScope>('current')
  const [m, setM] = useState({ top: 0, right: 0, bottom: 0, left: 0 })
  const [cw, setCw] = useState(150)
  const [ch, setCh] = useState(200)
  return (
    <DialogShell
      id="crop"
      title="Crop pages"
      description="Draw a crop rectangle on the page (visual tool is now active), or set exact margins/dimensions below."
      footer={<Button variant="outline" onClick={close}>Close</Button>}
    >
      <Field label="Apply to">
        <Select value={scope} onValueChange={(v) => setScope(v as CropScope)}>
          <SelectTrigger aria-label="Apply to"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="current">Current page</SelectItem><SelectItem value="selected">Selected pages</SelectItem><SelectItem value="all">All pages</SelectItem></SelectContent>
        </Select>
      </Field>
      <div className="space-y-2 rounded-md border p-3">
        <h3 className="text-sm font-medium">Crop margins (pt)</h3>
        <div className="grid grid-cols-4 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><Input type="number" min={0} value={m[k]} onChange={(e) => setM({ ...m, [k]: Math.max(0, parseFloat(e.target.value) || 0) })} /></Field>)}
        </div>
        <Button size="sm" onClick={() => { cropMargins(docId, scope, m); toast.success('Margins cropped'); close() }} data-testid="crop-apply-margins">Apply crop box</Button>
      </div>
      <div className="space-y-2 rounded-md border p-3">
        <h3 className="text-sm font-medium">Centre crop with custom dimensions (mm)</h3>
        <div className="grid grid-cols-2 gap-2"><Field label="Width"><Input type="number" min={5} value={cw} onChange={(e) => setCw(parseFloat(e.target.value) || 5)} /></Field><Field label="Height"><Input type="number" min={5} value={ch} onChange={(e) => setCh(parseFloat(e.target.value) || 5)} /></Field></div>
        <Button size="sm" variant="outline" onClick={() => {
          const targets = pagesForScope(docId, scope)
          const patches: Record<string, Pick<PageModel, 'crop' | 'frame'>> = {}
          for (const p of targets) { const c = effectiveCrop(p); const w = Math.min(c.w, cw * MM); const h = Math.min(c.h, ch * MM); patches[p.id] = applyCrop(p, { x: c.x + (c.w - w) / 2, y: c.y + (c.h - h) / 2, w, h }) }
          setPageGeometry(docId, patches, 'Centre crop')
          close()
        }}>Centre crop</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { close(); useToolStore.getState().setTool('crop') }}>Use visual crop tool</Button>
        <Button size="sm" variant="outline" onClick={() => { close(); void trimWhitespace(scope) }}>Trim white margins</Button>
        <Button size="sm" variant="ghost" onClick={() => { resetCropFor(docId, scope); toast.success('Crop reset'); close() }}>Reset crop</Button>
      </div>
      <p className="text-xs text-muted-foreground">Cropping sets the page’s visible box. As in most PDF editors, hidden content remains in the file – use Redact to remove content permanently.</p>
    </DialogShell>
  )
}
