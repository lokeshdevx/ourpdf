'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ColorField, SliderField } from '@/components/editor/controls'
import { STANDARD_FAMILIES } from '@/lib/fonts'
import { applyImageWatermark, applyTextWatermark, decorationGroups, removeDecoration, type Position } from '@/services/pdf/decorations'
import { importImageAsset } from '@/services/pdf/image-service'
import { pickFiles } from '@/services/import'
import { useActiveObjects } from '@/stores/annotation-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import type { FontFamilyKey } from '@/types'
import { DialogShell, Field } from './DialogShell'
import { usePageScope } from './PageScope'

const POSITIONS: Position[] = ['center', 'top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right']

export default function WatermarkDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const close = useUiStore((s) => s.closeDialog)
  useActiveObjects()
  const [tab, setTab] = useState<'text' | 'image'>('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [font, setFont] = useState<FontFamilyKey>('helvetica')
  const [size, setSize] = useState(64)
  const [color, setColor] = useState('#c0c0c0')
  const [bold, setBold] = useState(true)
  const [opacity, setOpacity] = useState(0.35)
  const [rotation, setRotation] = useState(-35)
  const [position, setPosition] = useState<Position>('center')
  const [tile, setTile] = useState(false)
  const [assetId, setAssetId] = useState<string | null>(null)
  const [assetName, setAssetName] = useState('')
  const [scale, setScale] = useState(0.5)
  const scope = usePageScope('all')
  const groups = decorationGroups(docId, 'watermark')

  const apply = async () => {
    if (scope.error || !scope.ids.length) return void toast.error(scope.error ?? 'No pages selected')
    if (tab === 'text') {
      if (!text.trim()) return void toast.error('Enter watermark text')
      await applyTextWatermark(docId, { text, font, fontSize: size, color, opacity, rotation, position, tile, bold, pageIds: scope.ids })
    } else {
      if (!assetId) return void toast.error('Choose an image')
      applyImageWatermark(docId, { assetId, scale, opacity, rotation, position, tile, pageIds: scope.ids })
    }
    toast.success('Watermark added')
  }
  return (
    <DialogShell id="watermark" title="Watermark" description="Adds an editable watermark to the chosen pages (undo-able)." size="lg" footer={<><Button variant="outline" onClick={close}>Close</Button><Button onClick={() => void apply()} data-testid="wm-apply">Add to {scope.ids.length} page{scope.ids.length === 1 ? '' : 's'}</Button></>}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="text">Text</TabsTrigger><TabsTrigger value="image">Image</TabsTrigger></TabsList>
        <TabsContent value="text" className="space-y-3 pt-3">
          <Field label="Text" htmlFor="wm-text"><Input id="wm-text" value={text} onChange={(e) => setText(e.target.value)} data-testid="wm-text" /></Field>
          <div className="grid grid-cols-3 items-end gap-3">
            <Field label="Font"><Select value={font} onValueChange={(v) => setFont(v as FontFamilyKey)}><SelectTrigger aria-label="Font"><SelectValue /></SelectTrigger><SelectContent>{STANDARD_FAMILIES.map((f) => <SelectItem key={f.key} value={f.key}>{f.key}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Font size (pt)"><Input type="number" min={6} max={400} value={size} onChange={(e) => setSize(parseFloat(e.target.value) || 12)} /></Field>
            <Field label="Colour"><ColorField value={color} onChange={(v) => v && setColor(v)} label="Watermark colour" /></Field>
          </div>
          <Label className="flex items-center gap-2 font-normal"><Checkbox checked={bold} onCheckedChange={(v) => setBold(v === true)} /> Bold</Label>
        </TabsContent>
        <TabsContent value="image" className="space-y-3 pt-3">
          <Button variant="outline" onClick={async () => { const f = (await pickFiles({ accept: 'image/*', multiple: false }))[0]; if (!f) return; try { const a = await importImageAsset(f, f.name); setAssetId(a.id); setAssetName(f.name) } catch (e) { toast.error((e as Error).message) } }} data-testid="wm-choose-image">{assetName || 'Choose image…'}</Button>
          <SliderField label="Width (% of page)" value={Math.round(scale * 100)} min={5} max={100} step={1} onChange={(v) => setScale(v / 100)} format={(v) => `${v}%`} />
        </TabsContent>
      </Tabs>
      <div className="grid gap-4 sm:grid-cols-2">
        <SliderField label="Opacity" value={Math.round(opacity * 100)} min={5} max={100} step={1} onChange={(v) => setOpacity(v / 100)} format={(v) => `${v}%`} />
        <SliderField label="Rotation" value={rotation} min={-180} max={180} step={5} onChange={setRotation} format={(v) => `${v}°`} />
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
        <Field label="Position">
          <Select value={position} onValueChange={(v) => setPosition(v as Position)}><SelectTrigger aria-label="Position"><SelectValue /></SelectTrigger><SelectContent>{POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
        </Field>
        <Label className="flex items-center gap-2 pb-2 font-normal"><Checkbox checked={tile} onCheckedChange={(v) => setTile(v === true)} /> Tile across the page</Label>
      </div>
      {scope.ui}
      {groups.length > 0 && (
        <div className="space-y-1 rounded-md border p-3">
          <h4 className="text-xs font-medium text-muted-foreground">Existing watermarks</h4>
          {groups.map((g) => (
            <div key={g.group} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{g.sample}</span><span className="text-xs text-muted-foreground">{g.count} page(s)</span><Button size="icon-sm" variant="ghost" aria-label="Remove watermark" onClick={() => removeDecoration(docId, g.group)}><Trash2 className="size-4" /></Button></div>
          ))}
        </div>
      )}
    </DialogShell>
  )
}
