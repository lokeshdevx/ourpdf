'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ColorField } from '@/components/editor/controls'
import { STANDARD_FAMILIES } from '@/lib/fonts'
import { applyBates, applyHeaderFooter, decorationGroups, removeDecoration } from '@/services/pdf/decorations'
import { runTask } from '@/services/tasks'
import { useActiveObjects } from '@/stores/annotation-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import type { FontFamilyKey } from '@/types'
import { toast } from 'sonner'
import { DialogShell, Field, useDialogData } from './DialogShell'
import { usePageScope } from './PageScope'

const TOKENS = ['{page}', '{total}', '{label}', '{date}', '{time}']

export default function HeaderFooterDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const data = useDialogData<{ kind?: 'header' | 'footer' | 'bates'; preset?: 'numbers' }>()
  const close = useUiStore((s) => s.closeDialog)
  useActiveObjects()
  const [tab, setTab] = useState<'header' | 'footer' | 'bates'>(data?.kind ?? 'footer')
  const numbers = data?.preset === 'numbers'
  const [text, setText] = useState({ header: { left: '', center: '', right: '' }, footer: { left: '', center: numbers ? 'Page {page} of {total}' : '', right: '' } })
  const [font, setFont] = useState<FontFamilyKey>('helvetica')
  const [size, setSize] = useState(10)
  const [color, setColor] = useState('#444444')
  const [margin, setMargin] = useState(36)
  const [skipFirst, setSkipFirst] = useState(false)
  const [bates, setBates] = useState({ prefix: 'DOC-', suffix: '', start: 1, digits: 6, position: 'bottom-right' as const })
  const scope = usePageScope('all')
  const [focus, setFocus] = useState<{ tab: 'header' | 'footer'; slot: 'left' | 'center' | 'right' }>({ tab: 'footer', slot: 'center' })
  const groups = decorationGroups(docId).filter((g) => ['header', 'footer', 'bates'].includes(g.kind))

  const insertToken = (t: string) => setText((s) => ({ ...s, [focus.tab]: { ...s[focus.tab], [focus.slot]: s[focus.tab][focus.slot] + t } }))
  const apply = () => {
    if (scope.error || !scope.ids.length) return void toast.error(scope.error ?? 'No pages')
    if (tab === 'bates') {
      applyBates(docId, { ...bates, fontSize: size, pageIds: scope.ids })
      toast.success('Bates numbering added')
    } else {
      const t = text[tab]
      if (!t.left.trim() && !t.center.trim() && !t.right.trim()) return void toast.error('Enter some text first')
      void runTask(`Adding ${tab}`, () => applyHeaderFooter(docId, { kind: tab, ...t, font, fontSize: size, color, margin, skipFirst, pageIds: scope.ids }), { quiet: true })
      toast.success(`${tab === 'header' ? 'Header' : 'Footer'} added`)
    }
  }

  return (
    <DialogShell id="headerFooter" title="Header, footer & numbering" description="Text can contain {page} {total} {label} {date} {time}. Added as editable text objects on each page." size="lg" footer={<><Button variant="outline" onClick={close}>Close</Button><Button onClick={apply} data-testid="hf-apply">Add to {scope.ids.length} page{scope.ids.length === 1 ? '' : 's'}</Button></>}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="header">Header</TabsTrigger><TabsTrigger value="footer">Footer</TabsTrigger><TabsTrigger value="bates">Bates numbering</TabsTrigger></TabsList>
        {(['header', 'footer'] as const).map((k) => (
          <TabsContent key={k} value={k} className="space-y-3 pt-3">
            <div className="grid grid-cols-3 gap-2">
              {(['left', 'center', 'right'] as const).map((slot) => (
                <Field key={slot} label={`${slot[0].toUpperCase() + slot.slice(1)} aligned`}>
                  <Input value={text[k][slot]} onFocus={() => setFocus({ tab: k, slot })} onChange={(e) => setText((s) => ({ ...s, [k]: { ...s[k], [slot]: e.target.value } }))} placeholder={slot === 'center' ? 'Page {page} of {total}' : ''} data-testid={`hf-${k}-${slot}`} />
                </Field>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs"><span className="text-muted-foreground">Insert:</span>{TOKENS.map((t) => <Button key={t} size="sm" variant="outline" className="h-6 px-2 font-mono text-[11px]" onClick={() => insertToken(t)}>{t}</Button>)}</div>
            <Label className="flex items-center gap-2 font-normal"><Checkbox checked={skipFirst} onCheckedChange={(v) => setSkipFirst(v === true)} /> Exclude the first page</Label>
          </TabsContent>
        ))}
        <TabsContent value="bates" className="space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prefix"><Input value={bates.prefix} onChange={(e) => setBates({ ...bates, prefix: e.target.value })} /></Field>
            <Field label="Suffix"><Input value={bates.suffix} onChange={(e) => setBates({ ...bates, suffix: e.target.value })} /></Field>
            <Field label="Start number"><Input type="number" min={0} value={bates.start} onChange={(e) => setBates({ ...bates, start: parseInt(e.target.value) || 0 })} /></Field>
            <Field label="Digits"><Input type="number" min={1} max={12} value={bates.digits} onChange={(e) => setBates({ ...bates, digits: parseInt(e.target.value) || 1 })} /></Field>
          </div>
          <Field label="Position">
            <Select value={bates.position} onValueChange={(v) => setBates({ ...bates, position: v as typeof bates.position })}>
              <SelectTrigger aria-label="Position"><SelectValue /></SelectTrigger>
              <SelectContent>{['bottom-right', 'bottom-left', 'bottom', 'top-right', 'top-left', 'top'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">Numbers follow page order at export time, so reordering pages keeps them sequential.</p>
        </TabsContent>
      </Tabs>
      <div className="grid grid-cols-4 items-end gap-3">
        <Field label="Font">
          <Select value={font} onValueChange={(v) => setFont(v as FontFamilyKey)}><SelectTrigger aria-label="Font"><SelectValue /></SelectTrigger><SelectContent>{STANDARD_FAMILIES.map((f) => <SelectItem key={f.key} value={f.key}>{f.key}</SelectItem>)}</SelectContent></Select>
        </Field>
        <Field label="Size (pt)"><Input type="number" min={4} max={72} value={size} onChange={(e) => setSize(parseFloat(e.target.value) || 10)} /></Field>
        <Field label="Margin (pt)"><Input type="number" min={0} max={200} value={margin} onChange={(e) => setMargin(parseFloat(e.target.value) || 0)} /></Field>
        <Field label="Colour"><ColorField value={color} onChange={(v) => v && setColor(v)} label="Text colour" /></Field>
      </div>
      {scope.ui}
      {groups.length > 0 && (
        <div className="space-y-1 rounded-md border p-3">
          <h4 className="text-xs font-medium text-muted-foreground">Already added</h4>
          {groups.map((g) => (
            <div key={g.group} className="flex items-center gap-2 text-sm">
              <span className="w-16 text-xs uppercase text-muted-foreground">{g.kind}</span>
              <span className="min-w-0 flex-1 truncate">{g.sample}</span>
              <span className="text-xs text-muted-foreground">{g.count}×</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${g.kind}`} onClick={() => removeDecoration(docId, g.group)}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
      )}
    </DialogShell>
  )
}
