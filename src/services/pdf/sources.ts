import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { AppError, toUserError } from '@/lib/errors'
import { uid } from '@/utils/id'
import { loadPdfjs, PDFJS_ASSETS } from './pdfjs'

/**
 * A "source" is one immutable PDF file. The bytes stay in a Blob (disk-backed by the browser where possible);
 * PDF.js streams from an object URL using range requests, so even very large files are never fully copied
 * into JS memory just to be viewed. Documents are built as lists of page references into sources.
 */
export interface PdfSource {
  id: string
  name: string
  blob: Blob
  size: number
  url: string
  proxy: PDFDocumentProxy
  task: PDFDocumentLoadingTask
  numPages: number
  /** Password used to open the file (memory only, never persisted). */
  password?: string
  encrypted: boolean
}

const sources = new Map<string, PdfSource>()

/** Registers an already-loaded source (used by restore flows and tests). */
export const registerSource = (src: PdfSource) => void sources.set(src.id, src)
export const getSource = (id: string): PdfSource | undefined => sources.get(id)
export const allSources = (): PdfSource[] => [...sources.values()]

export interface OpenOptions {
  id?: string
  password?: string
  onProgress?: (loaded: number, total: number) => void
}

export async function openSource(blob: Blob, name: string, opts: OpenOptions = {}): Promise<PdfSource> {
  const pdfjs = await loadPdfjs()
  const url = URL.createObjectURL(blob)
  try {
    const task = pdfjs.getDocument({
      url,
      password: opts.password,
      ...PDFJS_ASSETS,
      // PDF-embedded JavaScript is never executed: the pdf.js scripting sandbox is not loaded.
      enableXfa: false,
      // Keep embedded font programs so the exact font can be reused when editing existing text.
      fontExtraProperties: true,
      disableAutoFetch: blob.size > 30 * 1024 * 1024,
      rangeChunkSize: 1 << 18,
      stopAtErrors: false,
    })
    if (opts.onProgress) task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => opts.onProgress?.(loaded, total)
    const proxy = await task.promise
    const src: PdfSource = {
      id: opts.id ?? uid('src'),
      name,
      blob,
      size: blob.size,
      url,
      proxy,
      task,
      numPages: proxy.numPages,
      password: opts.password,
      encrypted: opts.password !== undefined,
    }
    sources.set(src.id, src)
    return src
  } catch (e) {
    URL.revokeObjectURL(url)
    const err = toUserError(e)
    if (err instanceof AppError) throw err
    throw err
  }
}

export async function destroySource(id: string): Promise<void> {
  const s = sources.get(id)
  if (!s) return
  sources.delete(id)
  try {
    await s.task.destroy()
  } catch {
    /* ignore */
  }
  URL.revokeObjectURL(s.url)
}

export async function getSourceBytes(id: string): Promise<Uint8Array> {
  const s = sources.get(id)
  if (!s) throw new AppError('unknown', `Source ${id} is no longer loaded`)
  return new Uint8Array(await s.blob.arrayBuffer())
}

export function totalSourceBytes(ids?: string[]): number {
  let n = 0
  for (const s of sources.values()) if (!ids || ids.includes(s.id)) n += s.size
  return n
}
