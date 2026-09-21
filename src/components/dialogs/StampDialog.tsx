'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ColorField } from '@/components/editor/controls'
import { STAMP_PRESETS } from '@/lib/stamps'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import { DialogShell, Field } from './DialogShell'

export default function StampDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const o = useToolStore((s) => s.options)
  const [label, setLabel] = useState(o.stampLabel)
  const [color, setColor] = useState(o.stampColor)
  const [date, setDate] = useState(o.stampDate)
  const [dynamic, setDynamic] = useState(o.stampDynamic)
  const use = (l = label, c = color, d = date, dy = dynamic) => {
    useToolStore.getState().setOptions({ stampLabel: l, stampColor: c, stampDate: d, stampDynamic: dy })
    useToolStore.getState().setTool('stamp')
    close()
  }
  return (
    <DialogShell id="stamp" title="Stamps" description="Pick a preset or make your own, then click on the page to stamp." footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={() => use()} data-testid="stamp-use">Use custom stamp</Button></>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="list">
        {STAMP_PRESETS.map((p) => (
          <button key={p.id} type="button" role="listitem" onClick={() => use(p.label, p.color, !!p.showDate, !!p.dynamic)} className="rounded-md border p-2 text-center text-xs font-bold hover:bg-accent" style={{ color: p.color, borderColor: p.color, borderWidth: 2 }} data-testid={`stamp-${p.id}`}>{p.label.replace('{date}', new Date().toISOString().slice(0, 10)).replace('{time}', new Date().toTimeString().slice(0, 5))}{p.showDate && <div className="text-[10px] font-normal">{new Date().toISOString().slice(0, 10)}</div>}</button>
        ))}
      </div>
      <div className="space-y-3 rounded-md border p-3">
        <Field label="Custom text"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Reviewed by Sam – {date}" /></Field>
        <div className="flex flex-wrap items-center gap-4"><ColorField value={color} onChange={(v) => v && setColor(v)} label="Stamp colour" /><Label className="flex items-center gap-2 font-normal"><Checkbox checked={date} onCheckedChange={(v) => setDate(v === true)} /> Show date</Label><Label className="flex items-center gap-2 font-normal"><Checkbox checked={dynamic} onCheckedChange={(v) => setDynamic(v === true)} /> Dynamic ({'{date}'}, {'{time}'})</Label></div>
      </div>
    </DialogShell>
  )
}
