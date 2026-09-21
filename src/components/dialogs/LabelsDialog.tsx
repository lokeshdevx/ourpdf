'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { pageLabelFor, setPageLabels } from '@/services/pdf/page-service'
import { useActivePages } from '@/stores/page-store'
import { useActiveDocInfo } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import type { PageLabelRange } from '@/types'
import { toAlpha, toRoman } from '@/utils/pages'
import { DialogShell } from './DialogShell'

export default function LabelsDialog() {
  const doc = useActiveDocInfo()!
  const pages = useActivePages()
  const close = useUiStore((s) => s.closeDialog)
  const [ranges, setRanges] = useState<PageLabelRange[]>(doc.pageLabels.length ? doc.pageLabels : [{ from: 0, style: 'decimal', prefix: '', start: 1 }])
  const upd = (i: number, p: Partial<PageLabelRange>) => setRanges((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const preview = pages.slice(0, 12).map((_, i) => pageLabelFor(ranges, i, toRoman, toAlpha) || '·').join('  ')
  return (
    <DialogShell
      id="labels"
      title="Page labels & custom numbering"
      description="Labels are what viewers display for each page (e.g. i, ii, iii, then 1, 2, 3) and are saved in the PDF. Use Header/Footer with {label} to print them on the page."
      size="lg"
      footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button variant="ghost" onClick={() => { setPageLabels(doc.id, []); close() }}>Remove labels</Button><Button onClick={() => { setPageLabels(doc.id, ranges.filter((r) => r.from < pages.length)); close() }} data-testid="labels-apply">Apply</Button></>}
    >
      <div className="space-y-2">
        {ranges.map((r, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[80px_1fr_100px_70px_32px]">
            <label className="text-xs text-muted-foreground">Starting page<Input type="number" min={1} max={pages.length} value={r.from + 1} onChange={(e) => upd(i, { from: Math.max(0, Math.min(pages.length - 1, (parseInt(e.target.value) || 1) - 1)) })} aria-label="Starting page" /></label>
            <label className="text-xs text-muted-foreground">Style
              <Select value={r.style} onValueChange={(v) => upd(i, { style: v as PageLabelRange['style'] })}>
                <SelectTrigger aria-label="Numbering style"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="decimal">1, 2, 3</SelectItem><SelectItem value="roman">i, ii, iii</SelectItem><SelectItem value="ROMAN">I, II, III</SelectItem><SelectItem value="alpha">a, b, c</SelectItem><SelectItem value="ALPHA">A, B, C</SelectItem><SelectItem value="none">Prefix only</SelectItem></SelectContent>
              </Select>
            </label>
            <label className="text-xs text-muted-foreground">Prefix<Input value={r.prefix} onChange={(e) => upd(i, { prefix: e.target.value })} aria-label="Prefix" /></label>
            <label className="text-xs text-muted-foreground">Start at<Input type="number" min={1} value={r.start} onChange={(e) => upd(i, { start: parseInt(e.target.value) || 1 })} aria-label="Start number" /></label>
            <Button size="icon-sm" variant="ghost" className="col-span-2 justify-self-end sm:col-span-1" aria-label="Remove range" disabled={ranges.length === 1} onClick={() => setRanges((l) => l.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setRanges((l) => [...l, { from: Math.min(pages.length - 1, (l[l.length - 1]?.from ?? 0) + 1), style: 'decimal', prefix: '', start: 1 }])}><Plus className="size-4" /> Add range</Button>
      </div>
      <p className="rounded bg-muted p-2 font-mono text-xs" aria-label="Preview">{preview}{pages.length > 12 ? ' …' : ''}</p>
    </DialogShell>
  )
}
