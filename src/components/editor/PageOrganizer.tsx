'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runCommand } from '@/features/commands'
import { goToPage } from '@/services/viewer-bus'
import { useActivePages } from '@/stores/page-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useUiStore } from '@/stores/ui-store'
import { evenIndices, oddIndices } from '@/utils/pages'
import { PageGrid } from './sidebar/PageGrid'

/** Full-area page grid for reordering (drag & drop), multi-select and bulk operations. */
export function PageOrganizer() {
  const pages = useActivePages()
  const sel = useSelectionStore((s) => s.pageIds)
  const setPages = useSelectionStore((s) => s.setPages)
  const bulk: [string, string][] = [['pages.rotateCcw', '⟲ Rotate'], ['pages.rotateCw', '⟳ Rotate'], ['pages.duplicate', 'Duplicate'], ['pages.delete', 'Delete'], ['pages.copy', 'Copy'], ['pages.paste', 'Paste'], ['pages.extract', 'Extract…'], ['pages.addBlank', 'Insert blank'], ['pages.reverse', 'Reverse']]
  return (
    <div className="flex h-full flex-col bg-background" data-testid="page-organizer">
      <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2 text-xs">
        <strong className="mr-2 text-sm">Organize pages</strong>
        <span className="mr-2 text-muted-foreground">{sel.length ? `${sel.length} selected` : 'Drag pages to reorder. Ctrl/Shift-click to select several.'}</span>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setPages(pages.map((p) => p.id))}>Select all</Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setPages(oddIndices(pages.length).map((i) => pages[i].id))}>Odd</Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setPages(evenIndices(pages.length).map((i) => pages[i].id))}>Even</Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setPages([])}>None</Button>
        <span className="mx-1 h-5 w-px bg-border" />
        {bulk.map(([id, label]) => (
          <Button key={id} size="sm" variant="outline" className="h-7" onClick={() => void runCommand(id)}>{label}</Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1" onClick={() => useUiStore.getState().set({ organizer: false })}><X className="size-3.5" /> Close</Button>
      </div>
      <div className="min-h-0 flex-1">
        <PageGrid cellW={150} cellH={210} gap={14} onOpen={(i) => { useUiStore.getState().set({ organizer: false }); setTimeout(() => goToPage(i), 50) }} />
      </div>
    </div>
  )
}
