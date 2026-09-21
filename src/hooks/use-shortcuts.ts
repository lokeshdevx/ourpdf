'use client'

import { useEffect } from 'react'
import { buildShortcutMap, runCommand } from '@/features/commands'
import { comboFromEvent, normalizeCombo } from '@/features/shortcuts'
import { handlePasteEvent } from '@/services/clipboard'
import { importFiles } from '@/services/import'
import { updateObjects } from '@/services/pdf/annotation-service'
import { getObjects } from '@/stores/annotation-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useShortcutStore } from '@/stores/shortcut-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore } from '@/stores/ui-store'
import { exitPresentation } from '@/services/view'
import { goToPage } from '@/services/viewer-bus'
import { getCurrentPageIndex } from './page-index'

/** Widgets that consume arrow / Home / End / Enter / Space themselves. */
const WIDGET_ROLES = '[role=slider],[role=spinbutton],[role=combobox],[role=listbox],[role=option],[role=tree],[role=treeitem],[role=menu],[role=menubar],[role=menuitem],[role=tablist],[role=tab],[role=radiogroup],[role=radio]'

const isEditable = (el: EventTarget | null) => {
  const e = el as HTMLElement | null
  if (!e || !e.tagName) return false
  return e.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName) || !!e.closest?.('[role=textbox]')
}
/** Focus is inside a composite widget: plain (unmodified) keys belong to it, Ctrl/Cmd shortcuts still work. */
const inWidget = (el: EventTarget | null) => !!(el as HTMLElement | null)?.closest?.(WIDGET_ROLES)

/** Combos that must keep working even while a text field has focus. */
const ALWAYS = new Set(['mod+s', 'mod+shift+s', 'mod+o', 'mod+p', 'mod+f', 'mod+k', 'mod+w'])
/** Combos left to the browser/native editing (clipboard is handled through the paste event). */
const NATIVE_ONLY = new Set(['mod+v'])

export function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = normalizeCombo(comboFromEvent(e))
      if (!combo) return
      const editable = isEditable(e.target)
      const ui = useUiStore.getState()
      if (ui.dialog && !ALWAYS.has(combo) && combo !== 'escape') return

      if (combo === 'mod+k') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('pdfstudio:palette'))
        return
      }
      if (combo === 'space' && !editable) {
        if (!ui.panning && !ui.dialog && !(e.target as HTMLElement | null)?.closest?.('button,[role="tab"],[role="option"],[role="menuitem"]')) {
          e.preventDefault()
          useUiStore.getState().set({ panning: true })
        }
        return
      }
      if (combo === 'escape' && ui.presentation) {
        void exitPresentation()
        return
      }
      if (editable && !ALWAYS.has(combo)) return
      if (inWidget(e.target) && !combo.includes('mod')) return
      if (NATIVE_ONLY.has(combo)) return

      // arrow-key nudging of selected objects
      if (!editable && /^(shift\+)?arrow(left|right|up|down)$/.test(combo)) {
        const docId = usePdfStore.getState().activeId
        const ids = useSelectionStore.getState().objectIds
        if (docId && ids.length && useToolStore.getState().tool === 'select') {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const dx = combo.endsWith('left') ? -step : combo.endsWith('right') ? step : 0
          const dy = combo.endsWith('up') ? -step : combo.endsWith('down') ? step : 0
          const patches: Record<string, { x: number; y: number }> = {}
          for (const o of getObjects(docId)) if (ids.includes(o.id) && !o.locked && !(o.type === 'field' && o.native)) patches[o.id] = { x: o.x + dx, y: o.y + dy }
          updateObjects(docId, patches, 'Nudge', `nudge:${ids.join()}`)
        }
        return
      }
      // keep browser copy for text selections
      if (combo === 'mod+c' && window.getSelection()?.toString()) return
      if ((combo === 'delete' || combo === 'backspace') && !useSelectionStore.getState().objectIds.length) return
      const id = buildShortcutMap().get(combo === 'backspace' ? 'delete' : combo)
      if (id) {
        e.preventDefault()
        void runCommand(id)
      }
      // presentation-mode navigation
      if (ui.presentation) {
        if (['arrowright', 'arrowdown', 'space'].includes(combo)) goToPage(getCurrentPageIndex() + 1)
        if (['arrowleft', 'arrowup'].includes(combo)) goToPage(getCurrentPageIndex() - 1)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') useUiStore.getState().set({ panning: false })
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return
      const docId = usePdfStore.getState().activeId
      const files = Array.from(e.clipboardData?.files ?? [])
      const pdfs = files.filter((f) => f.type === 'application/pdf')
      if (pdfs.length) {
        e.preventDefault()
        void importFiles(pdfs)
        return
      }
      if (!docId) {
        const images = files.filter((f) => f.type.startsWith('image/'))
        if (images.length) {
          e.preventDefault()
          void importFiles(images)
        }
        return
      }
      void handlePasteEvent(e, docId)
    }
    const onBlur = () => useUiStore.getState().set({ panning: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('paste', onPaste)
    }
  }, [])
  useShortcutStore((s) => s.overrides) // re-bind when the user customises shortcuts
}
