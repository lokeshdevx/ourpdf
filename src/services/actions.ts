import { toast } from 'sonner'
import { confirmAction, askConfirm } from '@/stores/confirm-store'
import { getObjects } from '@/stores/annotation-store'
import { getPages } from '@/stores/page-store'
import { getDoc, usePdfStore } from '@/stores/pdf-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useUiStore } from '@/stores/ui-store'
import { formatBytes } from '@/utils/format'
import { sanitizeFilename, stripExtension, withExtension } from '@/utils/file'
import { bytesToBlob, saveBlob } from './download'
import { closeDoc, replaceDocContent } from './pdf/document-service'
import { exportPdfBytes } from './pdf/export-service'
import { runTask } from './tasks'
import { flushAutosave, saveSnapshot } from './storage/projects'
import { getNativeRegistry } from './pdf/document-service'
import { usePageStore } from '@/stores/page-store'

export const activeId = () => usePdfStore.getState().activeId

export function selectedPageIndices(docId: string): number[] {
  const pages = getPages(docId)
  const ids = new Set(useSelectionStore.getState().pageIds)
  return pages.map((p, i) => (ids.has(p.id) ? i : -1)).filter((i) => i >= 0)
}

/** Selected pages in the organizer/thumbnails, else the current page. */
export function targetPageIds(docId: string): string[] {
  const sel = useSelectionStore.getState().pageIds
  const pages = getPages(docId)
  if (sel.length) return pages.filter((p) => sel.includes(p.id)).map((p) => p.id)
  const cur = usePageStore.getState().byDoc[docId]?.current ?? 0
  return pages[cur] ? [pages[cur].id] : []
}

export async function saveDocument(docId = activeId(), opts: { saveAs?: boolean } = {}): Promise<boolean> {
  if (!docId) return false
  const doc = getDoc(docId)
  if (!doc) return false
  const name = withExtension(doc.name, 'pdf')
  const result = await runTask(
    `Saving ${name}`,
    async (ctx) => {
      const bytes = await exportPdfBytes(docId, { signal: ctx.signal, onProgress: ctx.progress })
      const res = await saveBlob(bytesToBlob(bytes), name, { picker: opts.saveAs })
      if (res === 'cancelled') return false
      usePdfStore.getState().markModified(docId, false)
      await flushAutosave()
      return { size: bytes.byteLength }
    },
    { quiet: true },
  )
  if (result && typeof result === 'object') {
    toast.success(`Saved ${name}`, { description: formatBytes(result.size) })
    useUiStore.getState().set({ saveState: 'saved', lastSavedAt: Date.now() })
    return true
  }
  return false
}

export async function saveAll() {
  for (const d of usePdfStore.getState().docs) if (d.modified) await saveDocument(d.id)
}

export async function downloadPages(docId: string, indices: number[], filename?: string) {
  const doc = getDoc(docId)
  if (!doc || !indices.length) return
  const pages = getPages(docId)
  const ids = indices.map((i) => pages[i]?.id).filter(Boolean)
  await runTask('Exporting pages', async (ctx) => {
    const bytes = await exportPdfBytes(docId, { pageIds: ids, signal: ctx.signal, onProgress: ctx.progress })
    await saveBlob(bytesToBlob(bytes), filename ?? `${sanitizeFilename(stripExtension(doc.name))}-pages.pdf`)
  })
}

/** Closes a document, offering to save when it has unsaved changes. Returns false if the user cancelled. */
export async function closeDocumentInteractive(docId: string): Promise<boolean> {
  const doc = getDoc(docId)
  if (!doc) return true
  if (doc.modified) {
    const r = await askConfirm({
      title: `Close “${doc.name}”?`,
      description: 'It has changes that have not been downloaded. Your work is autosaved locally in this browser and can be restored from Projects, but the PDF file itself has not been saved.',
      confirmLabel: 'Download & close',
      altLabel: 'Close without downloading',
      cancelLabel: 'Cancel',
    })
    if (r === 'cancel') return false
    if (r === 'confirm' && !(await saveDocument(docId))) return false
  }
  await flushAutosave()
  await closeDoc(docId)
  return true
}

export async function closeOthers(keep: string) {
  for (const d of [...usePdfStore.getState().docs]) if (d.id !== keep && !(await closeDocumentInteractive(d.id))) return
}
export async function closeAll() {
  for (const d of [...usePdfStore.getState().docs]) if (!(await closeDocumentInteractive(d.id))) return
}

/* --------------------------------------------- destructive "commit" operations */

/**
 * Applies redactions PERMANENTLY: each affected page is re-rendered with the boxes burned into the pixels and its
 * original content (text, vectors, images underneath) is discarded. The search layer is rebuilt without the
 * redacted text. A snapshot of the previous state is kept in project history.
 */
export async function applyRedactions(docId = activeId()): Promise<void> {
  if (!docId) return
  const n = getObjects(docId).filter((o) => o.type === 'redact').length
  if (!n) {
    toast.info('There are no redaction marks to apply.')
    return
  }
  const ok = await confirmAction({
    title: `Permanently apply ${n} redaction${n > 1 ? 's' : ''}?`,
    description:
      'Every page that contains a redaction is converted to an image with the marked areas blacked out; the original text and graphics underneath are removed from the file. Selectable text on those pages is kept only where it is not redacted. This cannot be undone with Undo (a snapshot is saved in Projects ▸ History).',
    confirmLabel: 'Apply redactions',
    destructive: true,
  })
  if (!ok) return
  await runTask('Applying redactions', async (ctx) => {
    await saveSnapshot(docId, 'Before applying redactions')
    const bytes = await exportPdfBytes(docId, { signal: ctx.signal, onProgress: (f, l) => ctx.progress(f * 0.9, l), redactionScale: 3 })
    await replaceDocContent(docId, bytesToBlob(bytes), { keepMetadata: true })
  }, { successMessage: 'Redactions applied permanently' })
}

/** Bakes all annotations, text edits and images into the page content (no longer editable). */
export async function flattenAnnotations(docId = activeId(), opts: { forms?: boolean } = {}): Promise<void> {
  if (!docId) return
  const ok = await confirmAction({
    title: opts.forms ? 'Flatten form fields?' : 'Flatten annotations and edits?',
    description: opts.forms ? 'Form fields become static text and can no longer be edited.' : 'All annotations, overlaid text and images become part of the page and can no longer be moved or edited. Undo history is cleared (a snapshot is kept in Projects ▸ History).',
    confirmLabel: 'Flatten',
    destructive: true,
  })
  if (!ok) return
  await runTask(opts.forms ? 'Flattening forms' : 'Flattening', async (ctx) => {
    await saveSnapshot(docId, opts.forms ? 'Before flattening forms' : 'Before flattening')
    const bytes = await exportPdfBytes(docId, { signal: ctx.signal, onProgress: ctx.progress, flattenForms: true })
    await replaceDocContent(docId, bytesToBlob(bytes), { keepMetadata: true })
  })
}

export function nativeFieldCount(docId: string): number {
  return getNativeRegistry(docId).size
}
