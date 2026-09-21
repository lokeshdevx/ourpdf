'use client'

import { AlertTriangle, CheckCircle2, CloudOff, Loader2, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/utils/format'
import { useActivePages, useCurrentPageIndex } from '@/stores/page-store'
import { useActiveObjects } from '@/stores/annotation-store'
import { usePdfStore, useActiveDocInfo } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useUiStore } from '@/stores/ui-store'
import { useToolStore } from '@/stores/tool-store'
import { MadeInIndia } from '@/components/made-in-india'

export function StatusBar() {
  const pages = useActivePages()
  const current = useCurrentPageIndex()
  const zoom = useUiStore((s) => s.zoom)
  const tasks = useUiStore((s) => s.tasks)
  const saveState = useUiStore((s) => s.saveState)
  const mem = useUiStore((s) => s.memoryWarning)
  const doc = useActiveDocInfo()
  const objects = useActiveObjects()
  const selected = useSelectionStore((s) => s.objectIds)
  const selPages = useSelectionStore((s) => s.pageIds)
  const text = useSelectionStore((s) => s.text)
  const tool = useToolStore((s) => s.tool)
  const active = usePdfStore((s) => s.activeId)
  const running = tasks.filter((t) => t.status === 'running')
  const failed = tasks.filter((t) => t.status === 'error')
  const selection = selected.length
    ? `${selected.length} object${selected.length > 1 ? 's' : ''} selected (${objects.find((o) => o.id === selected[0])?.type}${selected.length > 1 ? ', …' : ''})`
    : selPages.length
      ? `${selPages.length} page${selPages.length > 1 ? 's' : ''} selected`
      : text
        ? `${text.text.length} characters selected`
        : `Tool: ${tool}`
  return (
    <div className="flex min-h-7 items-center gap-3 overflow-x-auto border-t bg-muted/40 px-3 py-0.5 text-[11px] text-muted-foreground" role="status" aria-live="polite" data-testid="statusbar">
      {active ? (
        <>
          <span data-testid="status-page">Page {current + 1} / {pages.length}</span>
          <span data-testid="status-zoom">Zoom {Math.round(zoom * 100)}%</span>
          <span className="hidden md:inline">{selection}</span>
          {doc && <span className="hidden lg:inline">{doc.name} · {formatBytes(doc.size)}{doc.modified ? ' · modified' : ''}</span>}
        </>
      ) : (
        <span>No document open</span>
      )}
      <div className="ml-auto flex items-center gap-3">
        {running.map((t) => (
          <div key={t.id} className="flex items-center gap-2" data-testid="status-task">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            <span className="max-w-48 truncate">{t.label}</span>
            {t.progress != null && <Progress value={t.progress * 100} className="h-1.5 w-24" aria-label={t.label} />}
            {t.cancel && (
              <Button variant="ghost" size="icon-sm" className="size-5" onClick={t.cancel} aria-label={`Cancel ${t.label}`}>
                <X className="size-3" />
              </Button>
            )}
          </div>
        ))}
        {failed.map((t) => (
          <span key={t.id} className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="size-3" /> {t.label} failed
            {t.retry && <button className="underline" onClick={() => { useUiStore.getState().removeTask(t.id); t.retry?.() }}>Retry</button>}
          </span>
        ))}
        {mem && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title={mem} data-testid="memory-warning">
            <AlertTriangle className="size-3" /> Memory
          </span>
        )}
        {active && (
          <span className="flex items-center gap-1" data-testid="autosave-state">
            {saveState === 'saving' ? <><Loader2 className="size-3 animate-spin" /> Saving…</> : saveState === 'unsaved' ? <><Save className="size-3" /> Unsaved changes</> : saveState === 'error' ? <><CloudOff className="size-3 text-destructive" /> Autosave failed</> : <><CheckCircle2 className="size-3 text-green-600" /> Saved locally</>}
          </span>
        )}
        <MadeInIndia className="border-l pl-3 font-medium text-foreground/80" />
      </div>
    </div>
  )
}
