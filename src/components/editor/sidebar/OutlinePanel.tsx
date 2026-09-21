'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, IndentDecrease, IndentIncrease, Plus, Trash2, Crosshair, TextCursorInput } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addBookmark, deleteBookmark, flattenBookmarks, moveBookmark, updateBookmark } from '@/services/pdf/bookmark-service'
import { goToPage, revealRect } from '@/services/viewer-bus'
import { getPages, useActivePages, useCurrentPageIndex } from '@/stores/page-store'
import { useActiveDocInfo, usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { cn } from '@/lib/utils'

export function OutlinePanel() {
  const doc = useActiveDocInfo()
  const pages = useActivePages()
  const current = useCurrentPageIndex()
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  if (!doc) return null
  const rows = flattenBookmarks(doc.bookmarks)
  const docId = doc.id
  const pageIndex = (pageId: string | null) => pages.findIndex((p) => p.id === pageId)

  const addForPage = () => addBookmark(docId, { pageId: getPages(docId)[current].id, title: `Page ${current + 1}` }, sel ?? undefined)
  const addForText = () => {
    const t = useSelectionStore.getState().text
    const page = getPages(docId)[current]
    const title = t?.text.trim().slice(0, 80)
    if (!title) return void import('sonner').then(({ toast }) => toast.info('Select some text on the page first'))
    addBookmark(docId, { pageId: t?.pageId ?? page.id, title, y: t?.rects[0]?.y ?? 0 }, sel ?? undefined)
  }
  const toggle = (id: string, collapsed: boolean) => updateBookmark(docId, id, { collapsed: !collapsed }, 'Toggle bookmark')

  return (
    <div className="flex h-full flex-col" data-testid="outline-panel">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addForPage}><Plus className="size-3.5" /> Page</Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addForText}><TextCursorInput className="size-3.5" /> Selected text</Button>
        <div className="ml-auto flex gap-0.5">
          <Button size="icon-sm" variant="ghost" className="size-7" disabled={!sel} onClick={() => sel && moveBookmark(docId, sel, 'up')} aria-label="Move bookmark up"><ArrowUp className="size-3.5" /></Button>
          <Button size="icon-sm" variant="ghost" className="size-7" disabled={!sel} onClick={() => sel && moveBookmark(docId, sel, 'down')} aria-label="Move bookmark down"><ArrowDown className="size-3.5" /></Button>
          <Button size="icon-sm" variant="ghost" className="size-7" disabled={!sel} onClick={() => sel && moveBookmark(docId, sel, 'in')} aria-label="Nest bookmark"><IndentIncrease className="size-3.5" /></Button>
          <Button size="icon-sm" variant="ghost" className="size-7" disabled={!sel} onClick={() => sel && moveBookmark(docId, sel, 'out')} aria-label="Un-nest bookmark"><IndentDecrease className="size-3.5" /></Button>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-1" role="tree" aria-label="Bookmarks">
        {!rows.length && <p className="p-3 text-xs text-muted-foreground">No bookmarks. Add one for the current page or for selected text. Bookmarks are saved into the exported PDF.</p>}
        {rows.map(({ b, depth }) => {
          const idx = pageIndex(b.pageId)
          return (
            <div
              key={b.id}
              role="treeitem"
              aria-selected={sel === b.id}
              aria-expanded={b.children.length ? !b.collapsed : undefined}
              tabIndex={0}
              className={cn('group flex items-center gap-1 rounded px-1 py-1 text-xs hover:bg-accent', sel === b.id && 'bg-accent')}
              style={{ paddingLeft: 4 + depth * 14 }}
              onClick={() => { setSel(b.id); if (idx >= 0) { goToPage(idx); if (b.y > 0) setTimeout(() => revealRect(idx, { x: 0, y: b.y, w: 10, h: 10 }), 30) } }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setSel(b.id); if (idx >= 0) goToPage(idx) } if (e.key === 'F2') setEditing(b.id); if (e.key === 'Delete') deleteBookmark(docId, b.id) }}
              onDoubleClick={() => setEditing(b.id)}
            >
              {b.children.length ? (
                <button type="button" aria-label={b.collapsed ? 'Expand' : 'Collapse'} onClick={(e) => { e.stopPropagation(); toggle(b.id, !!b.collapsed) }} className="rounded p-0.5 hover:bg-background">
                  {b.collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              ) : <span className="w-4" />}
              {editing === b.id ? (
                <Input autoFocus defaultValue={b.title} className="h-6 flex-1 px-1 text-xs" onClick={(e) => e.stopPropagation()} onBlur={(e) => { setEditing(null); if (e.target.value.trim() && e.target.value !== b.title) updateBookmark(docId, b.id, { title: e.target.value.trim() }, 'Rename bookmark') }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }} />
              ) : (
                <span className="flex-1 truncate" title={b.title}>{b.title}</span>
              )}
              <span className="text-[10px] text-muted-foreground">{idx >= 0 ? idx + 1 : '—'}</span>
              <span className="hidden gap-0.5 group-hover:flex group-focus-within:flex">
                <Button size="icon-sm" variant="ghost" className="size-5" aria-label="Set destination to current page" title="Set destination to current page" onClick={(e) => { e.stopPropagation(); updateBookmark(docId, b.id, { pageId: getPages(docId)[current].id, y: 0 }, 'Change bookmark destination') }}><Crosshair className="size-3" /></Button>
                <Button size="icon-sm" variant="ghost" className="size-5" aria-label={`Delete bookmark ${b.title}`} onClick={(e) => { e.stopPropagation(); deleteBookmark(docId, b.id) }}><Trash2 className="size-3" /></Button>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { usePdfStore }
