import type { LucideIcon } from 'lucide-react'
import {
  AlignJustify, ArrowDownUp, ArrowLeftRight, ArrowRight, ArrowUpToLine, Bold, BookOpen, Brush, Calendar, CalendarDays, CheckSquare, ChevronDownSquare, CircleDot, Circle, Cloud, Combine, Copy, Crop, Droplets,
  Eraser, FileCode, FileImage, FileMinus, FilePlus2, FileSignature, FileText, FileUp, FlipHorizontal2, FlipVertical2, FormInput, Fullscreen, Hand, Highlighter, ImageIcon, ImagePlus, Info, Italic,
  Keyboard, Layers, LayoutGrid, Link2, List, ListChecks, Lock, LockOpen, MessageSquareText, Minus, Monitor, MousePointer2, MousePointerClick, Moon, PenLine, PenTool, Pencil, Presentation,
  Printer, Redo2, Replace, RotateCcw, RotateCw, Save, ScanText, Scissors, Search, ShieldCheck, ShieldOff, Split, Square, SquareDashedMousePointer, Squircle, Star, Stamp, StickyNote, Strikethrough, Sun,
  Trash2, Type, Underline, Undo2, Waves, ZoomIn, ZoomOut, Pentagon, PanelLeft, PanelRight, Contrast, Download, FolderOpen, Settings2, Minimize2, RectangleHorizontal, Heading1, Clipboard, Eye,
  Table2, ScissorsLineDashed, Files, MoveVertical, Ruler, FileLock2, FileX, Eraser as EraserIcon, BookmarkPlus, SplitSquareVertical, ArrowUpDown, Baseline, SquareStack,
} from 'lucide-react'
import { toast } from 'sonner'
import { themeBridge } from './theme-bridge'
import { COMMAND_HELP } from './command-help'
import { comboFromEvent, normalizeCombo } from './shortcuts'
import { useShortcutStore } from '@/stores/shortcut-store'
import { redo, undo } from '@/services/history'
import * as actions from '@/services/actions'
import { importFromClipboard, openFileDialog, pickFiles, importFiles } from '@/services/import'
import { copyObjects, cutObjects, hasObjectClipboard, pasteObjects } from '@/services/clipboard'
import { armImage, flipSelected, insertImageFromFile, insertQuickText, lockSelected, replaceSelectedImage, rotateSelected } from '@/services/insert'
import { addBlankPage, copyPages, deletePages, duplicatePages, hasPageClipboard, movePages, pastePages, resetRotation, reversePages, rotatePages, sortPages } from '@/services/pdf/page-service'
import { addObjects, duplicateObjects, patchObjects, reorderObjects, removeObjects } from '@/services/pdf/annotation-service'
import { goToPage, zoomBy } from '@/services/viewer-bus'
import { enterPresentation, exitPresentation, toggleFullscreen } from '@/services/view'
import { getObjects } from '@/stores/annotation-store'
import { getPages, usePageStore } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useHistoryStore } from '@/stores/history-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useToolStore } from '@/stores/tool-store'
import { useUiStore, type DialogId, type LeftTab } from '@/stores/ui-store'
import type { EditObject, TextObj, ToolId } from '@/types'
import { clearOcr } from '@/services/ocr/ocr-service'
import { applyRedactions, flattenAnnotations } from '@/services/actions'
import { importProjectFile, exportProjectFile } from '@/services/storage/projects'
import { saveBlob } from '@/services/download'
import { getDoc } from '@/stores/pdf-store'
import { runTask } from '@/services/tasks'
import { stripExtension } from '@/utils/file'

export type Category =
  | 'PDF' | 'Pages' | 'Edit' | 'Annotate' | 'Images' | 'Text' | 'Forms' | 'Sign' | 'Security' | 'OCR'
  | 'Convert' | 'Optimize' | 'Watermark' | 'Headers' | 'Footers' | 'View' | 'Help'

export interface Command {
  id: string
  title: string
  category: Category
  keywords?: string[]
  shortcut?: string
  icon?: LucideIcon
  run: () => void | Promise<void>
  /** Needs an open document. Default true except for `global` commands. */
  global?: boolean
  enabled?: () => boolean
  /** Shown as checked in menus (toggles / active tool). */
  checked?: () => boolean
  /** Honest limitation note shown in the palette and help. */
  note?: string
}

/* ---------------------------------------------------------------- helpers */
const docId = () => usePdfStore.getState().activeId
const withDoc = (fn: (id: string) => unknown) => (): void | Promise<void> => {
  const id = docId()
  if (!id) {
    toast.info('Open a PDF first')
    return
  }
  const r = fn(id)
  return r instanceof Promise ? r.then(() => undefined) : undefined
}
const dialog = (id: DialogId) => () => useUiStore.getState().openDialog(id)
const tool = (t: ToolId) => () => useToolStore.getState().setTool(t)
const toolChecked = (t: ToolId) => () => useToolStore.getState().tool === t
const curIndex = (id: string) => usePageStore.getState().byDoc[id]?.current ?? 0
const targetIds = (id: string) => actions.targetPageIds(id)
const selObjs = (id: string): EditObject[] => {
  const ids = useSelectionStore.getState().objectIds
  return getObjects(id).filter((o) => ids.includes(o.id))
}
const hasSelection = () => useSelectionStore.getState().objectIds.length > 0

/** Toggles a text-style flag on selected text objects, or on the tool defaults when none are selected. */
function toggleTextStyle(key: 'bold' | 'italic' | 'underline' | 'strike') {
  const id = docId()
  const texts = id ? (selObjs(id).filter((o) => o.type === 'text') as TextObj[]) : []
  if (id && texts.length) {
    const on = !texts.every((t) => t[key])
    patchObjects(id, texts.map((t) => t.id), { [key]: on } as Partial<TextObj>, `Text ${key}`)
  } else {
    const st = useToolStore.getState()
    st.setOptions({ [key]: !st.options[key] })
  }
}

const rotateTargets = (delta: number) =>
  withDoc((id) => {
    const t = targetIds(id)
    if (t.length) rotatePages(id, t, delta)
  })

/* ---------------------------------------------------------------- registry */
export const COMMANDS: Command[] = [
  /* ---- PDF ---- */
  { id: 'file.open', title: 'Open…', category: 'PDF', shortcut: 'mod+o', icon: FolderOpen, global: true, keywords: ['import', 'file'], run: () => openFileDialog() },
  { id: 'file.openClipboard', title: 'Import from clipboard', category: 'PDF', icon: Clipboard, global: true, keywords: ['paste'], run: () => importFromClipboard() },
  { id: 'file.new', title: 'Create new PDF…', category: 'PDF', icon: FilePlus2, global: true, keywords: ['blank', 'scratch', 'generate'], run: dialog('newPdf') },
  { id: 'file.importImages', title: 'Import images → PDF…', category: 'PDF', icon: ImagePlus, global: true, keywords: ['jpg', 'png', 'photos'], run: dialog('imagesToPdf') },
  { id: 'file.save', title: 'Save (download PDF)', category: 'PDF', shortcut: 'mod+s', icon: Save, keywords: ['download', 'export'], run: withDoc((id) => void actions.saveDocument(id)) },
  { id: 'file.saveAs', title: 'Save As…', category: 'PDF', shortcut: 'mod+shift+s', icon: Save, run: withDoc((id) => void actions.saveDocument(id, { saveAs: true })) },
  { id: 'file.saveAll', title: 'Save all documents', category: 'PDF', icon: Save, run: () => void actions.saveAll() },
  { id: 'file.export', title: 'Export…', category: 'PDF', icon: Download, keywords: ['download', 'pages', 'selected'], run: withDoc(dialog('export')) },
  { id: 'file.print', title: 'Print…', category: 'PDF', shortcut: 'mod+p', icon: Printer, keywords: ['preview'], run: withDoc(dialog('print')) },
  { id: 'file.merge', title: 'Merge PDFs…', category: 'PDF', icon: Combine, global: true, keywords: ['combine', 'join'], run: dialog('merge') },
  { id: 'file.projects', title: 'Local projects…', category: 'PDF', icon: Files, global: true, keywords: ['restore', 'history', 'autosave', 'versions'], run: dialog('projects') },
  { id: 'file.exportProject', title: 'Export project file', category: 'PDF', icon: FileUp, keywords: ['backup'], run: withDoc((id) => void runTask('Exporting project', async () => { const blob = await exportProjectFile(id); await saveBlob(blob, `${stripExtension(getDoc(id)?.name ?? 'project')}.ourpdf`) })) },
  {
    id: 'file.importProject', title: 'Import project file…', category: 'PDF', icon: FileUp, global: true, keywords: ['restore', 'pdfstudio'],
    run: async () => {
      const f = (await pickFiles({ accept: '.ourpdf,.pdfstudio,.zip', multiple: false }))[0]
      if (!f) return
      await runTask('Importing project', async () => {
        const id = await importProjectFile(f)
        const { openProject } = await import('@/services/storage/projects')
        await openProject(id)
      })
    },
  },
  { id: 'file.metadata', title: 'Document properties & metadata…', category: 'PDF', icon: Info, keywords: ['title', 'author', 'subject', 'keywords'], run: withDoc(dialog('metadata')) },
  { id: 'file.close', title: 'Close document', category: 'PDF', shortcut: 'mod+w', icon: FileX, run: withDoc((id) => void actions.closeDocumentInteractive(id)) },
  { id: 'file.closeOthers', title: 'Close other documents', category: 'PDF', run: withDoc((id) => void actions.closeOthers(id)) },
  { id: 'file.closeAll', title: 'Close all documents', category: 'PDF', run: () => void actions.closeAll() },

  /* ---- Edit ---- */
  { id: 'edit.undo', title: 'Undo', category: 'Edit', shortcut: 'mod+z', icon: Undo2, run: withDoc((id) => { const l = undo(id); if (l) toast(`Undid: ${l}`); }) },
  { id: 'edit.redo', title: 'Redo', category: 'Edit', shortcut: 'mod+shift+z', icon: Redo2, run: withDoc((id) => { const l = redo(id); if (l) toast(`Redid: ${l}`) }) },
  { id: 'edit.redo2', title: 'Redo (alternate)', category: 'Edit', shortcut: 'mod+y', icon: Redo2, run: withDoc((id) => void redo(id)) },
  { id: 'edit.cut', title: 'Cut', category: 'Edit', shortcut: 'mod+x', icon: Scissors, enabled: hasSelection, run: withDoc((id) => void cutObjects(id, useSelectionStore.getState().objectIds)) },
  { id: 'edit.copy', title: 'Copy', category: 'Edit', shortcut: 'mod+c', icon: Copy, run: withDoc((id) => {
      const sel = window.getSelection()?.toString()
      if (sel) return void navigator.clipboard?.writeText(sel).then(() => toast.success('Text copied'))
      const n = copyObjects(id, useSelectionStore.getState().objectIds)
      if (n) toast.success(`Copied ${n} object${n > 1 ? 's' : ''}`)
    }) },
  { id: 'edit.paste', title: 'Paste', category: 'Edit', shortcut: 'mod+v', icon: Clipboard, run: withDoc((id) => { if (hasObjectClipboard()) pasteObjects(id); else toast.info('Nothing to paste. Copy an object first, or press Ctrl/Cmd+V to paste an image or text from the system clipboard.') }) },
  { id: 'edit.delete', title: 'Delete selected', category: 'Edit', shortcut: 'delete', icon: Trash2, enabled: hasSelection, run: withDoc((id) => removeObjects(id, useSelectionStore.getState().objectIds)) },
  { id: 'edit.duplicate', title: 'Duplicate selected', category: 'Edit', shortcut: 'mod+d', icon: Copy, enabled: hasSelection, run: withDoc((id) => { const c = duplicateObjects(id, useSelectionStore.getState().objectIds); useSelectionStore.getState().setObjects(c.map((o) => o.id)) }) },
  { id: 'edit.selectAll', title: 'Select all objects on page', category: 'Edit', shortcut: 'mod+a', icon: SquareDashedMousePointer, run: withDoc((id) => { const p = getPages(id)[curIndex(id)]; useSelectionStore.getState().setObjects(getObjects(id).filter((o) => o.pageId === p?.id).map((o) => o.id)) }) },
  { id: 'edit.find', title: 'Find…', category: 'Edit', shortcut: 'mod+f', icon: Search, keywords: ['search'], run: () => { useUiStore.getState().set({ leftOpen: true, leftTab: 'search' }); setTimeout(() => document.getElementById('search-input')?.focus(), 50) } },
  { id: 'edit.replace', title: 'Find & replace…', category: 'Edit', icon: Replace, keywords: ['substitute'], run: withDoc(dialog('replace')), note: 'Replacement is overlaid on the page; the original text stays underneath. Use Redact to remove it.' },
  { id: 'edit.front', title: 'Bring to front', category: 'Edit', icon: ArrowUpToLine, keywords: ['order', 'z'], enabled: hasSelection, run: withDoc((id) => reorderObjects(id, useSelectionStore.getState().objectIds, 'front')) },
  { id: 'edit.forward', title: 'Bring forward', category: 'Edit', shortcut: 'mod+]', icon: ArrowUpDown, enabled: hasSelection, run: withDoc((id) => reorderObjects(id, useSelectionStore.getState().objectIds, 'forward')) },
  { id: 'edit.backward', title: 'Send backward', category: 'Edit', shortcut: 'mod+[', icon: ArrowUpDown, enabled: hasSelection, run: withDoc((id) => reorderObjects(id, useSelectionStore.getState().objectIds, 'backward')) },
  { id: 'edit.back', title: 'Send to back', category: 'Edit', icon: SquareStack, enabled: hasSelection, run: withDoc((id) => reorderObjects(id, useSelectionStore.getState().objectIds, 'back')) },
  { id: 'edit.lock', title: 'Lock selected', category: 'Edit', icon: Lock, enabled: hasSelection, run: () => lockSelected(true) },
  { id: 'edit.unlock', title: 'Unlock selected', category: 'Edit', icon: LockOpen, enabled: hasSelection, run: () => lockSelected(false) },
  { id: 'edit.clearHistory', title: 'Clear undo history', category: 'Edit', run: withDoc((id) => { useHistoryStore.getState().clear(id); toast.success('History cleared') }) },
  { id: 'edit.cancel', title: 'Cancel tool / deselect', category: 'Edit', shortcut: 'escape', run: () => { useToolStore.getState().setTool('select'); useSelectionStore.getState().clear(); useUiStore.getState().set({ cropDraft: null }); window.getSelection()?.removeAllRanges() } },

  /* ---- Annotate (tools) ---- */
  ...([
    ['select', 'Select tool', MousePointer2, 'v', ['pointer', 'move']],
    ['hand', 'Hand / pan tool', Hand, 'h', ['pan', 'scroll', 'drag']],
    ['highlight', 'Highlight text', Highlighter, undefined, ['mark', 'yellow']],
    ['underline', 'Underline text', Underline, undefined, []],
    ['strike', 'Strikeout text', Strikethrough, undefined, ['strikethrough', 'cross out']],
    ['squiggly', 'Squiggly underline', Waves, undefined, ['wavy']],
    ['note', 'Sticky note', StickyNote, undefined, ['comment', 'text annotation']],
    ['pen', 'Pen (freehand)', PenLine, undefined, ['draw', 'ink']],
    ['pencil', 'Pencil', Pencil, undefined, ['draw', 'sketch']],
    ['marker', 'Marker', Highlighter, undefined, ['thick']],
    ['brush', 'Brush', Brush, undefined, ['paint']],
    ['eraser', 'Eraser', Eraser, undefined, ['remove stroke']],
    ['line', 'Line', Minus, undefined, []],
    ['arrow', 'Arrow', ArrowRight, undefined, []],
    ['darrow', 'Double arrow', ArrowLeftRight, undefined, []],
    ['rect', 'Rectangle', Square, undefined, ['box']],
    ['rrect', 'Rounded rectangle', Squircle, undefined, []],
    ['ellipse', 'Ellipse', Circle, undefined, ['oval', 'circle']],
    ['polygon', 'Polygon', Pentagon, undefined, []],
    ['star', 'Star', Star, undefined, []],
    ['cloud', 'Cloud (revision cloud)', Cloud, undefined, ['revision']],
    ['path', 'Bézier curve / path', PenTool, undefined, ['curve', 'spline']],
    ['callout', 'Callout', MessageSquareText, undefined, ['speech', 'text box']],
    ['stamp', 'Stamp', Stamp, undefined, ['approved', 'rejected', 'draft', 'confidential', 'date stamp', 'dynamic']],
  ] as [ToolId, string, LucideIcon, string | undefined, string[]][]).map(([t, title, icon, shortcut, keywords]): Command => ({
    id: `tool.${t}`, title, category: t === 'select' || t === 'hand' ? 'Edit' : 'Annotate', icon, shortcut, keywords, checked: toolChecked(t),
    run: tool(t),
  })),
  { id: 'annotate.markupArea', title: 'Markup: text / area mode', category: 'Annotate', keywords: ['highlight scanned'], run: () => { const s = useToolStore.getState(); s.setOptions({ markupMode: s.options.markupMode === 'text' ? 'area' : 'text' }) }, note: 'Area mode marks a dragged rectangle – useful on scanned pages without a text layer.' },
  { id: 'annotate.customStamp', title: 'Custom stamp from image…', category: 'Annotate', icon: Stamp, keywords: ['stamp', 'logo'], run: withDoc(async () => { const f = (await pickFiles({ accept: 'image/*', multiple: false }))[0]; if (!f) return; const { importImageAsset } = await import('@/services/pdf/image-service'); armImage((await importImageAsset(f, f.name)).id, 'stamp', 160) }) },
  { id: 'annotate.dateStamp', title: 'Date stamp', category: 'Annotate', icon: CalendarDays, run: () => { useToolStore.getState().setOptions({ stampLabel: 'DATE', stampDate: true, stampDynamic: false, stampColor: '#0f766e' }); useToolStore.getState().setTool('stamp') } },
  { id: 'annotate.stampDialog', title: 'Choose stamp…', category: 'Annotate', icon: Stamp, run: withDoc(dialog('stamp')) },
  { id: 'annotate.link', title: 'Create link…', category: 'Text', icon: Link2, keywords: ['url', 'hyperlink', 'email', 'internal page', 'target'], checked: toolChecked('link'), run: tool('link') },
  { id: 'annotate.editLink', title: 'Edit link', category: 'Text', icon: Link2, run: withDoc((id) => { const l = selObjs(id).find((o) => o.type === 'link'); if (l) useUiStore.getState().openDialog('link', { objectId: l.id }); else toast.info('Select a link rectangle first') }) },
  { id: 'annotate.removeLink', title: 'Remove link', category: 'Text', icon: Link2, run: withDoc((id) => { const ids = selObjs(id).filter((o) => o.type === 'link').map((o) => o.id); if (ids.length) removeObjects(id, ids, 'Remove link'); else { const t = selObjs(id).filter((o) => o.type === 'text' && o.link); if (t.length) patchObjects(id, t.map((o) => o.id), { link: null }, 'Remove hyperlink'); else toast.info('Select a link first') } }) },

  /* ---- Text ---- */
  { id: 'text.add', title: 'Add text', category: 'Text', icon: Type, shortcut: 't', keywords: ['textbox', 'overlay'], checked: toolChecked('text'), run: tool('text') },
  { id: 'text.edit', title: 'Edit existing text', category: 'Text', icon: Pencil, keywords: ['replace text', 'paragraph', 'change'], checked: toolChecked('edit-text'), run: tool('edit-text'), note: 'The original text is covered and replaced with an overlay (arbitrary PDF text cannot always be edited natively).' },
  { id: 'text.heading', title: 'Add heading', category: 'Text', icon: Heading1, checked: toolChecked('heading'), run: tool('heading') },
  { id: 'text.list', title: 'Add bulleted list', category: 'Text', icon: List, checked: toolChecked('list'), run: tool('list') },
  { id: 'text.bold', title: 'Bold', category: 'Text', shortcut: 'mod+b', icon: Bold, run: () => toggleTextStyle('bold') },
  { id: 'text.italic', title: 'Italic', category: 'Text', shortcut: 'mod+i', icon: Italic, run: () => toggleTextStyle('italic') },
  { id: 'text.underline', title: 'Underline (style)', category: 'Text', shortcut: 'mod+u', icon: Underline, run: () => toggleTextStyle('underline') },
  { id: 'text.strike', title: 'Strikethrough (style)', category: 'Text', icon: Strikethrough, run: () => toggleTextStyle('strike') },
  { id: 'text.font', title: 'Load custom font…', category: 'Text', icon: Baseline, keywords: ['ttf', 'otf', 'unicode'], run: dialog('fonts') },

  /* ---- Images ---- */
  { id: 'image.insert', title: 'Insert image…', category: 'Images', icon: ImageIcon, keywords: ['picture', 'photo', 'png', 'jpg'], run: withDoc(() => void insertImageFromFile()) },
  { id: 'image.replace', title: 'Replace image…', category: 'Images', icon: ImageIcon, run: withDoc(() => void replaceSelectedImage()) },
  { id: 'image.rotateCw', title: 'Rotate selection 90° clockwise', category: 'Images', icon: RotateCw, enabled: hasSelection, run: () => rotateSelected(90) },
  { id: 'image.rotateCcw', title: 'Rotate selection 90° counter-clockwise', category: 'Images', icon: RotateCcw, enabled: hasSelection, run: () => rotateSelected(-90) },
  { id: 'image.flipH', title: 'Flip image horizontally', category: 'Images', icon: FlipHorizontal2, run: () => flipSelected('h') },
  { id: 'image.flipV', title: 'Flip image vertically', category: 'Images', icon: FlipVertical2, run: () => flipSelected('v') },

  /* ---- Pages ---- */
  { id: 'pages.addBlank', title: 'Add blank page', category: 'Pages', icon: FilePlus2, run: withDoc((id) => { addBlankPage(id, curIndex(id) + 1); goToPage(curIndex(id) + 1) }) },
  { id: 'pages.delete', title: 'Delete page(s)', category: 'Pages', icon: FileMinus, keywords: ['remove'], run: withDoc(async (id) => { const t = targetIds(id); if (t.length >= getPages(id).length) return void toast.error('A document needs at least one page.'); if (t.length > 1 && !(await import('@/stores/confirm-store').then((m) => m.confirmAction({ title: `Delete ${t.length} pages?`, description: 'You can undo this with Ctrl/Cmd+Z.', confirmLabel: 'Delete', destructive: true })))) return; deletePages(id, t); useSelectionStore.getState().setPages([]) }) },
  { id: 'pages.duplicate', title: 'Duplicate page(s)', category: 'Pages', icon: Copy, run: withDoc((id) => void duplicatePages(id, targetIds(id))) },
  { id: 'pages.rotateCw', title: 'Rotate page clockwise', category: 'Pages', icon: RotateCw, run: rotateTargets(90) },
  { id: 'pages.rotateCcw', title: 'Rotate page counter-clockwise', category: 'Pages', icon: RotateCcw, run: rotateTargets(-90) },
  { id: 'pages.rotate180', title: 'Rotate page 180°', category: 'Pages', icon: RotateCw, run: rotateTargets(180) },
  { id: 'pages.resetRotation', title: 'Reset page rotation', category: 'Pages', run: withDoc((id) => resetRotation(id, targetIds(id))) },
  { id: 'pages.moveUp', title: 'Move page up / earlier', category: 'Pages', icon: MoveVertical, run: withDoc((id) => { const t = targetIds(id); const pages = getPages(id); const first = pages.findIndex((p) => p.id === t[0]); if (first > 0) movePages(id, t, first - 1) }) },
  { id: 'pages.moveDown', title: 'Move page down / later', category: 'Pages', icon: MoveVertical, run: withDoc((id) => { const t = targetIds(id); const pages = getPages(id); const first = pages.findIndex((p) => p.id === t[0]); movePages(id, t, first + 1) }) },
  { id: 'pages.extract', title: 'Extract pages…', category: 'Pages', icon: FileUp, keywords: ['odd', 'even', 'selected', 'save pages'], run: withDoc(dialog('extract')) },
  { id: 'pages.split', title: 'Split PDF…', category: 'Pages', icon: Split, keywords: ['range', 'every n pages', 'divide'], run: withDoc(dialog('split')) },
  { id: 'pages.insertPdf', title: 'Insert pages from PDF…', category: 'Pages', icon: FilePlus2, keywords: ['add pdf', 'append'], run: withDoc(dialog('insertPdf')) },
  { id: 'pages.replace', title: 'Replace page from PDF…', category: 'Pages', icon: Replace, run: withDoc(async (id) => { const f = (await pickFiles({ accept: '.pdf,application/pdf', multiple: false }))[0]; if (!f) return; const t = targetIds(id)[0]; const { replacePage } = await import('@/services/pdf/page-service'); await runTask('Replacing page', () => replacePage(id, t, f, f.name)) }) },
  { id: 'pages.copy', title: 'Copy page(s)', category: 'Pages', icon: Copy, run: withDoc((id) => toast.success(`Copied ${copyPages(id, targetIds(id))} page(s)`)) },
  { id: 'pages.paste', title: 'Paste page(s) after current', category: 'Pages', icon: Clipboard, enabled: hasPageClipboard, run: withDoc((id) => { const t = targetIds(id); const idx = getPages(id).findIndex((p) => p.id === t[t.length - 1]); const n = pastePages(id, idx + 1); if (!n) toast.info('No copied pages') }) },
  { id: 'pages.reverse', title: 'Reverse page order', category: 'Pages', icon: ArrowDownUp, run: withDoc((id) => reversePages(id)) },
  { id: 'pages.sort', title: 'Sort pages by size…', category: 'Pages', icon: ArrowDownUp, run: withDoc((id) => sortPages(id, 'area')) },
  { id: 'pages.sortOriginal', title: 'Sort pages back to original order', category: 'Pages', run: withDoc((id) => sortPages(id, 'original')) },
  { id: 'pages.labels', title: 'Page labels & custom numbering…', category: 'Pages', icon: ListChecks, keywords: ['roman', 'prefix', 'numbering'], run: withDoc(dialog('labels')) },
  { id: 'pages.crop', title: 'Crop pages…', category: 'Pages', icon: Crop, keywords: ['trim', 'margins', 'crop box', 'visual crop'], run: withDoc(() => { useToolStore.getState().setTool('crop'); useUiStore.getState().openDialog('crop') }) },
  { id: 'pages.cropTool', title: 'Visual crop tool', category: 'Pages', icon: Crop, checked: toolChecked('crop'), run: withDoc(tool('crop')) },
  { id: 'pages.setup', title: 'Page size, margins & alignment…', category: 'Pages', icon: Ruler, keywords: ['resize', 'dimensions', 'normalize', 'center', 'align', 'margins', 'remove margins'], run: withDoc(dialog('pageSetup')) },
  { id: 'pages.organizer', title: 'Page organizer (grid view)', category: 'Pages', icon: LayoutGrid, keywords: ['reorder', 'drag', 'thumbnails'], checked: () => useUiStore.getState().organizer, run: withDoc(() => useUiStore.getState().set({ organizer: !useUiStore.getState().organizer })) },
  { id: 'pages.bookmark', title: 'Bookmark current page', category: 'Pages', icon: BookmarkPlus, run: withDoc(async (id) => { const { addBookmark } = await import('@/services/pdf/bookmark-service'); addBookmark(id, { pageId: getPages(id)[curIndex(id)].id, title: `Page ${curIndex(id) + 1}` }); useUiStore.getState().set({ leftOpen: true, leftTab: 'outline' }) }) },

  /* ---- Forms ---- */
  ...([
    ['field-text', 'Add text field', FormInput],
    ['field-checkbox', 'Add checkbox', CheckSquare],
    ['field-radio', 'Add radio button', CircleDot],
    ['field-dropdown', 'Add dropdown', ChevronDownSquare],
    ['field-listbox', 'Add list box', List],
    ['field-button', 'Add button', RectangleHorizontal],
    ['field-date', 'Add date field', Calendar],
    ['field-signature', 'Add signature field', FileSignature],
  ] as [ToolId, string, LucideIcon][]).map(([t, title, icon]): Command => ({ id: `form.${t}`, title, category: 'Forms', icon, checked: toolChecked(t), run: withDoc(tool(t)) })),
  { id: 'form.fill', title: 'Fill mode (use form fields)', category: 'Forms', icon: MousePointerClick, checked: () => useUiStore.getState().formMode === 'fill', run: () => useUiStore.getState().set({ formMode: 'fill' }) },
  { id: 'form.edit', title: 'Edit mode (move & configure fields)', category: 'Forms', icon: Settings2, checked: () => useUiStore.getState().formMode === 'edit', run: () => useUiStore.getState().set({ formMode: 'edit' }) },
  { id: 'form.validate', title: 'Validate form', category: 'Forms', icon: ListChecks, run: withDoc(async (id) => { const { validateAll } = await import('@/services/pdf/form-service'); const n = validateAll(id); if (n) toast.error(`${n} field${n > 1 ? 's need' : ' needs'} attention`); else toast.success('All fields are valid') }) },
  { id: 'form.reset', title: 'Reset form', category: 'Forms', icon: RotateCcw, run: withDoc(async (id) => (await import('@/services/pdf/form-service')).resetForm(id)) },
  { id: 'form.data', title: 'Import / export form data…', category: 'Forms', icon: Table2, keywords: ['json', 'csv'], run: withDoc(dialog('formData')) },
  { id: 'form.flatten', title: 'Flatten forms', category: 'Forms', icon: Minimize2, keywords: ['optimize'], run: withDoc((id) => void flattenAnnotations(id, { forms: true })) },

  /* ---- Sign ---- */
  { id: 'sign.create', title: 'Sign… (draw, type or upload)', category: 'Sign', icon: FileSignature, keywords: ['signature', 'initials', 'saved signatures'], run: withDoc(dialog('sign')), note: 'Visual e-signature only – not a certificate-based digital signature.' },
  { id: 'sign.date', title: 'Insert date', category: 'Sign', icon: CalendarDays, run: withDoc(() => insertQuickText('date')) },
  { id: 'sign.name', title: 'Insert name', category: 'Sign', icon: Type, run: withDoc(() => insertQuickText('name')) },

  /* ---- Security ---- */
  { id: 'sec.security', title: 'Password protection & permissions…', category: 'Security', icon: ShieldCheck, keywords: ['encrypt', 'password', 'aes', 'permissions', 'disable printing', 'disable copying'], run: withDoc(dialog('security')), note: 'AES-256 encryption. Permission flags are honoured by compliant viewers only – they are not tamper-proof.' },
  { id: 'sec.removeMeta', title: 'Remove all metadata', category: 'Security', icon: ShieldOff, run: withDoc(dialog('metadata')) },
  { id: 'sec.redact', title: 'Redact area', category: 'Security', icon: Square, keywords: ['blackout', 'censor', 'sanitize'], checked: toolChecked('redact'), run: withDoc(tool('redact')) },
  { id: 'sec.redactText', title: 'Redact text (search & mark)…', category: 'Security', icon: ScanText, keywords: ['find and redact'], run: withDoc(dialog('redact')) },
  { id: 'sec.applyRedactions', title: 'Apply redactions permanently', category: 'Security', icon: FileLock2, keywords: ['remove content'], run: withDoc((id) => void applyRedactions(id)), note: 'Affected pages are rasterised so the content underneath is truly removed.' },
  { id: 'sec.redactPreview', title: 'Toggle redaction preview', category: 'Security', icon: Eye, checked: () => useUiStore.getState().redactPreview, run: () => useUiStore.getState().set({ redactPreview: !useUiStore.getState().redactPreview }) },

  /* ---- OCR ---- */
  { id: 'ocr.run', title: 'OCR… (recognise text)', category: 'OCR', icon: ScanText, keywords: ['scan', 'searchable', 'language', 'tesseract'], run: withDoc(dialog('ocr')) },
  { id: 'ocr.clear', title: 'Clear OCR results', category: 'OCR', run: withDoc((id) => clearOcr(id)) },

  /* ---- Convert ---- */
  { id: 'convert.dialog', title: 'Convert…', category: 'Convert', icon: FileImage, keywords: ['png', 'jpg', 'text', 'html', 'docx', 'xlsx'], run: dialog('convert'), global: true },
  { id: 'convert.toPng', title: 'PDF → PNG images', category: 'Convert', icon: FileImage, run: withDoc(() => useUiStore.getState().openDialog('convert', { tab: 'images', format: 'png' })) },
  { id: 'convert.toJpg', title: 'PDF → JPG images', category: 'Convert', icon: FileImage, run: withDoc(() => useUiStore.getState().openDialog('convert', { tab: 'images', format: 'jpeg' })) },
  { id: 'convert.toText', title: 'PDF → text', category: 'Convert', icon: FileText, run: withDoc(() => useUiStore.getState().openDialog('convert', { tab: 'text' })) },
  { id: 'convert.toHtml', title: 'PDF → HTML', category: 'Convert', icon: FileCode, run: withDoc(() => useUiStore.getState().openDialog('convert', { tab: 'html' })) },
  {
    id: 'convert.canvasToPdf', title: 'Snapshot current page → new PDF (canvas)', category: 'Convert', icon: FileImage, keywords: ['canvas', 'rasterize', 'flatten page', 'image pdf'],
    note: 'Renders the page (with your edits) to a canvas and creates a new image-only PDF.',
    run: withDoc((id) => runTask('Creating image PDF', async () => {
      const { exportPdfBytes } = await import('@/services/pdf/export-service')
      const { destroySource, openSource } = await import('@/services/pdf/sources')
      const { renderPageToCanvas } = await import('@/services/pdf/renderer')
      const { canvasToPdfBlob } = await import('@/services/convert/to-pdf')
      const { openPdfWithPassword } = await import('@/services/import')
      const pageId = getPages(id)[curIndex(id)].id
      const bytes = await exportPdfBytes(id, { pageIds: [pageId] })
      const src = await openSource(new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'snapshot.pdf')
      try {
        const p = await src.proxy.getPage(1)
        const vp = p.getViewport({ scale: 1 })
        p.cleanup()
        const canvas = await renderPageToCanvas({ sourceId: src.id, sourceIndex: 0, width: vp.width, height: vp.height }, 2, { annotationMode: 'storage' })
        const blob = await canvasToPdfBlob(canvas)
        canvas.width = canvas.height = 0
        await openPdfWithPassword(blob, `${stripExtension(getDoc(id)?.name ?? 'page')}-page-${curIndex(id) + 1}-image.pdf`)
      } finally {
        await destroySource(src.id)
      }
    })),
  },
  { id: 'convert.exportAnnotations', title: 'Export annotations (JSON)', category: 'Convert', icon: FileCode, run: withDoc(() => useUiStore.getState().openDialog('convert', { tab: 'annotations' })) },

  /* ---- Optimize ---- */
  { id: 'opt.compress', title: 'Compress PDF…', category: 'Optimize', icon: Minimize2, keywords: ['reduce size', 'optimize', 'downsample', 'jpeg quality', 'shrink'], run: withDoc(dialog('compress')) },
  { id: 'opt.flatten', title: 'Flatten annotations', category: 'Optimize', icon: Minimize2, run: withDoc((id) => void flattenAnnotations(id)) },

  /* ---- Watermark / Headers / Footers ---- */
  { id: 'wm.add', title: 'Watermark…', category: 'Watermark', icon: Droplets, keywords: ['text watermark', 'image watermark', 'tile', 'confidential'], run: withDoc(dialog('watermark')) },
  { id: 'hf.header', title: 'Header…', category: 'Headers', icon: ArrowUpToLine, keywords: ['page number', 'date'], run: withDoc(() => useUiStore.getState().openDialog('headerFooter', { kind: 'header' })) },
  { id: 'hf.footer', title: 'Footer…', category: 'Footers', icon: ArrowUpToLine, keywords: ['page number', 'total pages', 'date'], run: withDoc(() => useUiStore.getState().openDialog('headerFooter', { kind: 'footer' })) },
  { id: 'hf.bates', title: 'Bates numbering…', category: 'Footers', icon: ListChecks, keywords: ['legal', 'stamp numbers'], run: withDoc(() => useUiStore.getState().openDialog('headerFooter', { kind: 'bates' })) },
  { id: 'hf.pageNumbers', title: 'Add page numbers', category: 'Footers', icon: ListChecks, run: withDoc(() => useUiStore.getState().openDialog('headerFooter', { kind: 'footer', preset: 'numbers' })) },

  /* ---- View ---- */
  { id: 'view.zoomIn', title: 'Zoom in', category: 'View', shortcut: 'mod+plus', icon: ZoomIn, run: () => zoomBy(1.2) },
  { id: 'view.zoomOut', title: 'Zoom out', category: 'View', shortcut: 'mod+minus', icon: ZoomOut, run: () => zoomBy(1 / 1.2) },
  { id: 'view.zoom100', title: 'Actual size (100%)', category: 'View', shortcut: 'mod+0', run: () => useUiStore.getState().set({ fit: 'custom', zoom: 1 }) },
  { id: 'view.fitWidth', title: 'Fit width', category: 'View', run: () => useUiStore.getState().set({ fit: 'width' }), checked: () => useUiStore.getState().fit === 'width' },
  { id: 'view.fitPage', title: 'Fit page', category: 'View', run: () => useUiStore.getState().set({ fit: 'page' }), checked: () => useUiStore.getState().fit === 'page' },
  { id: 'view.fitHeight', title: 'Fit height', category: 'View', run: () => useUiStore.getState().set({ fit: 'height' }), checked: () => useUiStore.getState().fit === 'height' },
  { id: 'view.continuous', title: 'Continuous scrolling', category: 'View', run: () => useUiStore.getState().set({ viewMode: 'continuous' }), checked: () => useUiStore.getState().viewMode === 'continuous' },
  { id: 'view.single', title: 'Single page', category: 'View', run: () => useUiStore.getState().set({ viewMode: 'single' }), checked: () => useUiStore.getState().viewMode === 'single' },
  { id: 'view.two', title: 'Two pages', category: 'View', run: () => useUiStore.getState().set({ viewMode: 'two' }), checked: () => useUiStore.getState().viewMode === 'two' },
  { id: 'view.twoCover', title: 'Two pages with cover', category: 'View', run: () => useUiStore.getState().set({ viewMode: 'two-cover' }), checked: () => useUiStore.getState().viewMode === 'two-cover' },
  { id: 'view.vertical', title: 'Vertical scrolling', category: 'View', run: () => useUiStore.getState().set({ scrollDir: 'vertical' }), checked: () => useUiStore.getState().scrollDir === 'vertical' },
  { id: 'view.horizontal', title: 'Horizontal scrolling', category: 'View', run: () => useUiStore.getState().set({ scrollDir: 'horizontal', viewMode: 'continuous' }), checked: () => useUiStore.getState().scrollDir === 'horizontal' },
  { id: 'view.rotateCw', title: 'Rotate view clockwise', category: 'View', icon: RotateCw, shortcut: 'mod+shift+plus', run: rotateTargets(90), note: 'Rotates the current/selected page (saved with the document).' },
  { id: 'view.rotateCcw', title: 'Rotate view counter-clockwise', category: 'View', icon: RotateCcw, shortcut: 'mod+shift+minus', run: rotateTargets(-90) },
  { id: 'view.fullscreen', title: 'Full screen', category: 'View', icon: Fullscreen, shortcut: 'f11', global: true, run: () => void toggleFullscreen() },
  { id: 'view.presentation', title: 'Presentation mode', category: 'View', icon: Presentation, run: withDoc(() => void (useUiStore.getState().presentation ? exitPresentation() : enterPresentation())) },
  { id: 'view.left', title: 'Toggle left sidebar', category: 'View', icon: PanelLeft, global: true, shortcut: 'mod+\\', run: () => useUiStore.getState().set({ leftOpen: !useUiStore.getState().leftOpen }) },
  { id: 'view.right', title: 'Toggle properties panel', category: 'View', icon: PanelRight, global: true, run: () => useUiStore.getState().set({ rightOpen: !useUiStore.getState().rightOpen }) },
  { id: 'view.theme', title: 'Toggle dark / light mode', category: 'View', icon: Moon, global: true, keywords: ['theme', 'dark mode', 'light mode'], run: () => themeBridge.toggle() },
  { id: 'view.highContrast', title: 'High contrast mode', category: 'View', icon: Contrast, global: true, checked: () => useUiStore.getState().highContrast, run: () => useUiStore.getState().set({ highContrast: !useUiStore.getState().highContrast }) },
  { id: 'view.reduceMotion', title: 'Reduce motion', category: 'View', global: true, checked: () => useUiStore.getState().reduceMotion, run: () => useUiStore.getState().set({ reduceMotion: !useUiStore.getState().reduceMotion }) },
  { id: 'view.lowMemory', title: 'Low-memory rendering mode', category: 'View', icon: Monitor, global: true, checked: () => useUiStore.getState().lowMemory, run: () => useUiStore.getState().set({ lowMemory: !useUiStore.getState().lowMemory }) },
  { id: 'view.settings', title: 'Settings (quality, history, author)…', category: 'View', icon: Settings2, global: true, run: dialog('settings') },
  { id: 'view.thumbnails', title: 'Show thumbnails', category: 'View', global: true, run: () => showTab('thumbnails') },
  { id: 'view.outline', title: 'Show bookmarks / outline', category: 'View', global: true, run: () => showTab('outline') },
  { id: 'view.attachments', title: 'Show attachments', category: 'View', global: true, run: () => showTab('attachments') },
  { id: 'view.layers', title: 'Show layers', category: 'View', global: true, run: () => showTab('layers') },
  { id: 'view.pages', title: 'Show pages panel', category: 'View', global: true, run: () => showTab('pages') },
  { id: 'nav.first', title: 'First page', category: 'View', shortcut: 'home', icon: BookOpen, run: () => goToPage(0) },
  { id: 'nav.prev', title: 'Previous page', category: 'View', shortcut: 'pageup', run: withDoc((id) => goToPage(curIndex(id) - 1)) },
  { id: 'nav.next', title: 'Next page', category: 'View', shortcut: 'pagedown', run: withDoc((id) => goToPage(curIndex(id) + 1)) },
  { id: 'nav.last', title: 'Last page', category: 'View', shortcut: 'end', run: withDoc((id) => goToPage(getPages(id).length - 1)) },

  /* ---- Help ---- */
  { id: 'help.shortcuts', title: 'Keyboard shortcuts…', category: 'Help', icon: Keyboard, global: true, shortcut: 'shift+?', keywords: ['customize', 'keys'], run: dialog('shortcuts') },
  { id: 'help.tools', title: 'Tool guide (what everything does)…', category: 'Help', icon: BookOpen, global: true, keywords: ['help', 'guide', 'tooltips', 'learn', 'tutorial', 'features'], run: dialog('toolGuide') },
  { id: 'help.about', title: 'About, privacy & limitations…', category: 'Help', icon: Info, global: true, keywords: ['help', 'privacy', 'limits'], run: dialog('about') },
]

function showTab(tab: LeftTab) {
  useUiStore.getState().set({ leftOpen: true, leftTab: tab })
}

export const COMMAND_MAP = new Map(COMMANDS.map((c) => [c.id, c]))
export const getCommand = (id: string) => COMMAND_MAP.get(id)
/** One-sentence summary of what a command does (plus its honest limitation, if any). */
export const helpOf = (c: Command) => COMMAND_HELP[c.id] ?? c.note ?? ''

/** Effective shortcut (user override or default). */
export function shortcutOf(c: Command | string): string {
  const cmd = typeof c === 'string' ? COMMAND_MAP.get(c) : c
  if (!cmd) return ''
  const o = useShortcutStore.getState().overrides
  return cmd.id in o ? o[cmd.id] : (cmd.shortcut ?? '')
}

export function isEnabled(c: Command): boolean {
  if (!c.global && !docId()) return false
  return c.enabled ? c.enabled() : true
}

export async function runCommand(id: string) {
  const c = COMMAND_MAP.get(id)
  if (!c) return
  if (!isEnabled(c)) return
  try {
    await c.run()
  } catch (e) {
    toast.error(`${c.title} failed`, { description: (e as Error).message })
    console.error(e)
  }
}

/** Map of combo → command id for keyboard dispatch. */
export function buildShortcutMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of COMMANDS) {
    const s = shortcutOf(c)
    if (s) map.set(normalizeCombo(s), c.id)
  }
  return map
}

export function findConflict(combo: string, exceptId: string): Command | undefined {
  const n = normalizeCombo(combo)
  return COMMANDS.find((c) => c.id !== exceptId && shortcutOf(c) && normalizeCombo(shortcutOf(c)) === n)
}

export { comboFromEvent, addObjects, importFiles, AlignJustify, CalendarDays, Ruler, ScissorsLineDashed, SplitSquareVertical, FileUp, EraserIcon, ArrowLeftRight, Layers, Sun }
