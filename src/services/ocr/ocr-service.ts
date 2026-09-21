import { AppError, CancelledError } from '@/lib/errors'
import { getPages } from '@/stores/page-store'
import { usePdfStore } from '@/stores/pdf-store'
import { markDirty } from '@/services/history'
import { renderPageToCanvas } from '@/services/pdf/renderer'
import type { OcrPage, OcrWord } from '@/types'

export const OCR_LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
] as const

type TessWorker = import('tesseract.js').Worker

/** Creates a Tesseract worker that loads everything from this origin (no CDN, works offline). */
async function makeWorker(langs: string[], onProgress?: (p: number, status: string) => void): Promise<TessWorker> {
  const { createWorker, OEM } = await import('tesseract.js')
  try {
    return await createWorker(langs.join('+'), OEM.LSTM_ONLY, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core',
      langPath: '/tessdata',
      gzip: true,
      workerBlobURL: false,
      logger: (m) => onProgress?.(m.progress ?? 0, m.status),
    })
  } catch (e) {
    throw new AppError('ocr', 'OCR failed to start. The local OCR engine or language data could not be loaded.', (e as Error).message)
  }
}

export interface OcrOptions {
  languages: string[]
  /** Render scale in px per pt (2.5 ≈ 180 dpi). */
  scale: number
  signal?: AbortSignal
  onProgress?: (fraction: number, label: string) => void
  onPage?: (pageId: string, result: OcrPage) => void
}

/** Runs OCR on the given pages locally and stores the words (base-space boxes) on the document. */
export async function ocrPages(docId: string, pageIds: string[], opts: OcrOptions): Promise<Record<string, OcrPage>> {
  const pages = getPages(docId).filter((p) => pageIds.includes(p.id))
  if (!pages.length) throw new AppError('invalid-input', 'No pages selected for OCR.')
  const langs = opts.languages.length ? opts.languages : ['eng']
  let pageFraction = 0
  let pageIdx = 0
  const worker = await makeWorker(langs, (p, status) => {
    if (status === 'recognizing text') {
      pageFraction = p
      opts.onProgress?.((pageIdx + pageFraction) / pages.length, `Page ${pageIdx + 1} of ${pages.length}`)
    }
  })
  const abort = () => void worker.terminate().catch(() => {})
  opts.signal?.addEventListener('abort', abort)
  const results: Record<string, OcrPage> = {}
  try {
    for (pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      if (opts.signal?.aborted) throw new CancelledError('OCR cancelled')
      const page = pages[pageIdx]
      opts.onProgress?.(pageIdx / pages.length, `Rendering page ${pageIdx + 1} of ${pages.length}`)
      const canvas = await renderPageToCanvas(page, opts.scale, { annotationMode: 'storage' })
      let data
      try {
        data = (await worker.recognize(canvas, {}, { text: true, blocks: true })).data
      } catch (e) {
        if (opts.signal?.aborted) throw new CancelledError('OCR cancelled')
        throw new AppError('ocr', 'OCR failed on page ' + (pageIdx + 1), (e as Error).message)
      }
      const words: OcrWord[] = []
      for (const b of data.blocks ?? []) for (const par of b.paragraphs) for (const line of par.lines) for (const w of line.words) {
        if (!w.text.trim()) continue
        words.push({ text: w.text, x: w.bbox.x0 / opts.scale, y: w.bbox.y0 / opts.scale, w: (w.bbox.x1 - w.bbox.x0) / opts.scale, h: (w.bbox.y1 - w.bbox.y0) / opts.scale, conf: w.confidence })
      }
      canvas.width = canvas.height = 0
      const result: OcrPage = { text: data.text.trim(), lang: langs.join('+'), words, confidence: data.confidence }
      results[page.id] = result
      opts.onPage?.(page.id, result)
      const doc = usePdfStore.getState().docs.find((d) => d.id === docId)
      if (doc) usePdfStore.getState().updateDoc(docId, { ocr: { ...doc.ocr, [page.id]: result } })
      opts.onProgress?.((pageIdx + 1) / pages.length, `Page ${pageIdx + 1} of ${pages.length} done`)
    }
    markDirty(docId)
    return results
  } finally {
    opts.signal?.removeEventListener('abort', abort)
    await worker.terminate().catch(() => {})
  }
}

export interface LangGuess {
  code: string
  label: string
  confidence: number
}

/** Detects the most likely language by recognising a downscaled page with each installed language model. */
export async function detectLanguage(docId: string, pageId: string, signal?: AbortSignal, onProgress?: (f: number) => void): Promise<LangGuess[]> {
  const page = getPages(docId).find((p) => p.id === pageId)
  if (!page) throw new AppError('invalid-input', 'Page not found.')
  const canvas = await renderPageToCanvas(page, 1.6, { annotationMode: 'storage' })
  const out: LangGuess[] = []
  const worker = await makeWorker([OCR_LANGUAGES[0].code])
  try {
    for (let i = 0; i < OCR_LANGUAGES.length; i++) {
      if (signal?.aborted) throw new CancelledError()
      const l = OCR_LANGUAGES[i]
      await worker.reinitialize(l.code)
      const { data } = await worker.recognize(canvas, {}, { text: true })
      // Confidence is weighted by how much text was recognised so that "mostly noise" cannot win.
      const chars = data.text.replace(/\s/g, '').length
      out.push({ code: l.code, label: l.label, confidence: chars < 8 ? 0 : data.confidence })
      onProgress?.((i + 1) / OCR_LANGUAGES.length)
    }
  } finally {
    canvas.width = canvas.height = 0
    await worker.terminate().catch(() => {})
  }
  return out.sort((a, b) => b.confidence - a.confidence)
}

export function ocrTextFor(docId: string, pageIds?: string[]): string {
  const doc = usePdfStore.getState().docs.find((d) => d.id === docId)
  if (!doc) return ''
  const pages = getPages(docId).filter((p) => !pageIds || pageIds.includes(p.id))
  return pages
    .map((p, i) => (doc.ocr[p.id] ? `--- Page ${i + 1} ---\n${doc.ocr[p.id].text}` : ''))
    .filter(Boolean)
    .join('\n\n')
}

export function clearOcr(docId: string, pageIds?: string[]) {
  const doc = usePdfStore.getState().docs.find((d) => d.id === docId)
  if (!doc) return
  const next = { ...doc.ocr }
  for (const id of pageIds ?? Object.keys(next)) delete next[id]
  usePdfStore.getState().updateDoc(docId, { ocr: next })
  markDirty(docId)
}
