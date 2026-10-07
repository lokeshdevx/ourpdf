'use client'

import { useEffect, useRef } from 'react'
import { baselineOffset } from '@/engine/fonts'
import { cssFontFamily, isCustomFont } from '@/lib/fonts'
import { TEXT_PAD } from '@/lib/text-object'
import { customFontNames } from '@/services/fonts'
import type { Rect, TextObj } from '@/types'

interface Props {
  box: Rect
  initial: string
  style: Pick<TextObj, 'font' | 'fontSize' | 'bold' | 'italic' | 'color' | 'align' | 'lineHeight' | 'letterSpacing' | 'underline' | 'strike'> & { bg?: string | null }
  /** Paint a cover behind the textarea (edit-existing-text flow). */
  cover?: { color: string; rect: Rect } | null
  /** Small label shown above the box (e.g. which font is being used). */
  note?: string
  onCommit: (text: string) => void
  onCancel: () => void
}

/** Floating textarea used while a *new* text object is being typed (nothing is created until committed). */
export function PendingTextEditor({ box, initial, style, cover, note, onCommit, onCancel }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (commit) onCommit(ref.current?.value ?? '')
    else onCancel()
  }
  const base = baselineOffset(style.font, style.fontSize, style.lineHeight)
  void base
  return (
    <>
      {note && (
        <div data-testid="edit-font-note" style={{ position: 'absolute', left: box.x, top: box.y, transform: 'translateY(-100%)', fontSize: 'calc(11px / var(--k, 1))', padding: '1px 5px', background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 3, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 21 }}>
          {note}
        </div>
      )}
      {cover && <div style={{ position: 'absolute', left: cover.rect.x, top: cover.rect.y, width: cover.rect.w, height: cover.rect.h, background: cover.color, pointerEvents: 'none' }} />}
      <textarea
        ref={ref}
        aria-label="Type text"
        defaultValue={initial}
        spellCheck
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') finish(false)
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(true)
        }}
        onBlur={() => finish(true)}
        style={{
          position: 'absolute',
          left: box.x,
          top: box.y,
          width: box.w,
          minHeight: box.h,
          // grows with what you type (Chromium/Safari); never shows scrollbars
          fieldSizing: 'content',
          padding: TEXT_PAD,
          margin: 0,
          border: '1px dashed var(--primary)',
          outline: 'none',
          resize: 'none',
          overflow: 'hidden',
          scrollbarWidth: 'none',
          boxSizing: 'border-box',
          background: cover ? 'transparent' : (style.bg ?? 'rgb(255 255 255 / 0.85)'),
          fontFamily: cssFontFamily(style.font, customFontNames()),
          fontKerning: 'none',
          fontVariantLigatures: 'none',
          fontSize: style.fontSize,
          fontWeight: style.bold && !isCustomFont(style.font) ? 700 : 400,
          fontStyle: style.italic && !isCustomFont(style.font) ? 'italic' : 'normal',
          color: style.color,
          textAlign: style.align === 'justify' ? 'left' : style.align,
          lineHeight: `${style.fontSize * style.lineHeight}px`,
          letterSpacing: style.letterSpacing || undefined,
          textDecoration: [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
          whiteSpace: 'pre-wrap',
          pointerEvents: 'auto',
          zIndex: 20,
        }}
      />
    </>
  )
}
