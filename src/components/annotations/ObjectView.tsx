'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import { baselineOffset, spacelessExtra, getMeasurer } from '@/engine/fonts'
import { cssFilter } from '@/lib/image-filters'
import { cssFontFamily, isCustomFont } from '@/lib/fonts'
import { calloutTailPath, dashArray, inkPath, shapeGeometry, squigglePath } from '@/lib/shape-paths'
import { tileOffsets, type TokenContext } from '@/lib/text-layout'
import { displayText, layoutTextObject, TEXT_PAD, type MeasureFn } from '@/lib/text-object'
import { getAssetUrl } from '@/services/assets'
import { customFontNames } from '@/services/fonts'
import { useFormStore } from '@/stores/form-store'
import { useUiStore } from '@/stores/ui-store'
import type { EditObject, FieldObj, ImageObj, MarkupObj, NoteObj, PageModel, RedactObj, StampObj, TextObj, LinkObj } from '@/types'
import { uid } from '@/utils/id'

const fallbackMeasure: MeasureFn = (_f, _b, _i, size, text) => text.length * size * 0.55
export const currentMeasure = (): MeasureFn => {
  const m = getMeasurer()
  return m ?? fallbackMeasure
}

export interface ObjectViewProps {
  o: EditObject
  page: PageModel
  tokens: TokenContext
  editing: boolean
  interactive: boolean
  onCommitText: (id: string, text: string) => void
  /** Called on every keystroke while editing so the Properties panel shows the text as it is typed. */
  onLiveText?: (id: string, text: string) => void
  onFieldChange: (id: string, value: string | boolean) => void
  fillMode: boolean
}

export const ObjectView = memo(function ObjectView(p: ObjectViewProps) {
  const { o } = p
  const style: React.CSSProperties = {
    left: o.x,
    top: o.y,
    width: o.w,
    height: o.h,
    transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined,
    transformOrigin: '50% 50%',
    pointerEvents: p.interactive ? 'auto' : 'none',
  }
  const hitLike = o.type === 'ink' || (o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow' || o.shape === 'darrow' || o.shape === 'path'))
  return (
    <div className={`obj ${p.interactive && !hitLike ? 'obj-hit' : ''}`} data-obj={o.id} data-type={o.type} data-font={o.type === 'text' ? o.font : undefined} style={hitLike ? { ...style, pointerEvents: 'none' } : style}>
      <Body {...p} hitLike={hitLike} />
    </div>
  )
})

function Body(p: ObjectViewProps & { hitLike: boolean }) {
  const { o } = p
  switch (o.type) {
    case 'text':
      return <TextBody {...p} o={o} />
    case 'markup':
      return <MarkupBody o={o} />
    case 'note':
      return <NoteBody o={o} />
    case 'ink':
      return <InkBody o={o} interactive={p.interactive} />
    case 'shape':
      return <ShapeBody o={o} interactive={p.interactive} />
    case 'stamp':
      return <StampBody o={o} tokens={p.tokens} />
    case 'image':
      return <ImageBody o={o} />
    case 'redact':
      return <RedactBody o={o} />
    case 'link':
      return <LinkBody o={o} />
    case 'field':
      return <FieldBody o={o} onChange={p.onFieldChange} fillMode={p.fillMode} />
  }
}

/* ------------------------------------------------------------------ text */

function TextBody({ o, page, tokens, editing, onCommitText, onLiveText }: ObjectViewProps & { o: TextObj }) {
  const ready = useUiStore((s) => s.measurerReady)
  const fontsEpoch = useUiStore((s) => s.fontsEpoch)
  const text = displayText(o, tokens)
  const measure = currentMeasure()
  const family = cssFontFamily(o.font, customFontNames())
  const { layout, fontSize } = useMemo(
    () => layoutTextObject({ ...o, tile: null }, text, measure),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o.text, o.w, o.h, o.font, o.bold, o.italic, o.fontSize, o.lineHeight, o.letterSpacing, o.align, o.list, o.autoFit, text, ready, fontsEpoch],
  )
  const base = baselineOffset(o.font, fontSize, o.lineHeight)
  const spaceFix = spacelessExtra(o.font, fontSize)
  const lineH = fontSize * o.lineHeight
  const common: React.CSSProperties = {
    fontFamily: family,
    // PDF text (and pdf-lib's export) is laid out glyph by glyph: no kerning pairs or ligatures, so the screen matches the file
    fontKerning: 'none',
    fontVariantLigatures: 'none',
    fontSize,
    // an embedded / library face already is one specific weight and style: never ask the browser to synthesise more
    fontWeight: o.bold && !isCustomFont(o.font) ? 700 : 400,
    fontStyle: o.italic && !isCustomFont(o.font) ? 'italic' : 'normal',
    color: o.color,
    letterSpacing: o.letterSpacing || undefined,
    lineHeight: `${lineH}px`,
    whiteSpace: 'pre',
  }
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing) {
      taRef.current?.focus()
      taRef.current?.setSelectionRange(taRef.current.value.length, taRef.current.value.length)
    }
  }, [editing])

  const tail = o.callout ? calloutTailPath(o.w, o.h, o.callout) : null
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o.opacity }}>
      {o.cover && (
        <div style={{ position: 'absolute', left: o.cover.rect.x - o.x, top: o.cover.rect.y - o.y, width: o.cover.rect.w, height: o.cover.rect.h, background: o.cover.color, transform: o.rotation ? `rotate(${-o.rotation}deg)` : undefined }} />
      )}
      {(o.bg || o.border) && (
        <div
          style={{ position: 'absolute', inset: 0, background: o.bg ?? undefined, border: o.border ? `${o.border.width}px solid ${o.border.color}` : undefined, borderRadius: o.radius || undefined, boxSizing: 'border-box' }}
        />
      )}
      {tail && (
        <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }} width={o.w} height={o.h} viewBox={`0 0 ${o.w} ${o.h}`}>
          <path d={tail} fill={o.bg ?? '#fff'} stroke={o.border?.color ?? o.color} strokeWidth={o.border?.width ?? 1} />
        </svg>
      )}
      {editing ? (
        <textarea
          ref={taRef}
          className="editing-textarea"
          defaultValue={o.text}
          spellCheck
          aria-label="Edit text"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onLiveText?.(o.id, e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') onCommitText(o.id, (e.target as HTMLTextAreaElement).value)
          }}
          onBlur={(e) => onCommitText(o.id, e.target.value)}
          style={{
            ...common,
            padding: TEXT_PAD,
            whiteSpace: o.noWrap ? 'pre' : 'pre-wrap',
            // never scrollbars: single-line edits grow with the text instead (field-sizing), wrapped ones are clipped
            overflow: 'hidden',
            ...(o.noWrap ? { width: 'auto', minWidth: '100%', fieldSizing: 'content' } as React.CSSProperties : {}),
            textAlign: o.align === 'justify' ? 'left' : o.align,
            // edited existing text is drawn over its own cover, so the field itself stays see-through
            background: o.cover ? 'transparent' : 'rgb(255 255 255 / 0.9)',
            color: o.color,
            wordSpacing: spaceFix || undefined,
            pointerEvents: 'auto',
          }}
        />
      ) : o.tile ? (
        <TiledText o={o} page={page} text={text} common={common} measure={measure} />
      ) : (
        layout.lines.map((ln, i) => (
          <div key={i}>
            {ln.marker && <span style={{ ...common, position: 'absolute', left: TEXT_PAD + (ln.markerX ?? 0), top: TEXT_PAD + ln.y }}>{ln.marker}</span>}
            <span
              style={{
                ...common,
                position: 'absolute',
                left: TEXT_PAD + ln.x,
                top: TEXT_PAD + ln.y,
                wordSpacing: ln.wordSpacing + spaceFix || undefined,
                textDecoration: [o.underline ? 'underline' : '', o.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
              }}
            >
              {ln.text}
            </span>
          </div>
        ))
      )}
      {o.link && <div title={o.link.url ?? o.link.address ?? 'Link'} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: '#2563eb', opacity: 0.6 }} />}
      {/* visually reference baseline for accessibility */}
      <span className="sr-only">{text}</span>
      <span hidden data-baseline={base} />
    </div>
  )
}

function TiledText({ o, page, text, common, measure }: { o: TextObj; page: PageModel; text: string; common: React.CSSProperties; measure: MeasureFn }) {
  const { layout, fontSize } = layoutTextObject({ ...o, tile: null }, text, measure)
  const tw = layout.width + 2 * TEXT_PAD
  const th = layout.height + 2 * TEXT_PAD
  const offsets = tileOffsets(page.width, page.height, tw, th, o.tile!.gapX, o.tile!.gapY)
  return (
    <div style={{ position: 'absolute', left: -o.x, top: -o.y, width: page.width, height: page.height, overflow: 'hidden', pointerEvents: 'none', transform: o.rotation ? `rotate(${-o.rotation}deg)` : undefined }}>
      {offsets.map(([x, y], i) => (
        <div key={i} style={{ position: 'absolute', left: x, top: y, width: tw, height: th, transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined }}>
          {layout.lines.map((ln, j) => (
            <span key={j} style={{ ...common, fontSize, position: 'absolute', left: TEXT_PAD + ln.x, top: TEXT_PAD + ln.y }}>
              {ln.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- markup */

function MarkupBody({ o }: { o: MarkupObj }) {
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o.opacity, pointerEvents: 'none' }}>
      {o.rects.map((r, i) => {
        const box: React.CSSProperties = { position: 'absolute', left: r.x * o.w, top: r.y * o.h, width: r.w * o.w, height: r.h * o.h }
        if (o.kind === 'highlight') return <div key={i} style={{ ...box, background: o.color, mixBlendMode: 'multiply' }} />
        const h = r.h * o.h
        if (o.kind === 'squiggly') {
          const amp = Math.max(0.8, h * 0.07)
          return (
            <svg key={i} style={{ ...box, overflow: 'visible' }} width={box.width as number} height={box.height as number}>
              <path d={squigglePath(0, h * 0.88, r.w * o.w, amp, amp * 3.2)} fill="none" stroke={o.color} strokeWidth={Math.max(0.6, h * 0.05)} />
            </svg>
          )
        }
        return <div key={i} style={{ ...box, height: 0 }}><div style={{ position: 'absolute', left: 0, width: '100%', top: o.kind === 'underline' ? h * 0.92 : h * 0.62, height: Math.max(0.8, h * 0.07), background: o.color }} /></div>
      })}
      {/* pointer hit areas so markups can be selected */}
      {o.rects.map((r, i) => (
        <div key={`h${i}`} style={{ position: 'absolute', left: r.x * o.w, top: r.y * o.h, width: r.w * o.w, height: r.h * o.h, pointerEvents: 'auto' }} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ note */

function NoteBody({ o }: { o: NoteObj }) {
  return (
    <div title={o.text || 'Empty note'} style={{ position: 'absolute', inset: 0, background: o.color, border: '1px solid #7a6500', borderRadius: 3, boxShadow: '1px 1px 3px rgb(0 0 0 / .3)' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ position: 'absolute', left: 4, right: 4, top: 6 + i * 5, height: 1, background: '#7a6500' }} />
      ))}
      <span className="sr-only">Note: {o.text}</span>
    </div>
  )
}

/* ------------------------------------------------------------------- ink */

function InkBody({ o, interactive }: { o: import('@/types').InkObj; interactive: boolean }) {
  const pts = o.pts.map(([x, y]) => [x * o.w, y * o.h] as [number, number])
  const d = inkPath(pts)
  const marker = o.brush === 'marker'
  return (
    <svg style={{ position: 'absolute', inset: 0, overflow: 'visible' }} width={o.w} height={o.h} viewBox={`0 0 ${o.w} ${o.h}`}>
      <path d={d} fill="none" stroke={o.color} strokeWidth={o.width} strokeLinecap={marker ? 'square' : 'round'} strokeLinejoin="round" opacity={o.opacity} style={{ mixBlendMode: marker ? 'multiply' : undefined }} />
      {interactive && <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(10, o.width + 6)} strokeLinecap="round" style={{ pointerEvents: 'stroke', cursor: 'move' }} data-hit />}
    </svg>
  )
}

/* ----------------------------------------------------------------- shape */

function ShapeBody({ o, interactive }: { o: import('@/types').ShapeObj; interactive: boolean }) {
  const g = shapeGeometry(o)
  const dash = dashArray(o.dash, o.strokeWidth)
  const lineLike = !g.closed
  return (
    <svg style={{ position: 'absolute', inset: 0, overflow: 'visible' }} width={o.w} height={o.h} viewBox={`0 0 ${o.w} ${o.h}`}>
      <path
        d={g.main}
        fill={g.closed && o.fill ? o.fill : 'none'}
        stroke={o.strokeWidth > 0 ? o.stroke : 'none'}
        strokeWidth={o.strokeWidth}
        strokeDasharray={dash?.join(' ')}
        strokeLinecap={o.dash === 'dotted' ? 'round' : 'butt'}
        strokeLinejoin="miter"
        opacity={o.opacity}
      />
      {g.heads.map((h, i) => (
        <path key={i} d={h} fill={o.stroke} stroke={o.stroke} strokeWidth={0.5} opacity={o.opacity} />
      ))}
      {interactive && lineLike && <path d={g.main} fill="none" stroke="transparent" strokeWidth={Math.max(12, o.strokeWidth + 8)} style={{ pointerEvents: 'stroke', cursor: 'move' }} data-hit />}
    </svg>
  )
}

/* ----------------------------------------------------------------- stamp */

function StampBody({ o, tokens }: { o: StampObj; tokens: TokenContext }) {
  const d = tokens.date
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const label = o.dynamic ? o.label.replace(/\{date\}/gi, date).replace(/\{time\}/gi, `${pad(d.getHours())}:${pad(d.getMinutes())}`) : o.label
  const bw = Math.max(1.5, Math.min(o.w, o.h) * 0.05)
  const measure = currentMeasure()
  const textH = o.showDate ? o.h * 0.6 : o.h
  const size = Math.max(4, Math.min(textH * 0.55, (o.w - bw * 6) / Math.max(1, measure('helvetica', true, false, 1, label))))
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o.opacity, color: o.color, border: `${bw}px solid ${o.color}`, borderRadius: Math.min(o.h * 0.18, 10), boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 700, lineHeight: 1, whiteSpace: 'pre', overflow: 'hidden' }}>
      <span style={{ fontSize: size }}>{label}</span>
      {o.showDate && <span style={{ fontSize: Math.max(4, Math.min(o.h * 0.22, size * 0.6)), marginTop: 2 }}>{date}</span>}
    </div>
  )
}

/* ----------------------------------------------------------------- image */

function ImageBody({ o }: { o: ImageObj }) {
  const url = getAssetUrl(o.assetId)
  const crop = o.crop
  const flip = `scale(${o.flipH ? -1 : 1}, ${o.flipV ? -1 : 1})`
  return (
    <>
    {o.cover && <div aria-hidden style={{ position: 'absolute', left: o.cover.rect.x - o.x, top: o.cover.rect.y - o.y, width: o.cover.rect.w, height: o.cover.rect.h, background: o.cover.color, transform: o.rotation ? `rotate(${-o.rotation}deg)` : undefined, pointerEvents: 'none' }} />}
    <div style={{ position: 'absolute', inset: 0, opacity: o.opacity, overflow: 'hidden', transform: flip, pointerEvents: 'none' }}>
      {url ? (
         
        <img
          src={url}
          alt={o.role === 'signature' ? 'Signature' : o.role === 'initials' ? 'Initials' : 'Inserted image'}
          draggable={false}
          style={{
            position: 'absolute',
            left: crop ? `${(-crop.x / crop.w) * 100}%` : 0,
            top: crop ? `${(-crop.y / crop.h) * 100}%` : 0,
            width: crop ? `${100 / crop.w}%` : '100%',
            height: crop ? `${100 / crop.h}%` : '100%',
            maxWidth: 'none',
            filter: cssFilter(o.filters),
            userSelect: 'none',
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">Image missing</div>
      )}
    </div>
    </>
  )
}

/* ---------------------------------------------------------------- redact */

function RedactBody({ o }: { o: RedactObj }) {
  const preview = useUiStore((s) => s.redactPreview)
  return (
    <div
      title={o.reason ? `Redaction: ${o.reason}` : 'Redaction (applied on Apply / export)'}
      style={{ position: 'absolute', inset: 0, background: preview ? o.color : 'rgb(0 0 0 / 0.55)', outline: preview ? 'none' : '1.5px dashed #ef4444', outlineOffset: -1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: Math.min(12, o.h * 0.6), fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 700, overflow: 'hidden' }}
    >
      {preview ? o.overlayText : o.overlayText || (o.h > 12 ? 'REDACT' : '')}
    </div>
  )
}

/* ------------------------------------------------------------------ link */

function LinkBody({ o }: { o: LinkObj }) {
  const label = o.target.kind === 'url' ? o.target.url : o.target.kind === 'email' ? `mailto:${o.target.address}` : `Page link`
  return (
    <div title={label} style={{ position: 'absolute', inset: 0, background: 'rgb(37 99 235 / 0.10)', border: o.border.style === 'none' ? '1px dotted rgb(37 99 235 / 0.7)' : `${o.border.width}px ${o.border.style} ${o.border.color}`, boxSizing: 'border-box' }}>
      <span className="sr-only">Link to {label}</span>
    </div>
  )
}

/* ----------------------------------------------------------------- field */

function FieldBody({ o, onChange, fillMode }: { o: FieldObj; onChange: (id: string, v: string | boolean) => void; fillMode: boolean }) {
  const error = useFormStore((s) => s.errors[o.id])
  const inputStyle: React.CSSProperties = { width: '100%', height: '100%', boxSizing: 'border-box', fontSize: o.fontSize || 11, border: `1px solid ${error ? '#dc2626' : '#64748b'}`, background: 'rgb(239 246 255 / 0.85)', color: '#111', padding: '0 3px', borderRadius: 2, pointerEvents: fillMode ? 'auto' : 'none' }
  const stop = (e: React.PointerEvent) => fillMode && e.stopPropagation()
  const label = o.tooltip || o.fieldName || o.ftype
  let control: React.ReactNode
  switch (o.ftype) {
    case 'text':
    case 'date':
      control = o.multiline ? (
        <textarea aria-label={label} title={label} disabled={o.readOnly} value={String(o.value ?? '')} onChange={(e) => onChange(o.id, e.target.value)} style={{ ...inputStyle, resize: 'none', paddingTop: 2 }} onPointerDown={stop} />
      ) : (
        <input aria-label={label} title={label} type={o.ftype === 'date' ? 'date' : 'text'} disabled={o.readOnly} value={String(o.value ?? '')} onChange={(e) => onChange(o.id, e.target.value)} style={inputStyle} onPointerDown={stop} />
      )
      break
    case 'checkbox':
      control = <input aria-label={label} title={label} type="checkbox" disabled={o.readOnly} checked={o.value === true} onChange={(e) => onChange(o.id, e.target.checked)} style={{ width: '100%', height: '100%', margin: 0, pointerEvents: fillMode ? 'auto' : 'none' }} onPointerDown={stop} />
      break
    case 'radio':
      control = <input aria-label={label} title={label} type="radio" name={`${o.pageId}-${o.fieldName}`} disabled={o.readOnly} checked={o.value === true} onChange={() => onChange(o.id, true)} style={{ width: '100%', height: '100%', margin: 0, pointerEvents: fillMode ? 'auto' : 'none' }} onPointerDown={stop} />
      break
    case 'dropdown':
      control = (
        <select aria-label={label} title={label} disabled={o.readOnly} value={String(o.value ?? '')} onChange={(e) => onChange(o.id, e.target.value)} style={inputStyle} onPointerDown={stop}>
          <option value="" />
          {o.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
      break
    case 'listbox':
      control = (
        <select aria-label={label} title={label} multiple={false} size={Math.max(2, Math.floor(o.h / 16))} disabled={o.readOnly} value={String(o.value ?? '')} onChange={(e) => onChange(o.id, e.target.value)} style={inputStyle} onPointerDown={stop}>
          {o.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
      break
    case 'button':
      control = (
        <button type="button" aria-label={label} title={label} style={{ ...inputStyle, background: 'rgb(226 232 240)', cursor: fillMode ? 'pointer' : 'default', textAlign: 'center' }} onPointerDown={stop} onClick={() => fillMode && document.dispatchEvent(new CustomEvent('pdfstudio:reset-form'))}>
          {o.label}
        </button>
      )
      break
    case 'signature':
      control = (
        <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#475569', borderStyle: 'dashed' }} title={label}>
          Signature field
        </div>
      )
      break
  }
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {control}
      {!fillMode && (
        <div style={{ position: 'absolute', left: 0, top: -12, fontSize: 9, background: '#334155', color: '#fff', padding: '0 3px', borderRadius: 2, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {o.fieldName || o.ftype}
          {o.required ? ' *' : ''}
        </div>
      )}
      {error && <div style={{ position: 'absolute', left: 0, top: '100%', fontSize: 9, color: '#dc2626', background: '#fff', padding: '0 2px', whiteSpace: 'nowrap', zIndex: 5 }}>{error}</div>}
    </div>
  )
}

export function newId() {
  return uid('obj')
}
