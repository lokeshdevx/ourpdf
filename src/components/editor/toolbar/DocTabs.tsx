'use client'

import { Circle, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { closeAll, closeDocumentInteractive, closeOthers, saveDocument } from '@/services/actions'
import { openFileDialog } from '@/services/import'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { cn } from '@/lib/utils'
import { useDialogOpener } from '@/hooks/use-dialog'

export function DocTabs() {
  const docs = usePdfStore((s) => s.docs)
  const activeId = usePdfStore((s) => s.activeId)
  const open = useDialogOpener()
  if (!docs.length) return null
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b bg-muted/40 px-1 pt-1 scroll-thin" role="tablist" aria-label="Open documents" data-testid="doc-tabs">
      {docs.map((d, i) => (
        <ContextMenu key={d.id}>
          <ContextMenuTrigger asChild>
            <div
              role="tab"
              tabIndex={0}
              aria-selected={d.id === activeId}
              data-testid="doc-tab"
              onClick={() => { usePdfStore.getState().setActive(d.id); useSelectionStore.getState().clear() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); usePdfStore.getState().setActive(d.id) } }}
              onAuxClick={(e) => e.button === 1 && void closeDocumentInteractive(d.id)}
              className={cn('group flex max-w-52 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 py-1.5 text-xs', d.id === activeId ? 'bg-background font-medium' : 'bg-transparent text-muted-foreground hover:bg-background/60')}
            >
              {d.modified && <Circle className="size-2 shrink-0 fill-amber-500 text-amber-500" aria-label="Unsaved changes" />}
              <span className="truncate" title={d.name}>{d.name}</span>
              <button type="button" aria-label={`Close ${d.name}`} className="rounded p-0.5 opacity-60 hover:bg-accent hover:opacity-100 focus-visible:opacity-100" onClick={(e) => { e.stopPropagation(); void closeDocumentInteractive(d.id) }}>
                <X className="size-3" />
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => void saveDocument(d.id)}>Save (download)</ContextMenuItem>
            <ContextMenuItem onSelect={() => { usePdfStore.getState().setActive(d.id); open('metadata') }}>Properties…</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={i === 0} onSelect={() => usePdfStore.getState().moveDoc(i, i - 1)}>Move left</ContextMenuItem>
            <ContextMenuItem disabled={i === docs.length - 1} onSelect={() => usePdfStore.getState().moveDoc(i, i + 1)}>Move right</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => void closeDocumentInteractive(d.id)}>Close</ContextMenuItem>
            <ContextMenuItem disabled={docs.length < 2} onSelect={() => void closeOthers(d.id)}>Close others</ContextMenuItem>
            <ContextMenuItem onSelect={() => void closeAll()}>Close all</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      <Button variant="ghost" size="icon-sm" className="size-7 shrink-0" aria-label="Open another file" onClick={() => void openFileDialog()}>
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
