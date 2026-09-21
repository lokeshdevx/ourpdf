'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { currentMeasure, ObjectView } from './ObjectView'
import { PendingTextEditor } from './PendingTextEditor'
import { hitObject, hitStroke, simplify } from './geometry-utils'
import { inkPath, smoothPath } from '@/lib/shape-paths'
import { createField, createImage, createInk, createLink, createNote, createPointShape, createRedact, createShape, createStamp, createText, uniqueFieldName } from '@/lib/object-factory'
import { normRect } from '@/lib/geometry'
import { TEXT_PAD, layoutTextObject } from '@/lib/text-object'
import { getAssetInfo } from '@/services/assets'
import { addObjects, fieldNames, removeObjects } from '@/services/pdf/annotation-service'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useDraftStore } from '@/stores/draft-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_LAYER_ID, type EditObject, type FieldType, type Pt, type Rect, type TextObj, type ToolId } from '@/types'
import type { PageModel } from '@/types'

interface Props {
  page: PageModel
  zoom: number
  toBase: (cx: number, cy: number) => Pt
  objects: EditObject[]
}

type Draft =
  | { kind: 'box'; a: Pt; b: Pt }
  | { kind: 'ink'; pts: Pt[] }
  | { kind: 'erase'; ids: Set<string> }

const BOX_TOOLS = new Set<ToolId>(['text', 'heading', 'list', 'callout', 'line', 'arrow', 'darrow', 'rect', 'rrect', 'ellipse', 'star', 'cloud', 'stamp', 'image', 'redact', 'link', 'field-text', 'field-checkbox', 'field-radio', 'field-dropdown', 'field-listbox', 'field-button', 'field-date', 'field-signature'])
const INK_TOOLS = new Set<ToolId>(['pen', 'pencil', 'marker', 'brush'])
const POINT_TOOLS = new Set<ToolId>(['polygon', 'path'])

const fieldTypeOf = (t: ToolId): FieldType => t.replace('field-', '') as FieldType

export function CreationLayer({ page, zoom, toBase, objects }: Props) {
  const docId = usePdfStore((s) => s.activeId)!
  const tool = useToolStore((s) => s.tool)
  const opts = useToolStore((s) => s.options)
  const layerId = useAnnotationStore((s) => s.byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID)
  const author = useUiStore((s) => s.author)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [poly, setPoly] = useState<Pt[]>([])
  const [hover, setHover] = useState<Pt | null>(null)
  const [pending, setPending] = useState<{ box: Rect; over: Partial<TextObj> } | null>(null)
  const drawing = useRef(false)

  const finishTool = useCallback((ids: string[]) => {
    const st = useToolStore.getState()
    useSelectionStore.getState().setObjects(ids)
    if (!st.sticky) st.setTool('select')
  }, [])

  const textStyle = useCallback((): Partial<TextObj> => {
    const o = useToolStore.getState().options
    const t = useToolStore.getState().tool
    const base: Partial<TextObj> = { font: o.font, fontSize: o.fontSize, bold: o.bold, italic: o.italic, underline: o.underline, strike: o.strike, color: o.textColor, align: o.align, lineHeight: o.lineHeight, letterSpacing: o.letterSpacing, opacity: o.opacity }
    if (t === 'heading') return { ...base, fontSize: Math.max(o.fontSize, 24), bold: true, heading: 1 }
    if (t === 'list') return { ...base, list: 'bullet' }
    if (t === 'callout') return { ...base, border: { color: o.stroke, width: o.strokeWidth }, bg: '#fffbe6', radius: 4, callout: [0.15, 1.9] }
    return base
  }, [])

  const buildBox = useCallback(
    (t: ToolId, r: Rect, a: Pt, b: Pt): EditObject | null => {
      const o = useToolStore.getState().options
      const line = t === 'line' || t === 'arrow' || t === 'darrow'
      switch (t) {
        case 'rect':
        case 'rrect':
        case 'ellipse':
        case 'star':
        case 'cloud':
          return createShape(page.id, layerId, t, r, { stroke: o.stroke, fill: o.fill, strokeWidth: o.strokeWidth, dash: o.dash, opacity: o.opacity })
        case 'line':
        case 'arrow':
        case 'darrow':
          if (line) {
            const s = createShape(page.id, layerId, t, { x: r.x, y: r.y, w: Math.max(1, r.w), h: Math.max(1, r.h) }, { stroke: o.stroke, strokeWidth: o.strokeWidth, dash: o.dash, opacity: o.opacity })
            s.pts = [[a[0] <= b[0] ? 0 : 1, a[1] <= b[1] ? 0 : 1], [a[0] <= b[0] ? 1 : 0, a[1] <= b[1] ? 1 : 0]]
            return s
          }
          return null
        case 'stamp':
          return createStamp(page.id, layerId, r, { label: o.stampLabel, color: o.stampColor, showDate: o.stampDate, dynamic: o.stampDynamic, opacity: o.opacity })
        case 'redact':
          return createRedact(page.id, layerId, r, { color: o.redactColor, reason: o.redactReason })
        case 'link':
          return createLink(page.id, layerId, r, { kind: 'url', url: o.linkUrl })
        case 'image': {
          if (!o.pendingAssetId) return null
          const info = getAssetInfo(o.pendingAssetId)
          let box = r
          if (info) {
            const k = Math.min(r.w / info.width, r.h / info.height)
            box = { x: r.x, y: r.y, w: info.width * k, h: info.height * k }
          }
          return createImage(page.id, layerId, box, o.pendingAssetId, { role: o.pendingRole, opacity: o.opacity })
        }
        default:
          if (t.startsWith('field-')) {
            const ft = fieldTypeOf(t)
            const f = createField(ft, page.id, layerId, r, {})
            f.fieldName = ft === 'radio' ? uniqueFieldName('radio_group', fieldNames(docId)) : uniqueFieldName(ft, fieldNames(docId))
            return f
          }
          return null
      }
    },
    [docId, layerId, page.id],
  )

  const clickDefaults = (t: ToolId, p: Pt): Rect => {
    const o = useToolStore.getState().options
    switch (t) {
      case 'text':
      case 'heading':
      case 'list':
      case 'callout': {
        const fs = t === 'heading' ? Math.max(o.fontSize, 24) : o.fontSize
        return { x: p[0], y: p[1], w: t === 'callout' ? 200 : 220, h: fs * o.lineHeight + 2 * TEXT_PAD + (t === 'callout' ? 16 : 0) }
      }
      case 'stamp':
        return { x: p[0] - 90, y: p[1] - 27, w: 180, h: 54 }
      case 'redact':
        return { x: p[0], y: p[1], w: 120, h: 18 }
      case 'link':
        return { x: p[0], y: p[1], w: 120, h: 18 }
      case 'image': {
        const info = o.pendingAssetId ? getAssetInfo(o.pendingAssetId) : null
        const w = o.pendingWidth
        return { x: p[0] - w / 2, y: p[1] - (info ? (w * info.height) / info.width : w * 0.6) / 2, w, h: info ? (w * info.height) / info.width : w * 0.6 }
      }
      case 'line':
      case 'arrow':
      case 'darrow':
        return { x: p[0], y: p[1], w: 120, h: 0 }
      case 'rect':
      case 'rrect':
      case 'ellipse':
      case 'star':
      case 'cloud':
        return { x: p[0], y: p[1], w: 110, h: 76 }
      default:
        return { x: p[0], y: p[1], w: 0, h: 0 }
    }
  }

  /* ---------------- pointer handling ---------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const p = toBase(e.clientX, e.clientY)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (tool === 'note') {
      const n = createNote(page.id, layerId, p[0], p[1], { author })
      addObjects(docId, [n], 'Add note')
      finishTool([n.id])
      useUiStore.getState().set({ rightOpen: true })
      return
    }
    if (POINT_TOOLS.has(tool)) {
      if (tool === 'polygon' && poly.length >= 3 && Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]) * zoom < 9) return finishPoly(poly)
      setPoly((pts) => [...pts, p])
      return
    }
    if (INK_TOOLS.has(tool)) {
      drawing.current = true
      setDraft({ kind: 'ink', pts: [p] })
      return
    }
    if (tool === 'eraser') {
      drawing.current = true
      const ids = new Set<string>()
      eraseAt(p, ids)
      setDraft({ kind: 'erase', ids })
      return
    }
    if (BOX_TOOLS.has(tool)) {
      drawing.current = true
      setDraft({ kind: 'box', a: p, b: p })
    }
  }

  const eraseAt = (p: Pt, ids: Set<string>) => {
    const tol = 4 / zoom
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i]
      if (o.locked || !['ink', 'shape', 'markup', 'note', 'stamp'].includes(o.type)) continue
      if (o.type === 'ink' || (o.type === 'shape' && ['line', 'arrow', 'darrow'].includes(o.shape))) {
        if (hitStroke(o, p, tol)) ids.add(o.id)
      } else if (hitObject(o, p, tol)) ids.add(o.id)
    }
    useDraftStore.getState().set(Object.fromEntries([...ids].map((id) => [id, { opacity: 0.2 } as Partial<EditObject>])))
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toBase(e.clientX, e.clientY)
    if (POINT_TOOLS.has(tool)) setHover(p)
    if (!drawing.current || !draft) return
    if (draft.kind === 'box') setDraft({ ...draft, b: p })
    else if (draft.kind === 'ink') {
      const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]
      const add: Pt[] = []
      let last = draft.pts[draft.pts.length - 1]
      for (const ev of events) {
        const q = toBase(ev.clientX, ev.clientY)
        if (Math.hypot(q[0] - last[0], q[1] - last[1]) * zoom >= 1.2) {
          add.push(q)
          last = q
        }
      }
      if (add.length) setDraft({ kind: 'ink', pts: [...draft.pts, ...add] })
    } else if (draft.kind === 'erase') {
      const ids = new Set(draft.ids)
      eraseAt(p, ids)
      setDraft({ kind: 'erase', ids })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing.current || !draft) return
    drawing.current = false
    const p = toBase(e.clientX, e.clientY)
    if (draft.kind === 'erase') {
      useDraftStore.getState().clear()
      if (draft.ids.size) removeObjects(docId, [...draft.ids], 'Erase')
      setDraft(null)
      return
    }
    if (draft.kind === 'ink') {
      const o = useToolStore.getState().options
      let pts = draft.pts
      if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.1, pts[0][1]]]
      pts = simplify(pts, 0.35)
      const width = tool === 'marker' ? Math.max(8, o.strokeWidth * 4) : tool === 'pencil' ? Math.max(0.75, o.strokeWidth * 0.6) : tool === 'brush' ? o.strokeWidth * 2.5 : o.strokeWidth
      const color = tool === 'marker' ? o.highlightColor : o.stroke
      const opacity = tool === 'marker' ? 0.4 : tool === 'pencil' ? Math.min(o.opacity, 0.85) : o.opacity
      const ink = createInk(page.id, layerId, pts, tool as 'pen', color, width, opacity)
      addObjects(docId, [ink], 'Draw')
      setDraft(null)
      if (!useToolStore.getState().sticky && false) useToolStore.getState().setTool('select')
      useSelectionStore.getState().setObjects([])
      return
    }
    // box tools
    const a = draft.a
    const dragged = Math.hypot(p[0] - a[0], p[1] - a[1]) * zoom > 6
    const r = dragged ? normRect(a[0], a[1], p[0], p[1]) : clickDefaults(tool, a)
    setDraft(null)
    if (tool === 'text' || tool === 'heading' || tool === 'list' || tool === 'callout') {
      const fs = (textStyle().fontSize as number) ?? 14
      setPending({ box: { ...r, h: Math.max(r.h, fs * 1.25 + 2 * TEXT_PAD) }, over: textStyle() })
      return
    }
    if (tool === 'image' && !useToolStore.getState().options.pendingAssetId) {
      import('sonner').then(({ toast }) => toast.info('Choose an image first: Insert ▸ Image'))
      useToolStore.getState().setTool('select')
      return
    }
    const obj = buildBox(tool, r, a, p)
    if (!obj) return
    const label = tool.startsWith('field-') ? 'Add form field' : tool === 'image' ? 'Insert image' : `Add ${tool}`
    addObjects(docId, [obj], label)
    finishTool([obj.id])
    if (tool === 'link') useUiStore.getState().openDialog('link', { objectId: obj.id })
    if (tool.startsWith('field-')) useUiStore.getState().set({ formMode: 'edit', rightOpen: true })
    if (tool === 'image') useToolStore.getState().setOptions({ pendingAssetId: null })
  }

  const finishPoly = useCallback(
    (pts: Pt[]) => {
      const o = useToolStore.getState().options
      const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1.5)
      const min = tool === 'polygon' ? 3 : 2
      setPoly([])
      setHover(null)
      if (clean.length < min) return
      const s = createPointShape(page.id, layerId, tool as 'polygon' | 'path', clean, { stroke: o.stroke, fill: tool === 'polygon' ? o.fill : null, strokeWidth: o.strokeWidth, dash: o.dash, opacity: o.opacity })
      addObjects(docId, [s], tool === 'polygon' ? 'Add polygon' : 'Add curve')
      finishTool([s.id])
    },
    [docId, finishTool, layerId, page.id, tool],
  )

  useEffect(() => {
    if (!POINT_TOOLS.has(tool) || !poly.length) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finishPoly(poly)
      if (e.key === 'Escape') {
        setPoly([])
        setHover(null)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [poly, tool, finishPoly])

  const commitPending = (text: string) => {
    const pd = pending
    setPending(null)
    if (!pd || !text.trim()) return
    const o = useToolStore.getState().options
    const draftObj = createText(page.id, layerId, pd.box, { ...pd.over, text })
    // grow the box if the text needs more room
    const { layout } = layoutTextObject(draftObj as TextObj, text, currentMeasure())
    draftObj.h = Math.max(pd.box.h, layout.height + 2 * TEXT_PAD)
    void o
    addObjects(docId, [draftObj], 'Add text')
    finishTool([draftObj.id])
  }

  /* ---------------- preview ---------------- */
  let preview: React.ReactNode = null
  if (draft?.kind === 'box') {
    const r = normRect(draft.a[0], draft.a[1], draft.b[0], draft.b[1])
    const isText = tool === 'text' || tool === 'heading' || tool === 'list' || tool === 'callout'
    const obj = isText ? null : buildBox(tool, r, draft.a, draft.b)
    preview = obj ? (
      <div style={{ opacity: 0.8, pointerEvents: 'none' }}>
        <ObjectView o={obj} page={page} tokens={{ page: 1, total: 1, label: '1', date: new Date(), batesIndex: 0 }} editing={false} interactive={false} onCommitText={() => {}} onFieldChange={() => {}} fillMode={false} />
      </div>
    ) : (
      <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, border: `${1.5 / (zoom * 1)}px dashed var(--primary)`, background: 'rgb(59 130 246 / 0.08)', pointerEvents: 'none' }} />
    )
  } else if (draft?.kind === 'ink') {
    const o = opts
    const marker = tool === 'marker'
    const width = marker ? Math.max(8, o.strokeWidth * 4) : tool === 'pencil' ? Math.max(0.75, o.strokeWidth * 0.6) : tool === 'brush' ? o.strokeWidth * 2.5 : o.strokeWidth
    preview = (
      <svg style={{ position: 'absolute', left: 0, top: 0, width: page.width, height: page.height, overflow: 'visible', pointerEvents: 'none' }}>
        <path d={inkPath(draft.pts)} fill="none" stroke={marker ? o.highlightColor : o.stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={marker ? 0.4 : o.opacity} />
      </svg>
    )
  } else if (POINT_TOOLS.has(tool) && poly.length) {
    const pts = hover ? [...poly, hover] : poly
    const d = tool === 'polygon' ? pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') : smoothPath(pts)
    preview = (
      <svg style={{ position: 'absolute', left: 0, top: 0, width: page.width, height: page.height, overflow: 'visible', pointerEvents: 'none' }}>
        <path d={d} fill={tool === 'polygon' && opts.fill ? `${opts.fill}55` : 'none'} stroke={opts.stroke} strokeWidth={opts.strokeWidth} />
        {poly.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={3 / zoom} fill="#fff" stroke="var(--primary)" strokeWidth={1.2 / zoom} />
        ))}
      </svg>
    )
  }

  const cursor = tool === 'eraser' ? 'cell' : 'crosshair'
  return (
    <>
      <div
        data-testid="creation-layer"
        data-tool={tool}
        style={{ position: 'absolute', inset: -20000, cursor, touchAction: 'none', pointerEvents: 'auto' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drawing.current = false
          setDraft(null)
          useDraftStore.getState().clear()
        }}
        onDoubleClick={(e) => {
          if (POINT_TOOLS.has(tool) && poly.length) {
            e.stopPropagation()
            finishPoly(poly)
          }
        }}
      />
      {preview}
      {pending && (
        <PendingTextEditor
          box={pending.box}
          initial=""
          style={{ font: opts.font, fontSize: (pending.over.fontSize as number) ?? opts.fontSize, bold: (pending.over.bold as boolean) ?? opts.bold, italic: opts.italic, color: opts.textColor, align: opts.align, lineHeight: opts.lineHeight, letterSpacing: opts.letterSpacing, underline: opts.underline, strike: opts.strike, bg: (pending.over.bg as string | null | undefined) ?? null }}
          onCommit={commitPending}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}
