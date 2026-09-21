'use client'

import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { displayToBase, effectiveFrame } from '@/lib/geometry'
import { updateObjects } from '@/services/pdf/annotation-service'
import { getPageLabelText } from '@/services/page-label'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useDraftStore } from '@/stores/draft-store'
import { usePageStore } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSearchStore } from '@/stores/search-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import type { EditObject, Pt } from '@/types'
import { CreationLayer } from './CreationLayer'
import { CropLayer } from './CropLayer'
import { EditTextLayer } from './EditTextLayer'
import { HANDLES, boundsOf, resizeBox, type HandleId } from './geometry-utils'
import { ObjectView } from './ObjectView'
import type { PageModel } from '@/types'

interface Props {
  page: PageModel
  index: number
  zoom: number
  outerRef: RefObject<HTMLDivElement | null>
}

const EMPTY: EditObject[] = []
const CREATION_TOOLS = new Set([
  'text', 'heading', 'list', 'callout', 'note', 'pen', 'pencil', 'marker', 'brush', 'eraser', 'line', 'arrow', 'darrow', 'rect', 'rrect',
  'ellipse', 'polygon', 'star', 'cloud', 'path', 'stamp', 'image', 'redact', 'link', 'field-text', 'field-checkbox', 'field-radio',
  'field-dropdown', 'field-listbox', 'field-button', 'field-date', 'field-signature',
])
const MARKUP_TOOLS = new Set(['highlight', 'underline', 'strike', 'squiggly'])

export function PageOverlay({ page, index, zoom, outerRef }: Props) {
  const docId = usePdfStore((s) => s.activeId)!
  const allObjects = useAnnotationStore((s) => s.byDoc[docId]?.objects ?? EMPTY)
  const layers = useAnnotationStore((s) => s.byDoc[docId]?.layers)
  const selected = useSelectionStore((s) => s.objectIds)
  const editingId = useSelectionStore((s) => s.editingId)
  const tool = useToolStore((s) => s.tool)
  const markupMode = useToolStore((s) => s.options.markupMode)
  const formMode = useUiStore((s) => s.formMode)
  const patches = useDraftStore((s) => s.patches)
  const total = usePageStore((s) => s.byDoc[docId]?.pages.length ?? 0)
  const now = useMemo(() => new Date(), [])

  const layerState = useMemo(() => new Map((layers ?? []).map((l) => [l.id, l])), [layers])
  const pageObjs = useMemo(() => allObjects.filter((o) => o.pageId === page.id && layerState.get(o.layerId)?.visible !== false), [allObjects, page.id, layerState])
  const label = getPageLabelText(docId, index)
  const tokens = useMemo(() => ({ page: index + 1, total, label, date: now, batesIndex: index }), [index, total, label, now])

  const toBase = useCallback(
    (cx: number, cy: number): Pt => {
      const r = outerRef.current!.getBoundingClientRect()
      return displayToBase(page, (cx - r.left) / zoom, (cy - r.top) / zoom)
    },
    [outerRef, page, zoom],
  )

  /* ---------- select / move / resize / rotate ---------- */
  const dragRef = useRef<null | (() => void)>(null)
  useEffect(() => () => dragRef.current?.(), [])

  const startMove = (e: React.PointerEvent, o: EditObject) => {
    if (tool !== 'select' || e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('input,textarea,select,button') && formMode === 'fill' && o.type === 'field') return
    if (target.closest('textarea')) return
    e.stopPropagation()
    const sel = useSelectionStore.getState()
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    let ids = sel.objectIds
    if (!ids.includes(o.id)) {
      ids = additive ? [...ids, o.id] : [o.id]
      sel.setObjects(ids)
    } else if (additive) {
      sel.setObjects(ids.filter((x) => x !== o.id))
      return
    }
    const objs = useAnnotationStore.getState().byDoc[docId]?.objects ?? []
    const lk = new Map((useAnnotationStore.getState().byDoc[docId]?.layers ?? []).map((l) => [l.id, l.locked]))
    const movable = objs.filter((x) => ids.includes(x.id) && !x.locked && !lk.get(x.layerId) && !(x.type === 'field' && x.native))
    if (!movable.length) return
    const start = toBase(e.clientX, e.clientY)
    let moved = false
    const onMove = (ev: PointerEvent) => {
      const p = toBase(ev.clientX, ev.clientY)
      let dx = p[0] - start[0]
      let dy = p[1] - start[1]
      if (!moved && Math.hypot(dx, dy) * zoom < 3) return
      moved = true
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      const patch: Record<string, Partial<EditObject>> = {}
      for (const m of movable) patch[m.id] = { x: m.x + dx, y: m.y + dy }
      useDraftStore.getState().set(patch)
    }
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      dragRef.current = null
      const patch = useDraftStore.getState().patches
      useDraftStore.getState().clear()
      if (moved && Object.keys(patch).length) updateObjects(docId, patch, movable.length > 1 ? 'Move objects' : 'Move object', `move:${movable.map((m) => m.id).join()}`)
    }
    dragRef.current = finish
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const startResize = (e: React.PointerEvent, o: EditObject, handle: HandleId) => {
    e.stopPropagation()
    e.preventDefault()
    const corner = handle.length === 2
    const onMove = (ev: PointerEvent) => {
      const p = toBase(ev.clientX, ev.clientY)
      const keep = ev.shiftKey || (corner && (o.type === 'image' || o.type === 'stamp'))
      const box = resizeBox(o, handle, p, keep, o.type === 'note' ? 24 : 6)
      useDraftStore.getState().set({ [o.id]: box })
    }
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      dragRef.current = null
      const patch = useDraftStore.getState().patches
      useDraftStore.getState().clear()
      if (Object.keys(patch).length) updateObjects(docId, patch, 'Resize object', `resize:${o.id}`)
    }
    dragRef.current = finish
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const startRotate = (e: React.PointerEvent, o: EditObject) => {
    e.stopPropagation()
    e.preventDefault()
    const cx = o.x + o.w / 2
    const cy = o.y + o.h / 2
    const onMove = (ev: PointerEvent) => {
      const p = toBase(ev.clientX, ev.clientY)
      let deg = (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 90
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15
      deg = ((deg % 360) + 360) % 360
      useDraftStore.getState().set({ [o.id]: { rotation: Math.round(deg * 10) / 10 } })
    }
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      dragRef.current = null
      const patch = useDraftStore.getState().patches
      useDraftStore.getState().clear()
      if (Object.keys(patch).length) updateObjects(docId, patch, 'Rotate object', `rotate:${o.id}`)
    }
    dragRef.current = finish
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const commitText = useCallback(
    (id: string, text: string) => {
      useSelectionStore.getState().setEditing(null)
      const cur = useAnnotationStore.getState().byDoc[docId]?.objects.find((o) => o.id === id)
      if (cur && cur.type === 'text' && cur.text !== text) updateObjects(docId, { [id]: { text } }, 'Edit text', `text:${id}`)
    },
    [docId],
  )
  const liveText = useCallback(
    (id: string, text: string) => {
      const cur = useAnnotationStore.getState().byDoc[docId]?.objects.find((o) => o.id === id)
      if (cur && cur.type === 'text' && cur.text !== text) updateObjects(docId, { [id]: { text } }, 'Edit text', `text:${id}`)
    },
    [docId],
  )
  const onFieldChange = useCallback(
    (id: string, value: string | boolean) => {
      const objs = useAnnotationStore.getState().byDoc[docId]?.objects ?? []
      const f = objs.find((o) => o.id === id)
      if (!f || f.type !== 'field') return
      const patches: Record<string, Partial<EditObject>> = { [id]: { value } }
      // radio buttons share a group: selecting one deselects the others
      if (f.ftype === 'radio' && value === true) for (const o of objs) if (o.type === 'field' && o.ftype === 'radio' && o.fieldName === f.fieldName && o.id !== id && o.value === true) patches[o.id] = { value: false }
      updateObjects(docId, patches, 'Fill form field', `field:${id}`)
      import('@/services/pdf/form-service').then((m) => m.validateField(docId, id, value))
    },
    [docId],
  )

  const layerLocked = (o: EditObject) => layerState.get(o.layerId)?.locked
  const interactiveTool = tool === 'select'
  const selectedHere = pageObjs.filter((o) => selected.includes(o.id))
  const singleSel = selectedHere.length === 1 && selected.length === 1 ? selectedHere[0] : null
  const frame = effectiveFrame(page)
  void frame

  return (
    <>
      <SearchHighlights pageId={page.id} />
      {pageObjs.map((raw) => {
        const o = patches[raw.id] ? ({ ...raw, ...patches[raw.id] } as EditObject) : raw
        const isEditing = editingId === o.id
        const canInteract = interactiveTool && !layerLocked(o) && !(o.type === 'text' && o.decoration && false)
        return (
          <div
            key={o.id}
            onPointerDown={(e) => startMove(e, o)}
            onDoubleClick={(e) => {
              if (tool !== 'select' || layerLocked(o) || o.locked) return
              e.stopPropagation()
              if (o.type === 'text') useSelectionStore.getState().setEditing(o.id)
              if (o.type === 'link') useUiStore.getState().openDialog('link', { objectId: o.id })
              if (o.type === 'note') useUiStore.getState().set({ rightOpen: true })
            }}
            style={{ display: 'contents' }}
          >
            <ObjectView o={o} page={page} tokens={tokens} editing={isEditing} interactive={canInteract} onCommitText={commitText} onLiveText={liveText} onFieldChange={onFieldChange} fillMode={formMode === 'fill' && tool === 'select'} />
          </div>
        )
      })}

      {/* selection chrome */}
      {selectedHere.map((raw) => {
        const o = patches[raw.id] ? ({ ...raw, ...patches[raw.id] } as EditObject) : raw
        const locked = o.locked || layerLocked(o) || (o.type === 'field' && o.native)
        const showHandles = singleSel?.id === o.id && !locked && editingId !== o.id && tool === 'select'
        return (
          <div key={`sel-${o.id}`} style={{ position: 'absolute', left: o.x, top: o.y, width: o.w, height: o.h, transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined, pointerEvents: 'none' }}>
            <div className={`sel-outline ${locked ? 'locked' : ''}`} />
            {showHandles && (
              <>
                {HANDLES.map((h) => (
                  <div key={h.id} className="sel-handle" data-handle={h.id} style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, cursor: h.cursor, pointerEvents: 'auto' }} onPointerDown={(e) => startResize(e, o, h.id)} />
                ))}
                <div className="sel-rotate" data-handle="rotate" style={{ left: '50%', top: `calc(-26px / var(--k, 1))`, pointerEvents: 'auto' }} onPointerDown={(e) => startRotate(e, o)} title="Rotate (hold Shift to snap)" />
                <div style={{ position: 'absolute', left: '50%', top: `calc(-20px / var(--k, 1))`, width: `calc(1.5px / var(--k, 1))`, height: `calc(20px / var(--k, 1))`, background: 'var(--primary)' }} />
              </>
            )}
          </div>
        )
      })}
      {selectedHere.length > 1 && (() => {
        const b = boundsOf(selectedHere)
        return <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, outline: 'calc(1px / var(--k, 1)) dashed var(--primary)', pointerEvents: 'none' }} />
      })()}

      {CREATION_TOOLS.has(tool) && <CreationLayer key={tool} page={page} zoom={zoom} toBase={toBase} objects={pageObjs} />}
      {tool === 'edit-text' && <EditTextLayer page={page} zoom={zoom} toBase={toBase} outerRef={outerRef} />}
      {tool === 'crop' && <CropLayer page={page} zoom={zoom} toBase={toBase} />}
      {MARKUP_TOOLS.has(tool) && <MarkupCapture page={page} zoom={zoom} toBase={toBase} area={markupMode === 'area'} outerRef={outerRef} />}
    </>
  )
}

/* ------------------------------------------------------------ search hits */

function SearchHighlights({ pageId }: { pageId: string }) {
  const hits = useSearchStore((s) => s.hits)
  const current = useSearchStore((s) => s.current)
  const mine = useMemo(() => hits.map((h, i) => ({ h, i })).filter((x) => x.h.pageId === pageId), [hits, pageId])
  if (!mine.length) return null
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} data-testid="search-highlights">
      {mine.flatMap(({ h, i }) =>
        h.rects.map((r, j) => (
          <div key={`${i}-${j}`} data-current={i === current ? 'true' : undefined} style={{ position: 'absolute', left: r.x - 1, top: r.y - 1, width: r.w + 2, height: r.h + 2, background: i === current ? 'rgb(255 140 0 / 0.5)' : 'rgb(255 230 0 / 0.42)', outline: i === current ? '1.5px solid rgb(255 110 0)' : undefined, borderRadius: 2, mixBlendMode: 'multiply' }} />
        )),
      )}
    </div>
  )
}

import { MarkupCapture } from './MarkupCapture'
