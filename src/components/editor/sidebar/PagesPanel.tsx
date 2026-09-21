'use client'

import { ArrowDownUp, Copy, FileMinus, FilePlus2, FileUp, RotateCcw, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runCommand } from '@/features/commands'
import { useActivePages } from '@/stores/page-store'
import { useSelectionStore } from '@/stores/selection-store'
import { evenIndices, oddIndices } from '@/utils/pages'
import { PageGrid } from './PageGrid'

/** Multi-select page list with bulk operations (rotate, delete, duplicate, extract…). */
export function PagesPanel() {
  const pages = useActivePages()
  const selected = useSelectionStore((s) => s.pageIds)
  const setPages = useSelectionStore((s) => s.setPages)
  const btn = (id: string, Icon: typeof Copy, label: string) => (
    <Button key={id} size="icon-sm" variant="ghost" className="size-7" aria-label={label} title={label} disabled={!pages.length} onClick={() => void runCommand(id)}>
      <Icon className="size-3.5" />
    </Button>
  )
  return (
    <div className="flex h-full flex-col" data-testid="pages-panel">
      <div className="space-y-1 border-b p-1.5">
        <div className="flex flex-wrap items-center gap-0.5">
          {btn('pages.rotateCcw', RotateCcw, 'Rotate counter-clockwise')}
          {btn('pages.rotateCw', RotateCw, 'Rotate clockwise')}
          {btn('pages.duplicate', Copy, 'Duplicate')}
          {btn('pages.delete', FileMinus, 'Delete')}
          {btn('pages.addBlank', FilePlus2, 'Add blank page')}
          {btn('pages.extract', FileUp, 'Extract…')}
          {btn('pages.reverse', ArrowDownUp, 'Reverse order')}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-muted-foreground">{selected.length} selected</span>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setPages(pages.map((p) => p.id))}>All</Button>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setPages(oddIndices(pages.length).map((i) => pages[i].id))}>Odd</Button>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setPages(evenIndices(pages.length).map((i) => pages[i].id))}>Even</Button>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setPages([])}>None</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <PageGrid cellW={116} cellH={166} columns={2} gap={8} />
      </div>
    </div>
  )
}
