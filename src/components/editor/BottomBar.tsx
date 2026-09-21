'use client'

import { useState } from 'react'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Fullscreen, LayoutGrid, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { runCommand } from '@/features/commands'
import { goToPage, zoomBy } from '@/services/viewer-bus'
import { targetPageIds } from '@/services/actions'
import { getPageLabelText } from '@/services/page-label'
import { useActivePages, useCurrentPageIndex } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { rotatePages } from '@/services/pdf/page-service'
import type { FitMode, ViewMode } from '@/types'

const ZOOMS = [25, 50, 75, 100, 125, 150, 200, 300, 400]

export function BottomBar() {
  const docId = usePdfStore((s) => s.activeId)
  const pages = useActivePages()
  const current = useCurrentPageIndex()
  const zoom = useUiStore((s) => s.zoom)
  const fit = useUiStore((s) => s.fit)
  const viewMode = useUiStore((s) => s.viewMode)
  const organizer = useUiStore((s) => s.organizer)
  const set = useUiStore((s) => s.set)
  const [draft, setDraft] = useState(String(current + 1))
  const [zoomDraft, setZoomDraft] = useState('')
  const [prevCurrent, setPrevCurrent] = useState(current)
  if (prevCurrent !== current) {
    setPrevCurrent(current)
    setDraft(String(current + 1))
  }
  const total = pages.length
  const disabled = !docId

  const commitPage = () => {
    const n = parseInt(draft, 10)
    if (Number.isFinite(n)) goToPage(Math.min(total, Math.max(1, n)) - 1)
    else setDraft(String(current + 1))
  }
  const rot = (d: number) => docId && rotatePages(docId, targetPageIds(docId), d)
  const label = docId && total ? getPageLabelText(docId, current) : ''

  return (
    <div className="flex items-center gap-1 border-t bg-background px-2 py-1 text-xs" role="toolbar" aria-label="Page and zoom controls" data-testid="bottombar">
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" disabled={disabled || current === 0} onClick={() => goToPage(0)} aria-label="First page"><ChevronFirst className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" disabled={disabled || current === 0} onClick={() => goToPage(current - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={commitPage}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), commitPage())}
          className="h-7 w-12 px-1 text-center text-xs"
          aria-label="Current page"
          disabled={disabled}
          data-testid="page-input"
        />
        <span className="px-1 text-muted-foreground" data-testid="page-total">/ {total || 0}{label && label !== String(current + 1) ? ` (${label})` : ''}</span>
        <Button variant="ghost" size="icon-sm" disabled={disabled || current >= total - 1} onClick={() => goToPage(current + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" disabled={disabled || current >= total - 1} onClick={() => goToPage(total - 1)} aria-label="Last page"><ChevronLast className="size-4" /></Button>
      </div>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" disabled={disabled} onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out"><Minus className="size-4" /></Button>
        <Input
          value={zoomDraft || `${Math.round(zoom * 100)}%`}
          onFocus={(e) => { setZoomDraft(String(Math.round(zoom * 100))); e.currentTarget.select() }}
          onChange={(e) => setZoomDraft(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={() => { const v = parseFloat(zoomDraft); if (Number.isFinite(v) && v >= 10 && v <= 800) set({ fit: 'custom', zoom: v / 100 }); setZoomDraft('') }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-7 w-16 px-1 text-center text-xs"
          aria-label="Zoom percentage (custom zoom)"
          disabled={disabled}
          data-testid="zoom-input"
        />
        <Button variant="ghost" size="icon-sm" disabled={disabled} onClick={() => zoomBy(1.2)} aria-label="Zoom in"><Plus className="size-4" /></Button>
        <Select value={fit === 'custom' ? 'z' : fit} onValueChange={(v) => { if (v === 'z') return; if (['width', 'page', 'height'].includes(v)) set({ fit: v as FitMode }); else set({ fit: 'custom', zoom: Number(v) / 100 }) }} disabled={disabled}>
          <SelectTrigger className="h-7 w-28 text-xs" aria-label="Zoom preset"><SelectValue placeholder="Zoom" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="width">Fit width</SelectItem>
            <SelectItem value="page">Fit page</SelectItem>
            <SelectItem value="height">Fit height</SelectItem>
            {ZOOMS.map((z) => <SelectItem key={z} value={String(z)}>{z}%</SelectItem>)}
            <SelectItem value="z" className="hidden">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
      <div className="hidden items-center gap-0.5 sm:flex">
        <Button variant="ghost" size="icon-sm" disabled={disabled} onClick={() => rot(-90)} aria-label="Rotate counter-clockwise"><RotateCcw className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" disabled={disabled} onClick={() => rot(90)} aria-label="Rotate clockwise"><RotateCw className="size-4" /></Button>
        <Select value={viewMode} onValueChange={(v) => set({ viewMode: v as ViewMode, ...(v !== 'continuous' ? { scrollDir: 'vertical' as const } : {}) })} disabled={disabled}>
          <SelectTrigger className="h-7 w-36 text-xs" aria-label="Page layout"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="continuous">Continuous</SelectItem>
            <SelectItem value="single">Single page</SelectItem>
            <SelectItem value="two">Two pages</SelectItem>
            <SelectItem value="two-cover">Two pages + cover</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <Button variant={organizer ? 'secondary' : 'ghost'} size="icon-sm" disabled={disabled} onClick={() => void runCommand('pages.organizer')} aria-label="Page organizer" aria-pressed={organizer} title="Page organizer"><LayoutGrid className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" onClick={() => void runCommand('view.fullscreen')} aria-label="Full screen"><Fullscreen className="size-4" /></Button>
      </div>
    </div>
  )
}
