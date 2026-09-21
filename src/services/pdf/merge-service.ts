import { AppError } from '@/lib/errors'
import { getPages } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { withExtension } from '@/utils/file'
import { docSourceIds, openPdfBlob } from './document-service'
import { exportPdfBytes } from './export-service'
import { runEngine } from './worker-client'
import { getSource, getSourceBytes, openSource, destroySource } from './sources'
import type { ExportPlan } from '@/engine/types'
import type { PageModel } from '@/types'
import { uid } from '@/utils/id'
import type { TaskContext } from '../tasks'
import { openPdfWithPassword } from '../import'

/** Builds a plan that copies whole documents (or page subsets) with no edits – used by merge and split. */
async function plainPlan(entries: { sourceId: string; indices: number[]; password?: string }[]): Promise<{ plan: ExportPlan; transfer: Transferable[] }> {
  const sources: ExportPlan['sources'] = {}
  const transfer: Transferable[] = []
  const pages: ExportPlan['pages'] = []
  for (const e of entries) {
    const src = getSource(e.sourceId)
    if (!src) throw new AppError('unknown', 'A source file is no longer loaded.')
    if (!sources[e.sourceId]) {
      const bytes = await getSourceBytes(e.sourceId)
      sources[e.sourceId] = { bytes, password: src.password }
      transfer.push(bytes.buffer as ArrayBuffer)
    }
    for (const i of e.indices) {
      const page = await src.proxy.getPage(i + 1)
      const vp = page.getViewport({ scale: 1 })
      const model: PageModel = {
        id: uid('pg'),
        sourceId: e.sourceId,
        sourceIndex: i,
        width: vp.width,
        height: vp.height,
        intrinsic: (((page.rotate % 360) + 360) % 360) as PageModel['intrinsic'],
        view: page.view as PageModel['view'],
        rotation: 0,
        crop: null,
        frame: null,
        sizeKnown: true,
      }
      page.cleanup()
      pages.push({ page: model, objects: [], label: '' })
    }
  }
  return {
    plan: {
      sources,
      pages,
      images: {},
      imageKeys: {},
      textRasters: {},
      fonts: {},
      metadata: null,
      removeMetadata: false,
      bookmarks: [],
      pageLabels: [],
      attachments: [],
      ocr: {},
      removedFields: [],
      options: { flattenForms: false, security: null, producer: 'OurPDF', objectStreams: true, nativeLinks: true, nativeNotes: true },
      now: Date.now(),
    },
    transfer,
  }
}

/** Merges several PDF files (opened only as sources) into one new document tab. */
export async function mergeFilesIntoDoc(files: File[], ctx?: TaskContext): Promise<string | null> {
  const opened: string[] = []
  try {
    const entries: { sourceId: string; indices: number[]; password?: string }[] = []
    for (let i = 0; i < files.length; i++) {
      let pw: string | undefined
      for (;;) {
        try {
          const src = await openSource(files[i], files[i].name, { password: pw })
          opened.push(src.id)
          entries.push({ sourceId: src.id, indices: Array.from({ length: src.numPages }, (_, k) => k), password: pw })
          break
        } catch (e) {
          const err = e as AppError
          if (err.code === 'password-required' || err.code === 'password-incorrect') {
            const { requestPassword } = await import('../import')
            const got = await requestPassword(files[i].name, err.code === 'password-incorrect')
            if (got === null) throw new AppError('cancelled', 'Cancelled')
            pw = got
          } else throw e
        }
      }
      ctx?.progress((i + 1) / files.length / 3, `Reading ${files[i].name}`)
    }
    const { plan, transfer } = await plainPlan(entries)
    const bytes = await runEngine('assemble', { plan }, { transfer, signal: ctx?.signal, onProgress: (f) => ctx?.progress(0.33 + f * 0.67, 'Merging') })
    const name = withExtension(`Merged ${files[0].name.replace(/\.[^.]+$/, '')}`, 'pdf')
    return await openPdfWithPassword(new Blob([bytes as BlobPart], { type: 'application/pdf' }), name)
  } finally {
    for (const id of opened) await destroySource(id)
  }
}

/** Merges already-open documents (their current edited state) into a new document. */
export async function mergeOpenDocs(docIds: string[], ctx?: TaskContext): Promise<string | null> {
  const parts: Uint8Array[] = []
  for (let i = 0; i < docIds.length; i++) {
    parts.push(await exportPdfBytes(docIds[i], { signal: ctx?.signal, onProgress: (f) => ctx?.progress((i + f) / docIds.length / 2) }))
  }
  // Merge the already-rendered parts.
  const opened: string[] = []
  try {
    const entries = []
    for (let i = 0; i < parts.length; i++) {
      const src = await openSource(new Blob([parts[i] as BlobPart], { type: 'application/pdf' }), `part-${i}.pdf`)
      opened.push(src.id)
      entries.push({ sourceId: src.id, indices: Array.from({ length: src.numPages }, (_, k) => k) })
    }
    const { plan, transfer } = await plainPlan(entries)
    const bytes = await runEngine('assemble', { plan }, { transfer, signal: ctx?.signal, onProgress: (f) => ctx?.progress(0.5 + f / 2) })
    const first = usePdfStore.getState().docs.find((d) => d.id === docIds[0])?.name ?? 'document.pdf'
    return await openPdfBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), withExtension(`Merged ${first.replace(/\.[^.]+$/, '')}`, 'pdf'))
  } finally {
    for (const id of opened) await destroySource(id)
  }
}

export { plainPlan, docSourceIds, getPages }
