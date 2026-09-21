'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { markDirty } from '@/services/history'
import { fitTextObject } from '@/services/pdf/font-fit'
import { useHistoryStore } from '@/stores/history-store'
import { useUiStore } from '@/stores/ui-store'
import { getObjects } from '@/stores/annotation-store'
import { baselineOffset, initMeasurer } from '@/engine/fonts'
import { normRect, pointInRect, rectsIntersect, unionRects } from '@/lib/geometry'
import { createText } from '@/lib/object-factory'
import { TEXT_PAD } from '@/lib/text-object'
import { addObjects } from '@/services/pdf/annotation-service'
import { resolvePdfFont } from '@/services/pdf/pdf-fonts'
import { sampleColors } from '@/services/pdf/sample'
import { getPageText, groupLines, type PageText, type PageTextItem } from '@/services/pdf/text'
import { useAnnotationStore } from '@/stores/annotation-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { DEFAULT_LAYER_ID, type FontChoice, type PageModel, type Pt, type Rect, type TextObj } from '@/types'

interface Props {
  page: PageModel
  zoom: number
  toBase: (cx: number, cy: number) => Pt
  outerRef: RefObject<HTMLDivElement | null>
}

interface Target {
  items: PageTextItem[]
  rect: Rect
  text: string
  /** Baselines (base space y) of the lines, top to bottom. */
  baselines: number[]
  /** Width of the first line as drawn in the PDF. */
  firstLineWidth: number
  firstLine: string
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

function describe(items: PageTextItem[]): Target {
  const lines = groupLines(items)
  const idxs = lines.length ? lines : [items.map((_, i) => i)]
  const parts: string[] = []
  const used: PageTextItem[] = []
  const baselines: number[] = []
  let firstLineWidth = 0
  for (const [li, line] of idxs.entries()) {
    let text = ''
    let prev: PageTextItem | null = null
    for (const i of line) {
      const it = items[i]
      if (prev && it.rect.x - (prev.rect.x + prev.rect.w) > prev.size * 0.12 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' '
      text += it.str
      prev = it
      used.push(it)
    }
    parts.push(text)
    const first = items[line[0]]
    baselines.push(first.rect.y + 0.92 * first.size)
    if (li === 0) firstLineWidth = unionRects(line.map((i) => items[i].rect)).w
  }
  return { items: used, rect: unionRects(used.map((i) => i.rect)), text: parts.join('\n'), baselines, firstLineWidth, firstLine: parts[0] ?? '' }
}

/** The font id that draws most of the characters of the selection. */
function dominantFontId(items: PageTextItem[]): string {
  const counts = new Map<string, number>()
  for (const it of items) counts.set(it.fontId, (counts.get(it.fontId) ?? 0) + it.str.length)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? items[0].fontId
}

/**
 * Edit-existing-text workflow. Clicking a line creates a text object *immediately* that sits exactly on top of the
 * original (same font program, size, colour, spacing, baseline; the original is covered) and selects it, so the
 * Properties panel shows the text and the detected font and everything can be changed there or on the page.
 * If nothing is changed before the selection moves on, the object is removed again.
 * Original content stays under the cover – use Redact to remove it for good.
 */
export function EditTextLayer({ page, zoom, toBase, outerRef }: Props) {
  const docId = usePdfStore((s) => s.activeId)!
  const layerId = useAnnotationStore((s) => s.byDoc[docId]?.activeLayerId ?? DEFAULT_LAYER_ID)
  const objects = useAnnotationStore((s) => s.byDoc[docId]?.objects)
  const editingId = useSelectionStore((s) => s.editingId)
  const [text, setText] = useState<PageText | null>(null)
  const [hover, setHover] = useState<Rect | null>(null)
  const [drag, setDrag] = useState<{ a: Pt; b: Pt } | null>(null)
  const [busy, setBusy] = useState(false)
  const dragging = useRef(false)
  /** The object created by the latest click, kept only while it is still identical to the original text. */
  const fresh = useRef<{ id: string; docId: string; text: string; cmdId: string | undefined } | null>(null)

  useEffect(() => {
    let alive = true
    getPageText(page).then((t) => alive && setText(t)).catch(() => {})
    return () => {
      alive = false
    }
  }, [page])

  const dropIfUntouched = () => {
    const f = fresh.current
    fresh.current = null
    if (!f) return
    const o = getObjects(f.docId).find((x) => x.id === f.id)
    const h = useHistoryStore.getState()
    const last = h.byDoc[f.docId]?.undo.at(-1)
    if (o && o.type === 'text' && o.text === f.text && last && last.id === f.cmdId) {
      h.popUndo(f.docId)?.undo()
      markDirty(f.docId)
    }
  }
  useEffect(() => {
    const unsub = useSelectionStore.subscribe((s, prev) => {
      const f = fresh.current
      if (f && s.objectIds !== prev.objectIds && !s.objectIds.includes(f.id)) dropIfUntouched()
    })
    return () => {
      unsub()
      dropIfUntouched()
    }
  }, [])

  /** An already-edited line under the pointer (its cover hides the original text, so re-edit that object). */
  const editedAt = (p: Pt): TextObj | null => {
    for (const o of [...(objects ?? [])].reverse()) {
      if (o.type !== 'text' || o.pageId !== page.id || !o.fontSwap) continue
      if (pointInRect(p, o.cover?.rect ?? { x: o.x, y: o.y, w: o.w, h: o.h }, 1)) return o
    }
    return null
  }

  const lineAt = (p: Pt): Target | null => {
    if (!text) return null
    const hit = text.items.findIndex((it) => it.str.trim() && pointInRect(p, it.rect, 1.5))
    if (hit < 0) return null
    const lines = groupLines(text.items)
    const line = lines.find((l) => l.includes(hit))
    if (!line) return null
    // contiguous run around the hit (split lines separated by big gaps, e.g. table columns)
    const sorted = line.map((i) => text.items[i])
    const at = sorted.indexOf(text.items[hit])
    let a = at
    let b = at
    while (a > 0 && sorted[a].rect.x - (sorted[a - 1].rect.x + sorted[a - 1].rect.w) < sorted[a].size * 1.4) a--
    while (b < sorted.length - 1 && sorted[b + 1].rect.x - (sorted[b].rect.x + sorted[b].rect.w) < sorted[b].size * 1.4) b++
    return describe(sorted.slice(a, b + 1))
  }

  const begin = async (t: Target) => {
    if (t.items.some((i) => Math.abs(i.angle) > 1)) {
      toast.info('Rotated text can’t be edited in place. Use “Add text” and rotate the box, or Redact the original.')
      return
    }
    setBusy(true)
    try {
      dropIfUntouched()
      const measure = await initMeasurer()
      const { bg, fg } = sampleColors(outerRef.current, page, t.rect)
      const size = Math.round(median(t.items.map((i) => i.size)) * 10) / 10
      const font = await resolvePdfFont(page, dominantFontId(t.items))
      // line height from the real baseline spacing (multi-line selections)
      const gaps = t.baselines.slice(1).map((b, i) => b - t.baselines[i]).filter((g) => g > size * 0.6 && g < size * 3)
      const lineHeight = gaps.length ? Math.round((median(gaps) / size) * 100) / 100 : 1.2
      // letter spacing so the unchanged text has the same width as in the PDF (fine-tuning for the substituted font too)
      const spacing = (c: FontChoice) => {
        const natural = measure(c.font, c.bold, c.italic, size, t.firstLine)
        const ls = (t.firstLineWidth - natural) / Math.max(1, [...t.firstLine].length - 1)
        return Math.abs(ls) > 0.04 && Math.abs(ls) < 1.5 ? Math.round(ls * 100) / 100 : 0
      }
      const home: FontChoice = { ...font.home, letterSpacing: spacing(font.home) }
      const alt: FontChoice = { ...font.alt, letterSpacing: font.alt.font === font.home.font && font.alt.bold === font.home.bold && font.alt.italic === font.home.italic ? home.letterSpacing : spacing(font.alt) }
      const lines = Math.max(1, t.text.split('\n').length)
      const asc = baselineOffset(home.font, size, lineHeight)
      const box: Rect = { x: t.rect.x - TEXT_PAD, y: t.baselines[0] - asc - TEXT_PAD, w: t.rect.w * 1.04 + 2 * TEXT_PAD + 2, h: lines * size * lineHeight + 2 * TEXT_PAD }
      // a little extra above/below so descender/ascender anti-aliasing of the original glyphs never peeks out
      const padY = Math.max(0.5, size * 0.05)
      const cover = { color: bg, rect: { x: t.rect.x - 1, y: t.rect.y - padY, w: t.rect.w + 2, h: t.rect.h + 2 * padY } }
      let obj = createText(page.id, layerId, box, {
        text: t.text, font: home.font, bold: home.bold, italic: home.italic, fontSize: size, lineHeight, letterSpacing: home.letterSpacing, color: fg, cover, noWrap: true,
        fontSwap: { detected: font.detected, kind: font.kind, home, alt },
      } as Partial<TextObj>)
      // the original text must be drawable with the chosen font (the alt font is used for any glyph the home font lacks)
      const fix = await fitTextObject(obj, { sizeToText: false })
      if (fix) obj = { ...obj, ...fix } as TextObj
      addObjects(docId, [obj], 'Edit existing text')
      fresh.current = { id: obj.id, docId, text: obj.text, cmdId: useHistoryStore.getState().byDoc[docId]?.undo.at(-1)?.id }
      const sel = useSelectionStore.getState()
      sel.setObjects([obj.id])
      sel.setEditing(obj.id)
      if (!useUiStore.getState().rightOpen) useUiStore.getState().set({ rightOpen: true })
    } finally {
      setBusy(false)
    }
  }

  const regionTarget = (a: Pt, b: Pt): Target | null => {
    if (!text) return null
    const r = normRect(a[0], a[1], b[0], b[1])
    const items = text.items.filter((it) => it.str.trim() && rectsIntersect(r, it.rect) && pointInRect([it.rect.x + it.rect.w / 2, it.rect.y + it.rect.h / 2], r))
    return items.length ? describe(items) : null
  }

  // while a text object is being typed into, the page must receive the pointer events (caret, selection)
  if (editingId) return null
  const r = drag ? normRect(drag.a[0], drag.a[1], drag.b[0], drag.b[1]) : null
  return (
    <>
      <div
        data-testid="edit-text-layer"
        data-busy={busy || undefined}
        style={{ position: 'absolute', inset: -20000, cursor: busy ? 'progress' : 'text', touchAction: 'none', pointerEvents: 'auto' }}
        onPointerMove={(e) => {
          const p = toBase(e.clientX, e.clientY)
          if (dragging.current && drag) return setDrag({ ...drag, b: p })
          const ex = editedAt(p)
          setHover(ex ? (ex.cover?.rect ?? ex) : (lineAt(p)?.rect ?? null))
        }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          const p = toBase(e.clientX, e.clientY)
          dragging.current = true
          setDrag({ a: p, b: p })
        }}
        onPointerUp={(e) => {
          if (!dragging.current || !drag) return
          dragging.current = false
          const p = toBase(e.clientX, e.clientY)
          const moved = Math.hypot(p[0] - drag.a[0], p[1] - drag.a[1]) * zoom > 8
          setDrag(null)
          setHover(null)
          const ex = moved ? null : editedAt(p)
          if (ex) {
            dropIfUntouched()
            const sel = useSelectionStore.getState()
            sel.setObjects([ex.id])
            sel.setEditing(ex.id)
            return
          }
          const t = moved ? regionTarget(drag.a, p) : lineAt(p)
          if (t) void begin(t)
        }}
      />
      {hover && !drag && <div style={{ position: 'absolute', left: hover.x - 1, top: hover.y - 1, width: hover.w + 2, height: hover.h + 2, outline: '1.5px solid var(--primary)', background: 'rgb(59 130 246 / 0.12)', pointerEvents: 'none' }} />}
      {r && <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, outline: '1px dashed var(--primary)', background: 'rgb(59 130 246 / 0.10)', pointerEvents: 'none' }} />}
    </>
  )
}
