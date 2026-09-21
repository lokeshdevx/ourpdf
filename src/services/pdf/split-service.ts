import { getPages } from '@/stores/page-store'
import { getDoc } from '@/stores/pdf-store'
import { chunkEvery, evenIndices, oddIndices } from '@/utils/pages'
import { sanitizeFilename, stripExtension } from '@/utils/file'
import { bytesToBlob, saveBlob } from '../download'
import { exportPdfBytes } from './export-service'
import type { TaskContext } from '../tasks'

export type SplitMode = { kind: 'ranges'; groups: number[][] } | { kind: 'every'; n: number } | { kind: 'single' } | { kind: 'odd' } | { kind: 'even' }

export function planSplit(total: number, mode: SplitMode): number[][] {
  switch (mode.kind) {
    case 'ranges':
      return mode.groups
    case 'every':
      return chunkEvery(total, mode.n)
    case 'single':
      return chunkEvery(total, 1)
    case 'odd':
      return [oddIndices(total)]
    case 'even':
      return [evenIndices(total)]
  }
}

/** Splits a document into several PDFs (zipped when more than one). Each part reflects all edits. */
export async function splitDocument(docId: string, groups: number[][], ctx: TaskContext, opts: { asZip?: boolean } = {}): Promise<number> {
  const doc = getDoc(docId)
  const pages = getPages(docId)
  if (!doc || !groups.length) return 0
  const base = sanitizeFilename(stripExtension(doc.name))
  const pad = String(groups.length).length
  const parts: { name: string; bytes: Uint8Array }[] = []
  for (let g = 0; g < groups.length; g++) {
    const ids = groups[g].map((i) => pages[i]?.id).filter(Boolean)
    const bytes = await exportPdfBytes(docId, { pageIds: ids, signal: ctx.signal, onProgress: (f) => ctx.progress((g + f) / groups.length, `Part ${g + 1} of ${groups.length}`) })
    const first = groups[g][0] + 1
    const last = groups[g][groups[g].length - 1] + 1
    parts.push({ name: `${base}-part${String(g + 1).padStart(pad, '0')}-p${first}${last !== first ? `-${last}` : ''}.pdf`, bytes })
  }
  if (parts.length === 1 && !opts.asZip) {
    await saveBlob(bytesToBlob(parts[0].bytes), parts[0].name)
  } else {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    for (const p of parts) zip.file(p.name, p.bytes)
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => ctx.progress(0.9 + (m.percent / 100) * 0.1, 'Zipping'))
    await saveBlob(blob, `${base}-split.zip`)
  }
  return parts.length
}

/** Extracts pages into a single PDF download. */
export async function extractPages(docId: string, indices: number[], ctx: TaskContext, filename?: string): Promise<void> {
  const doc = getDoc(docId)
  const pages = getPages(docId)
  if (!doc) return
  const ids = indices.map((i) => pages[i]?.id).filter(Boolean)
  const bytes = await exportPdfBytes(docId, { pageIds: ids, signal: ctx.signal, onProgress: (f, l) => ctx.progress(f, l) })
  await saveBlob(bytesToBlob(bytes), filename ?? `${sanitizeFilename(stripExtension(doc.name))}-extract.pdf`)
}
