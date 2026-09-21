import type * as PdfJs from 'pdfjs-dist'

type PdfJsModule = typeof PdfJs
let modPromise: Promise<PdfJsModule> | null = null

/** Dynamically imports pdf.js (heavy) only when first needed; worker and assets are self-hosted. */
export function loadPdfjs(): Promise<PdfJsModule> {
  if (!modPromise) {
    modPromise = import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
      return m
    })
  }
  return modPromise
}

/** Self-hosted resource URLs required by pdf.js for CJK cmaps, standard fonts, JPX/JBIG2 decoders, ICC profiles. */
export const PDFJS_ASSETS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
} as const
