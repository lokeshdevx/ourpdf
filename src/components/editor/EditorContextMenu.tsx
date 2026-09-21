'use client'

import { useState } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { runCommand, getCommand, shortcutOf } from '@/features/commands'
import { formatCombo } from '@/features/shortcuts'
import { markupSelection, readTextSelection } from '@/services/markup'
import { addBookmark } from '@/services/pdf/bookmark-service'
import { getPages } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSearchStore } from '@/stores/search-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useUiStore } from '@/stores/ui-store'
import type { EditObject } from '@/types'
import { useAnnotationStore } from '@/stores/annotation-store'

type Target =
  | { kind: 'object'; type: EditObject['type'] }
  | { kind: 'text'; text: string }
  | { kind: 'page'; index: number }

function Cmd({ id, label }: { id: string; label?: string }) {
  const c = getCommand(id)
  if (!c) return null
  const sc = formatCombo(shortcutOf(c))
  return (
    <ContextMenuItem onSelect={() => void runCommand(id)} data-command={id}>
      {label ?? c.title}
      {sc && <span className="ml-auto pl-4 text-xs text-muted-foreground">{sc}</span>}
    </ContextMenuItem>
  )
}

/** Right-click menu for pages, text, images, annotations and form fields. */
export function EditorContextMenu({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<Target>({ kind: 'page', index: 0 })
  const docId = usePdfStore((s) => s.activeId)

  const onContext = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement
    const objEl = el.closest('[data-obj]') as HTMLElement | null
    if (objEl && docId) {
      const id = objEl.dataset.obj!
      const obj = useAnnotationStore.getState().byDoc[docId]?.objects.find((o) => o.id === id)
      if (obj) {
        if (!useSelectionStore.getState().objectIds.includes(id)) useSelectionStore.getState().setObjects([id])
        return setTarget({ kind: 'object', type: obj.type })
      }
    }
    const sel = readTextSelection()
    if (sel?.text.trim()) return setTarget({ kind: 'text', text: sel.text.trim() })
    const pageEl = el.closest('[data-testid="pdf-page"]') as HTMLElement | null
    const idx = pageEl ? Number(pageEl.dataset.pageIndex) : 0
    if (docId && pageEl) {
      const pg = getPages(docId)[idx]
      if (pg && !useSelectionStore.getState().pageIds.includes(pg.id)) useSelectionStore.getState().setPages([pg.id], pg.id)
    }
    setTarget({ kind: 'page', index: idx })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenuCapture={onContext}>
        {children as React.ReactElement}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60" data-testid="context-menu">
        {target.kind === 'object' && (
          <>
            <ContextMenuLabel className="text-xs capitalize">{target.type}</ContextMenuLabel>
            {target.type === 'text' && <ContextMenuItem onSelect={() => { const id = useSelectionStore.getState().objectIds[0]; useSelectionStore.getState().setEditing(id) }}>Edit text</ContextMenuItem>}
            {target.type === 'image' && (<><Cmd id="image.replace" /><Cmd id="image.flipH" /><Cmd id="image.flipV" /><Cmd id="image.rotateCw" /></>)}
            {target.type === 'link' && <Cmd id="annotate.editLink" />}
            {target.type === 'redact' && <Cmd id="sec.applyRedactions" />}
            {target.type === 'field' && <ContextMenuItem onSelect={() => useUiStore.getState().set({ rightOpen: true, formMode: 'edit' })}>Field properties…</ContextMenuItem>}
            <ContextMenuSeparator />
            <Cmd id="edit.cut" /><Cmd id="edit.copy" /><Cmd id="edit.duplicate" />
            <ContextMenuSub>
              <ContextMenuSubTrigger>Arrange</ContextMenuSubTrigger>
              <ContextMenuSubContent><Cmd id="edit.front" /><Cmd id="edit.forward" /><Cmd id="edit.backward" /><Cmd id="edit.back" /></ContextMenuSubContent>
            </ContextMenuSub>
            <Cmd id="edit.lock" /><Cmd id="edit.unlock" />
            <ContextMenuSeparator />
            <Cmd id="edit.delete" label="Delete" />
          </>
        )}
        {target.kind === 'text' && (
          <>
            <ContextMenuItem onSelect={() => void navigator.clipboard?.writeText(target.text)}>Copy text</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => markupSelection('highlight')}>Highlight</ContextMenuItem>
            <ContextMenuItem onSelect={() => markupSelection('underline')}>Underline</ContextMenuItem>
            <ContextMenuItem onSelect={() => markupSelection('strike')}>Strikeout</ContextMenuItem>
            <ContextMenuItem onSelect={() => markupSelection('squiggly')}>Squiggly underline</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => { useSearchStore.getState().setQuery(target.text.slice(0, 120)); useUiStore.getState().set({ leftOpen: true, leftTab: 'search' }) }}>Search for “{target.text.slice(0, 24)}{target.text.length > 24 ? '…' : ''}”</ContextMenuItem>
            <ContextMenuItem onSelect={() => { const s = readTextSelection(); if (s && docId) { addBookmark(docId, { pageId: s.pageId, title: s.text.slice(0, 80), y: s.rects[0]?.y ?? 0 }); useUiStore.getState().set({ leftOpen: true, leftTab: 'outline' }) } }}>Bookmark this text</ContextMenuItem>
            <ContextMenuItem onSelect={() => void runCommand('annotate.link')}>Create link…</ContextMenuItem>
            <ContextMenuItem onSelect={() => void runCommand('sec.redact')}>Redact…</ContextMenuItem>
          </>
        )}
        {target.kind === 'page' && (
          <>
            <ContextMenuLabel className="text-xs">Page {target.index + 1}</ContextMenuLabel>
            <Cmd id="edit.paste" />
            <Cmd id="text.add" /><Cmd id="image.insert" /><Cmd id="tool.note" />
            <ContextMenuSeparator />
            <Cmd id="pages.rotateCw" /><Cmd id="pages.rotateCcw" /><Cmd id="pages.duplicate" /><Cmd id="pages.addBlank" /><Cmd id="pages.delete" />
            <ContextMenuSeparator />
            <Cmd id="pages.crop" /><Cmd id="pages.extract" /><Cmd id="pages.bookmark" /><Cmd id="ocr.run" />
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
