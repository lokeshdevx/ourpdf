'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { pickFiles } from '@/services/import'
import { openSource, destroySource } from '@/services/pdf/sources'
import { insertPdfPages } from '@/services/pdf/page-service'
import { runTask } from '@/services/tasks'
import { parsePageRanges } from '@/utils/pages'
import { useActivePages, useCurrentPageIndex } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { requestPassword } from '@/services/import'
import { toast } from 'sonner'
import { DialogShell, Field } from './DialogShell'

export default function InsertPdfDialog() {
  const docId = usePdfStore((s) => s.activeId)!
  const pages = useActivePages()
  const current = useCurrentPageIndex()
  const close = useUiStore((s) => s.closeDialog)
  const [file, setFile] = useState<File | null>(null)
  const [count, setCount] = useState(0)
  const [password, setPassword] = useState<string | undefined>()
  const [where, setWhere] = useState<'after' | 'before' | 'start' | 'end'>('after')
  const [range, setRange] = useState('')

  const choose = async () => {
    const f = (await pickFiles({ accept: '.pdf,application/pdf', multiple: false }))[0]
    if (!f) return
    let pw: string | undefined
    for (;;) {
      try {
        const s = await openSource(f, f.name, { password: pw })
        setFile(f)
        setCount(s.numPages)
        setPassword(pw)
        await destroySource(s.id)
        return
      } catch (e) {
        const err = e as { code?: string; message: string }
        if (err.code === 'password-required' || err.code === 'password-incorrect') {
          const got = await requestPassword(f.name, err.code === 'password-incorrect')
          if (got === null) return
          pw = got
        } else return void toast.error('Cannot read that PDF', { description: err.message })
      }
    }
  }

  const at = where === 'start' ? 0 : where === 'end' ? pages.length : where === 'before' ? current : current + 1
  const run = () => {
    if (!file) return
    let only: number[] | undefined
    try {
      only = range.trim() ? parsePageRanges(range, count) : undefined
    } catch (e) {
      return void toast.error((e as Error).message)
    }
    close()
    void runTask('Inserting pages', () => insertPdfPages(docId, file, file.name, at, only, password), { successMessage: 'Pages inserted' })
  }

  return (
    <DialogShell id="insertPdf" title="Insert pages from PDF" footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={!file} onClick={run} data-testid="insert-run">Insert</Button></>}>
      <Button variant="outline" onClick={() => void choose()} data-testid="insert-choose">{file ? `${file.name} (${count} pages)` : 'Choose PDF…'}</Button>
      <RadioGroup value={where} onValueChange={(v) => setWhere(v as typeof where)} className="grid grid-cols-2 gap-2">
        {([['after', `After page ${current + 1}`], ['before', `Before page ${current + 1}`], ['start', 'At the start'], ['end', 'At the end']] as const).map(([v, l]) => (
          <Label key={v} className="flex items-center gap-2 font-normal"><RadioGroupItem value={v} /> {l}</Label>
        ))}
      </RadioGroup>
      <Field label="Only these pages (optional)" hint={file ? `1–${count}. Leave empty to insert all.` : 'Choose a file first'} htmlFor="insert-range"><Input id="insert-range" value={range} onChange={(e) => setRange(e.target.value)} disabled={!file} placeholder="e.g. 1-3, 5" /></Field>
    </DialogShell>
  )
}
