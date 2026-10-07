import type { TextRun } from './pdf'

type TessWorker = import('tesseract.js').Worker

let shared: { langs: string; worker: Promise<TessWorker> } | null = null

/** Local Tesseract worker (self-hosted core + language data, no CDN). Reused between calls with the same languages. */
export async function ocrWorker(langs: string[] = ['eng'], onProgress?: (p: number, status: string) => void): Promise<TessWorker> {
  const key = langs.join('+')
  if (shared && shared.langs === key) return shared.worker
  if (shared) void (await shared.worker).terminate().catch(() => {})
  const { createWorker, OEM } = await import('tesseract.js')
  const worker = createWorker(key, OEM.LSTM_ONLY, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/core',
    langPath: '/tessdata',
    gzip: true,
    workerBlobURL: false,
    logger: (m) => onProgress?.(m.progress ?? 0, m.status),
  })
  shared = { langs: key, worker }
  worker.catch(() => (shared = null))
  return worker
}

export async function stopOcr() {
  if (!shared) return
  const w = shared.worker
  shared = null
  await (await w).terminate().catch(() => {})
}

export interface OcrWordBox { text: string; x0: number; y0: number; x1: number; y1: number; conf: number }
export interface OcrLine { text: string; x0: number; y0: number; x1: number; y1: number; words: OcrWordBox[] }
export interface OcrResult { text: string; lines: OcrLine[]; confidence: number }

/** Recognises a canvas; coordinates are canvas pixels. */
export async function ocrCanvas(canvas: HTMLCanvasElement, langs: string[] = ['eng'], onProgress?: (p: number) => void): Promise<OcrResult> {
  const worker = await ocrWorker(langs, (p, s) => s === 'recognizing text' && onProgress?.(p))
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true })
  const lines: OcrLine[] = []
  type B = { bbox: { x0: number; y0: number; x1: number; y1: number }; text: string; confidence?: number }
  const blocks = (data as unknown as { blocks?: { paragraphs: { lines: (B & { words: B[] })[] }[] }[] }).blocks ?? []
  for (const b of blocks) for (const p of b.paragraphs) for (const l of p.lines) {
    lines.push({
      text: l.text.trim(), ...l.bbox,
      words: l.words.map((w) => ({ text: w.text, ...w.bbox, conf: w.confidence ?? 0 })),
    })
  }
  return { text: data.text, lines, confidence: data.confidence }
}

/** OCR words as text runs in page points (scale = canvas px per pt), so the PII/redaction pipeline works on scans. */
export function ocrRuns(r: OcrResult, scale: number): TextRun[] {
  const runs: TextRun[] = []
  for (const l of r.lines) {
    l.words.forEach((w, i) => {
      const h = (w.y1 - w.y0) / scale
      runs.push({ str: w.text + (i < l.words.length - 1 ? ' ' : ''), x: w.x0 / scale, y: w.y0 / scale, w: (w.x1 - w.x0) / scale, h, size: h, font: 'sans-serif', bold: false, italic: false, eol: i === l.words.length - 1 })
    })
  }
  return runs
}
