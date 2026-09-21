import type { Block } from '@/engine/generate'
import { AppError } from '@/lib/errors'
import { normalizeImage } from '@/services/pdf/image-service'
import { runEngine } from '@/services/pdf/worker-client'
import { detectFile } from '@/utils/file'
import { htmlToBlocks, sanitizeHtml } from './html-blocks'

export type PageSizeName = 'A4' | 'Letter' | 'A3' | 'Legal'
const pdfBlob = (b: Uint8Array) => new Blob([b as BlobPart], { type: 'application/pdf' })

export interface ImagesOptions {
  pageSize: 'fit' | PageSizeName
  orientation: 'auto' | 'portrait' | 'landscape'
  margin: number
  dpi: number
}
export const DEFAULT_IMAGES_OPTIONS: ImagesOptions = { pageSize: 'fit', orientation: 'auto', margin: 24, dpi: 96 }

export async function imagesToPdfBlob(files: Blob[], opts: ImagesOptions = DEFAULT_IMAGES_OPTIONS, onProgress?: (f: number) => void): Promise<Blob> {
  const images = []
  for (let i = 0; i < files.length; i++) {
    const n = await normalizeImage(files[i])
    images.push({ ...n, name: (files[i] as File).name })
    onProgress?.(((i + 1) / files.length) * 0.5)
  }
  const bytes = await runEngine('imagesToPdf', { images, options: opts }, { transfer: images.map((i) => i.bytes.buffer as ArrayBuffer), onProgress: (f) => onProgress?.(0.5 + f * 0.5) })
  return pdfBlob(bytes)
}

export async function blocksToPdfBlob(blocks: Block[], opts: { pageSize?: PageSizeName; fontSize?: number; margin?: number; title?: string; mono?: boolean } = {}): Promise<Blob> {
  if (!blocks.length) throw new AppError('invalid-input', 'There is no content to convert.')
  const bytes = await runEngine('blocksToPdf', {
    blocks,
    options: { pageSize: opts.pageSize ?? 'A4', margin: opts.margin ?? 54, fontSize: opts.fontSize ?? 11, title: opts.title, mono: opts.mono },
  })
  return pdfBlob(bytes)
}

export async function textToPdfBlob(text: string, opts: { fontSize?: number; pageSize?: PageSizeName; mono?: boolean; title?: string } = {}): Promise<Blob> {
  if (!text.trim()) throw new AppError('invalid-input', 'The text is empty.')
  return blocksToPdfBlob([{ type: 'pre', text }], { fontSize: opts.fontSize ?? 10, pageSize: opts.pageSize, title: opts.title, mono: true })
}

export async function htmlToPdfBlob(html: string, opts: { pageSize?: PageSizeName; title?: string } = {}): Promise<Blob> {
  const blocks = await htmlToBlocks(html)
  if (!blocks.length) throw new AppError('invalid-input', 'The HTML contains no printable content.')
  return blocksToPdfBlob(blocks, { pageSize: opts.pageSize, title: opts.title })
}

/** Pixel-accurate snapshot of HTML (raster pages). Loses selectable text; use for complex layouts. */
export async function htmlToPdfVisual(html: string): Promise<Blob> {
  const clean = sanitizeHtml(html)
  const { toCanvas } = await import('html-to-image')
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;font:14px/1.5 system-ui,sans-serif;padding:32px;box-sizing:border-box'
  host.innerHTML = clean
  document.body.appendChild(host)
  try {
    const canvas = await toCanvas(host, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true })
    const pageH = Math.floor(canvas.width * 1.4142)
    const pages: Blob[] = []
    for (let y = 0; y < canvas.height; y += pageH) {
      const c = document.createElement('canvas')
      c.width = canvas.width
      c.height = Math.min(pageH, canvas.height - y)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(canvas, 0, y, canvas.width, c.height, 0, 0, c.width, c.height)
      pages.push(await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Snapshot failed'))), 'image/png')))
    }
    return imagesToPdfBlob(pages, { pageSize: 'fit', orientation: 'auto', margin: 0, dpi: 192 })
  } finally {
    host.remove()
  }
}

export async function docxToPdfBlob(file: Blob, name = 'document'): Promise<Blob> {
  const mammoth = await import('mammoth/mammoth.browser')
  const buffer = await file.arrayBuffer()
  let html: string
  try {
    const res = await mammoth.convertToHtml({ arrayBuffer: buffer })
    html = res.value
  } catch (e) {
    throw new AppError('unreadable', 'Unable to read this DOCX file. It may be damaged or password protected.', (e as Error).message)
  }
  return htmlToPdfBlob(html, { title: name.replace(/\.[^.]+$/, '') })
}

export async function xlsxToPdfBlob(file: Blob, name = 'spreadsheet'): Promise<Blob> {
  const XLSX = await import('xlsx')
  let wb
  try {
    wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true })
  } catch (e) {
    throw new AppError('unreadable', 'Unable to read this spreadsheet.', (e as Error).message)
  }
  const blocks: Block[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' }) as unknown[][]
    if (!rows.length) continue
    blocks.push({ type: 'heading', level: 2, runs: [{ text: sheetName }] })
    const width = Math.max(...rows.map((r) => r.length))
    // Very wide sheets are split into column groups so text stays legible.
    const group = 8
    for (let c0 = 0; c0 < width; c0 += group) {
      const table: Block = {
        type: 'table',
        header: true,
        rows: rows.slice(0, 5000).map((r) => Array.from({ length: Math.min(group, width - c0) }, (_, k) => [{ text: String(r[c0 + k] ?? '') }])),
      }
      blocks.push(table)
    }
  }
  if (!blocks.length) throw new AppError('invalid-input', 'The spreadsheet has no data.')
  return blocksToPdfBlob(blocks, { fontSize: 9, margin: 36, title: name.replace(/\.[^.]+$/, '') })
}

export async function canvasToPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error('Canvas export failed'))), 'image/png'))
  return imagesToPdfBlob([blob], { pageSize: 'fit', orientation: 'auto', margin: 0, dpi: 96 })
}

/** Reads any supported non-PDF file and converts it to a PDF blob. */
export async function convertFileToPdf(file: File): Promise<{ blob: Blob; kind: string }> {
  const kind = await detectFile(file)
  switch (kind) {
    case 'text':
      return { blob: await textToPdfBlob(await file.text(), { title: file.name }), kind }
    case 'html':
      return { blob: await htmlToPdfBlob(await file.text(), { title: file.name }), kind }
    case 'docx':
      return { blob: await docxToPdfBlob(file, file.name), kind }
    case 'xlsx':
      return { blob: await xlsxToPdfBlob(file, file.name), kind }
    case 'png':
    case 'jpeg':
    case 'webp':
    case 'tiff':
      return { blob: await imagesToPdfBlob([file]), kind }
    default:
      throw new AppError('unsupported', `${file.name}: this file type is not supported. Supported: PDF, PNG, JPG, WEBP, TIFF (browser-dependent), TXT, HTML, DOCX, XLSX.`)
  }
}
