'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { evenIndices, oddIndices, parsePageRanges } from '@/utils/pages'
import { selectedPageIndices } from '@/services/actions'
import { useActivePages, useCurrentPageIndex } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { Field } from './DialogShell'

export type ScopeKind = 'all' | 'current' | 'selected' | 'range' | 'odd' | 'even'

/** Shared "apply to which pages" picker. Returns page ids for the chosen scope. */
export function usePageScope(defaultKind: ScopeKind = 'all') {
  const docId = usePdfStore((s) => s.activeId)!
  const pages = useActivePages()
  const current = useCurrentPageIndex()
  const [kind, setKind] = useState<ScopeKind>(defaultKind)
  const [range, setRange] = useState('')
  const { ids, error } = useMemo(() => {
    try {
      let idx: number[]
      if (kind === 'all') idx = pages.map((_, i) => i)
      else if (kind === 'current') idx = [current]
      else if (kind === 'selected') idx = selectedPageIndices(docId)
      else if (kind === 'odd') idx = oddIndices(pages.length)
      else if (kind === 'even') idx = evenIndices(pages.length)
      else idx = parsePageRanges(range, pages.length)
      return { ids: idx.map((i) => pages[i]?.id).filter(Boolean) as string[], error: kind === 'range' && !range.trim() ? 'Enter a page range' : kind === 'selected' && !idx.length ? 'No pages are selected' : null }
    } catch (e) {
      return { ids: [] as string[], error: (e as Error).message }
    }
  }, [kind, range, pages, current, docId])
  const ui = (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Apply to pages">
        <Select value={kind} onValueChange={(v) => setKind(v as ScopeKind)}>
          <SelectTrigger aria-label="Apply to pages" data-testid="scope-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pages</SelectItem>
            <SelectItem value="current">Current page</SelectItem>
            <SelectItem value="selected">Selected pages</SelectItem>
            <SelectItem value="range">Page range…</SelectItem>
            <SelectItem value="odd">Odd pages</SelectItem>
            <SelectItem value="even">Even pages</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {kind === 'range' && <Field label="Range" hint="e.g. 1-3, 7"><Input value={range} onChange={(e) => setRange(e.target.value)} aria-invalid={!!error} aria-label="Page range" /></Field>}
      {error && <p className="col-span-2 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
  return { ids, error, ui, kind }
}
