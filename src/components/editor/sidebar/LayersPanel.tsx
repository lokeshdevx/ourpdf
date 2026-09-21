'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, MoveRight, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { addLayer, deleteLayer, moveLayer, moveToLayer, updateLayer } from '@/services/pdf/annotation-service'
import { getOcConfig } from '@/services/pdf/renderer'
import { docSourceIds } from '@/services/pdf/document-service'
import { useAnnotationStore, useActiveLayerId, useActiveLayers, useActiveObjects } from '@/stores/annotation-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useUiStore } from '@/stores/ui-store'
import { confirmAction } from '@/stores/confirm-store'
import { cn } from '@/lib/utils'

interface OcGroup {
  sourceId: string
  id: string
  name: string
  visible: boolean
}

export function LayersPanel() {
  const docId = usePdfStore((s) => s.activeId)!
  const layers = useActiveLayers()
  const activeLayer = useActiveLayerId()
  const objects = useActiveObjects()
  const selected = useSelectionStore((s) => s.objectIds)
  const [editing, setEditing] = useState<string | null>(null)
  const [oc, setOc] = useState<OcGroup[]>([])
  const bump = useUiStore((s) => s.bumpRender)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const out: OcGroup[] = []
      for (const sid of docSourceIds(docId)) {
        const cfg = await getOcConfig(sid)
        if (!cfg) continue
        for (const [id, g] of cfg) out.push({ sourceId: sid, id: String(id), name: g.name || `Layer ${id}`, visible: cfg.isVisible(g) })
      }
      if (alive) setOc(out)
    })().catch(() => {})
    return () => {
      alive = false
    }
  }, [docId])

  const toggleOc = async (g: OcGroup) => {
    const cfg = await getOcConfig(g.sourceId)
    if (!cfg) return
    cfg.setVisibility(g.id, !g.visible)
    setOc((list) => list.map((x) => (x === g ? { ...x, visible: !x.visible } : x)))
    bump()
  }

  return (
    <div className="flex h-full flex-col" data-testid="layers-panel">
      <div className="flex items-center gap-1 border-b p-2">
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => addLayer(docId)}><Plus className="size-3.5" /> New layer</Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!selected.length} onClick={() => moveToLayer(docId, selected, activeLayer)} title="Move selected objects to the active layer"><MoveRight className="size-3.5" /> Selection → active</Button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <ul className="p-1" aria-label="Annotation layers">
          {[...layers].reverse().map((l) => {
            const count = objects.filter((o) => o.layerId === l.id).length
            return (
              <li key={l.id} className={cn('group flex items-center gap-1 rounded px-1 py-1.5 text-xs', activeLayer === l.id ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-accent')} onClick={() => useAnnotationStore.getState().setActiveLayer(docId, l.id)}>
                <Button size="icon-sm" variant="ghost" className="size-6" aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} aria-pressed={l.visible} onClick={(e) => { e.stopPropagation(); updateLayer(docId, l.id, { visible: !l.visible }, l.visible ? 'Hide layer' : 'Show layer') }}>
                  {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 text-muted-foreground" />}
                </Button>
                <Button size="icon-sm" variant="ghost" className="size-6" aria-label={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`} aria-pressed={l.locked} onClick={(e) => { e.stopPropagation(); updateLayer(docId, l.id, { locked: !l.locked }, l.locked ? 'Unlock layer' : 'Lock layer') }}>
                  {l.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5 text-muted-foreground" />}
                </Button>
                {editing === l.id ? (
                  <Input autoFocus defaultValue={l.name} className="h-6 flex-1 px-1 text-xs" onClick={(e) => e.stopPropagation()} onBlur={(e) => { setEditing(null); if (e.target.value.trim() && e.target.value !== l.name) updateLayer(docId, l.id, { name: e.target.value.trim() }, 'Rename layer') }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }} />
                ) : (
                  <span className="flex-1 truncate" onDoubleClick={() => setEditing(l.id)} title="Double-click to rename">{l.name}</span>
                )}
                <span className="text-[10px] text-muted-foreground">{count}</span>
                <span className="hidden gap-0.5 group-hover:flex">
                  <Button size="icon-sm" variant="ghost" className="size-5" aria-label="Move layer up" onClick={(e) => { e.stopPropagation(); moveLayer(docId, l.id, 1) }}><ArrowUp className="size-3" /></Button>
                  <Button size="icon-sm" variant="ghost" className="size-5" aria-label="Move layer down" onClick={(e) => { e.stopPropagation(); moveLayer(docId, l.id, -1) }}><ArrowDown className="size-3" /></Button>
                  <Button size="icon-sm" variant="ghost" className="size-5" aria-label={`Delete ${l.name}`} disabled={layers.length <= 1} onClick={async (e) => { e.stopPropagation(); if (!count || (await confirmAction({ title: `Delete “${l.name}”?`, description: `Its ${count} object(s) will be deleted too. You can undo this.`, confirmLabel: 'Delete layer', destructive: true }))) deleteLayer(docId, l.id) }}><Trash2 className="size-3" /></Button>
                </span>
              </li>
            )
          })}
        </ul>
        {oc.length > 0 && (
          <div className="border-t p-2">
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Document layers (view only)</h4>
            <ul>
              {oc.map((g) => (
                <li key={`${g.sourceId}-${g.id}`} className="flex items-center gap-2 py-1 text-xs">
                  <Checkbox checked={g.visible} onCheckedChange={() => void toggleOc(g)} aria-label={`Show ${g.name}`} />
                  <span className="truncate">{g.name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-muted-foreground">Toggles the PDF’s own optional-content layers in the viewer.</p>
          </div>
        )}
      </div>
    </div>
  )
}
