'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PdfThumbnail } from '@/components/pdf/PdfThumbnail'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { runCommand } from '@/features/commands'
import { cn } from '@/lib/utils'
import { goToPage } from '@/services/viewer-bus'
import { getPageLabelText } from '@/services/page-label'
import { movePages } from '@/services/pdf/page-service'
import { useActivePages, useCurrentPageIndex } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'

interface Props {
  cellW: number
  cellH: number
  /** Fixed column count; undefined = fit as many as the width allows. */
  columns?: number
  gap?: number
  onOpen?: (index: number) => void
  className?: string
}

/**
 * Virtualised page grid used by the thumbnails sidebar and the page organizer. Supports click / Ctrl / Shift
 * selection and pointer-based drag reordering (works with touch, and with virtualisation because drop targets
 * come from layout math rather than DOM measurements).
 */
export function PageGrid({ cellW, cellH, columns, gap = 10, onOpen, className }: Props) {
  const docId = usePdfStore((s) => s.activeId)!
  const pages = useActivePages()
  const current = useCurrentPageIndex()
  const selected = useSelectionStore((s) => s.pageIds)
  const anchor = useSelectionStore((s) => s.pageAnchor)
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [scrollTop, setScrollTop] = useState(0)
  const [drag, setDrag] = useState<{ ids: string[]; x: number; y: number; over: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const cols = columns ?? Math.max(1, Math.floor((size.w - gap) / (cellW + gap)))
  const rowH = cellH + gap
  const rows = Math.ceil(pages.length / cols)
  const totalH = rows * rowH + gap
  const contentW = cols * (cellW + gap) + gap
  const offsetX = Math.max(0, (size.w - contentW) / 2)
  const first = Math.max(0, Math.floor(scrollTop / rowH) - 1)
  const last = Math.min(rows - 1, Math.ceil((scrollTop + size.h) / rowH) + 1)
  const visible = useMemo(() => {
    const out: number[] = []
    for (let r = first; r <= last; r++) for (let c = 0; c < cols; c++) if (r * cols + c < pages.length) out.push(r * cols + c)
    return out
  }, [first, last, cols, pages.length])

  /* keep the current page in view */
  useEffect(() => {
    const el = ref.current
    if (!el || !size.h) return
    const top = Math.floor(current / cols) * rowH + gap
    if (top < el.scrollTop || top + cellH > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, cols, size.h])

  const select = (e: React.MouseEvent | React.KeyboardEvent, i: number) => {
    const st = useSelectionStore.getState()
    const id = pages[i].id
    if (e.shiftKey && anchor) {
      const a = pages.findIndex((p) => p.id === anchor)
      const [lo, hi] = a < i ? [a, i] : [i, a]
      st.setPages(pages.slice(lo, hi + 1).map((p) => p.id))
    } else if (e.ctrlKey || e.metaKey) st.togglePage(id)
    else st.setPages([id], id)
  }

  const cellPos = useCallback((i: number) => ({ x: offsetX + gap + (i % cols) * (cellW + gap), y: gap + Math.floor(i / cols) * rowH }), [offsetX, gap, cols, cellW, rowH])

  const indexAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current!
      const r = el.getBoundingClientRect()
      const x = clientX - r.left + el.scrollLeft - offsetX
      const y = clientY - r.top + el.scrollTop
      const c = Math.min(cols - 1, Math.max(0, Math.floor(x / (cellW + gap))))
      const row = Math.max(0, Math.floor((y - gap / 2) / rowH))
      // drop before/after depending on the half of the cell
      const within = x - c * (cellW + gap) > cellW / 2 ? 1 : 0
      return Math.min(pages.length, Math.max(0, row * cols + c + within))
    },
    [cols, cellW, gap, rowH, offsetX, pages.length],
  )

  const startDrag = (e: React.PointerEvent, i: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    const startX = e.clientX
    const startY = e.clientY
    const st = useSelectionStore.getState()
    let active = false
    let ids: string[] = []
    const el = ref.current!
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return
        active = true
        const sel = useSelectionStore.getState().pageIds
        ids = sel.includes(pages[i].id) ? pages.filter((p) => sel.includes(p.id)).map((p) => p.id) : [pages[i].id]
        if (!sel.includes(pages[i].id)) st.setPages([pages[i].id], pages[i].id)
      }
      // auto-scroll near the edges
      const r = el.getBoundingClientRect()
      if (ev.clientY < r.top + 40) el.scrollTop -= 14
      else if (ev.clientY > r.bottom - 40) el.scrollTop += 14
      setDrag({ ids, x: ev.clientX, y: ev.clientY, over: indexAt(ev.clientX, ev.clientY) })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (active) {
        const over = indexAt(ev.clientX, ev.clientY)
        // convert "gap index in full list" to "index among the remaining pages"
        const set = new Set(ids)
        const before = pages.slice(0, over).filter((p) => !set.has(p.id)).length
        movePages(docId, ids, before)
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const [menuIndex, setMenuIndex] = useState<number | null>(null)

  return (
    <ContextMenu onOpenChange={(o) => !o && setMenuIndex(null)}>
      <ContextMenuTrigger asChild>
        <div
          ref={ref}
          className={cn('scroll-thin relative h-full overflow-auto', className)}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          onContextMenu={(e) => {
            const cell = (e.target as HTMLElement).closest('[data-page-index]') as HTMLElement | null
            if (cell) {
              const i = Number(cell.dataset.pageIndex)
              setMenuIndex(i)
              if (!useSelectionStore.getState().pageIds.includes(pages[i].id)) useSelectionStore.getState().setPages([pages[i].id], pages[i].id)
            }
          }}
          role="listbox"
          aria-label="Pages"
          aria-multiselectable="true"
          data-testid="page-grid"
        >
          <div style={{ position: 'relative', height: totalH, width: '100%', minWidth: contentW }}>
            {visible.map((i) => {
              const p = pages[i]
              const pos = cellPos(i)
              const isSel = selected.includes(p.id)
              return (
                <div
                  key={p.id}
                  role="option"
                  aria-selected={isSel}
                  aria-label={`Page ${i + 1}`}
                  tabIndex={0}
                  data-page-index={i}
                  data-testid="page-cell"
                  onPointerDown={(e) => startDrag(e, i)}
                  onClick={(e) => {
                    select(e, i)
                    goToPage(i)
                  }}
                  onDoubleClick={() => onOpen?.(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      select(e, i)
                      goToPage(i)
                    }
                    if (e.key === 'Delete') void runCommand('pages.delete')
                  }}
                  className={cn('absolute flex cursor-grab flex-col items-center justify-start rounded-md border bg-card p-1 text-[10px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing', isSel && 'border-primary bg-primary/10 ring-1 ring-primary', i === current && !isSel && 'border-primary/60')}
                  style={{ left: pos.x, top: pos.y, width: cellW, height: cellH, touchAction: 'pan-y' }}
                >
                  <div className="flex min-h-0 flex-1 items-center justify-center" style={{ width: cellW - 8 }}>
                    <PdfThumbnail page={p} boxW={cellW - 10} boxH={cellH - 30} priority={200 + Math.abs(i - current)} />
                  </div>
                  <div className="mt-0.5 flex w-full items-center justify-center gap-1 text-muted-foreground">
                    <span className={cn('font-medium', i === current && 'text-primary')}>{getPageLabelText(docId, i)}</span>
                    {p.rotation !== 0 && <span title="Rotated">↻{p.rotation}°</span>}
                    {p.crop || p.frame ? <span title="Cropped / resized">✂</span> : null}
                  </div>
                </div>
              )
            })}
            {drag && (() => {
              const pos = cellPos(Math.min(drag.over, pages.length - 1))
              const after = drag.over >= pages.length
              const x = after ? pos.x + cellW + gap / 2 : pos.x - gap / 2
              return <div className="pointer-events-none absolute z-20 w-1 rounded bg-primary" style={{ left: x - 2, top: pos.y, height: cellH }} />
            })()}
          </div>
          {drag && <div className="pointer-events-none fixed z-50 rounded-md border bg-primary px-2 py-1 text-xs text-primary-foreground shadow-lg" style={{ left: drag.x + 12, top: drag.y + 12 }}>{drag.ids.length} page{drag.ids.length > 1 ? 's' : ''}</div>}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuIndex !== null && (
          <>
            <ContextMenuItem onSelect={() => { goToPage(menuIndex); onOpen?.(menuIndex) }}>Go to page {menuIndex + 1}</ContextMenuItem>
            <ContextMenuSeparator />
            {['pages.rotateCw', 'pages.rotateCcw', 'pages.duplicate', 'pages.delete', 'pages.copy', 'pages.paste', 'pages.extract', 'pages.moveUp', 'pages.moveDown', 'pages.addBlank'].map((id) => (
              <ContextMenuItem key={id} onSelect={() => void runCommand(id)}>{LABEL[id]}</ContextMenuItem>
            ))}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

const LABEL: Record<string, string> = {
  'pages.rotateCw': 'Rotate clockwise',
  'pages.rotateCcw': 'Rotate counter-clockwise',
  'pages.duplicate': 'Duplicate',
  'pages.delete': 'Delete',
  'pages.copy': 'Copy',
  'pages.paste': 'Paste after',
  'pages.extract': 'Extract…',
  'pages.moveUp': 'Move earlier',
  'pages.moveDown': 'Move later',
  'pages.addBlank': 'Insert blank page after',
}
