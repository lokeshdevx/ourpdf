'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { cancelSearch, goToHit, nextHit, prevHit, replaceHits, runSearch } from '@/services/pdf/search-service'
import { usePdfStore } from '@/stores/pdf-store'
import { useSearchStore } from '@/stores/search-store'
import { confirmAction } from '@/stores/confirm-store'
import { useDebounced } from '@/hooks/use-debounced'
import { cn } from '@/lib/utils'
import { useActivePages } from '@/stores/page-store'

export function SearchPanel() {
  const docId = usePdfStore((s) => s.activeId)
  const pages = useActivePages()
  const { query, options, hits, current, status, progress, replacement } = useSearchStore()
  const set = useSearchStore.getState
  const debounced = useDebounced(query, 250)
  const [showReplace, setShowReplace] = useState(false)

  useEffect(() => {
    if (!docId) return
    void runSearch(docId, debounced, options)
    return () => cancelSearch()
  }, [docId, debounced, options, pages.length])

  const doReplace = async (all: boolean) => {
    if (!docId || !hits.length || !replacement) return
    const list = all ? hits : [hits[current]]
    const ok = await confirmAction({
      title: `Replace ${list.length} match${list.length > 1 ? 'es' : ''}?`,
      description: 'The original text is covered and the replacement is overlaid on the page (arbitrary PDF text cannot be edited natively). The original remains in the file underneath – use Redact to remove content permanently. Longer replacements may overlap neighbouring text.',
      confirmLabel: 'Replace',
    })
    if (!ok) return
    const n = await replaceHits(docId, list, replacement)
    toast.success(`Replaced ${n} match${n > 1 ? 'es' : ''}`)
    useSearchStore.getState().reset()
    void runSearch(docId, query, options)
  }

  return (
    <div className="flex h-full flex-col" data-testid="search-panel">
      <div className="space-y-2 border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-muted-foreground" />
          <Input
            id="search-input"
            value={query}
            onChange={(e) => set().setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (e.shiftKey) prevHit(); else nextHit() } }}
            placeholder="Find in document"
            aria-label="Search query"
            className="h-8 pl-7 pr-7 text-xs"
            data-testid="search-input"
          />
          {query && <button type="button" aria-label="Clear search" className="absolute right-1.5 top-1.5 rounded p-0.5 hover:bg-accent" onClick={() => set().setQuery('')}><X className="size-3.5" /></button>}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <Button size="icon-sm" variant="outline" className="size-7" disabled={!hits.length} onClick={prevHit} aria-label="Previous result"><ChevronUp className="size-3.5" /></Button>
          <Button size="icon-sm" variant="outline" className="size-7" disabled={!hits.length} onClick={nextHit} aria-label="Next result"><ChevronDown className="size-3.5" /></Button>
          <span className="ml-1 text-muted-foreground" aria-live="polite" data-testid="search-count">
            {status === 'running' ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> {hits.length} so far…</span> : query.trim() ? (hits.length ? `${current + 1} of ${hits.length}` : 'No results') : ''}
          </span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={() => setShowReplace((v) => !v)}>Replace</Button>
        </div>
        {status === 'running' && <Progress value={progress * 100} className="h-1" aria-label="Search progress" />}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {([['caseSensitive', 'Case sensitive'], ['wholeWord', 'Whole word'], ['exactPhrase', 'Exact phrase'], ['includeOcr', 'Include OCR text']] as const).map(([k, label]) => (
            <Label key={k} className="flex items-center gap-1.5 text-[11px] font-normal">
              <Checkbox checked={options[k]} onCheckedChange={(v) => set().setOptions({ [k]: v === true })} /> {label}
            </Label>
          ))}
        </div>
        {showReplace && (
          <div className="space-y-1.5">
            <Input value={replacement} onChange={(e) => set().setReplacement(e.target.value)} placeholder="Replace with…" aria-label="Replacement text" className="h-8 text-xs" />
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={!hits.length || !replacement} onClick={() => void doReplace(false)}>Replace</Button>
              <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={!hits.length || !replacement} onClick={() => void doReplace(true)}>Replace all</Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Overlay replacement – original text stays underneath. Use Redact to remove it.</p>
          </div>
        )}
      </div>
      <ul className="scroll-thin min-h-0 flex-1 overflow-auto p-1" aria-label="Search results">
        {hits.slice(0, 500).map((h, i) => (
          <li key={i}>
            <button type="button" onClick={() => goToHit(i)} className={cn('w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent', i === current && 'bg-accent')} data-testid="search-result">
              <span className="text-[10px] text-muted-foreground">Page {h.pageIndex + 1}{h.fromOcr ? ' · OCR' : ''}</span>
              <div className="line-clamp-2 break-words">
                {h.before}<mark className="rounded bg-yellow-300 px-0.5 text-black">{h.match}</mark>{h.after}
              </div>
            </button>
          </li>
        ))}
        {hits.length > 500 && <li className="p-2 text-center text-[11px] text-muted-foreground">Showing the first 500 of {hits.length} results</li>}
      </ul>
    </div>
  )
}
