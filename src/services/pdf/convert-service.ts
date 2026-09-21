import { escapeHtml } from '@/lib/html'
import { getObjects } from '@/stores/annotation-store'
import { getPages } from '@/stores/page-store'
import { getDoc } from '@/stores/pdf-store'
import type { PageModel } from '@/types'
import { sanitizeFilename, stripExtension } from '@/utils/file'
import { bytesToBlob, saveBlob } from '../download'
import { exportPdfBytes } from './export-service'
import { canvasToBlob, renderPageToCanvas } from './renderer'
import { destroySource, getSource, openSource } from './sources'
import { getPageText, groupLines } from './text'
import type { TaskContext } from '../tasks'

export interface ImageExportOptions {
  format: 'png' | 'jpeg'
  /** DPI (72 = 1 px per pt). */
  dpi: number
  quality: number
  /** Render the edited document (annotations, forms, text edits) rather than the untouched source pages. */
  includeEdits: boolean
}

/** Exports pages to PNG/JPG (zipped when more than one). */
export async function exportPagesAsImages(docId: string, indices: number[], opts: ImageExportOptions, ctx: TaskContext): Promise<number> {
  const doc = getDoc(docId)
  const pages = getPages(docId)
  if (!doc || !indices.length) return 0
  const base = sanitizeFilename(stripExtension(doc.name))
  const ids = indices.map((i) => pages[i]?.id).filter(Boolean)
  let temp: { id: string; models: PageModel[] } | null = null
  let models: PageModel[]
  if (opts.includeEdits) {
    const bytes = await exportPdfBytes(docId, { pageIds: ids, signal: ctx.signal, onProgress: (f) => ctx.progress(f * 0.3, 'Preparing') })
    const src = await openSource(bytesToBlob(bytes), 'export.pdf')
    const ms: PageModel[] = []
    for (let i = 0; i < src.numPages; i++) {
      const p = await src.proxy.getPage(i + 1)
      const vp = p.getViewport({ scale: 1 })
      ms.push({ id: `t${i}`, sourceId: src.id, sourceIndex: i, width: vp.width, height: vp.height, intrinsic: 0, view: [0, 0, vp.width, vp.height], rotation: 0, crop: null, frame: null, sizeKnown: true })
      p.cleanup()
    }
    models = ms
    temp = { id: src.id, models: ms }
  } else {
    models = ids.map((id) => pages.find((p) => p.id === id)!)
  }
  const type = opts.format === 'png' ? 'image/png' : 'image/jpeg'
  const ext = opts.format === 'png' ? 'png' : 'jpg'
  const files: { name: string; blob: Blob }[] = []
  try {
    for (let i = 0; i < models.length; i++) {
      if (ctx.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const canvas = await renderPageToCanvas(models[i], opts.dpi / 72, { annotationMode: 'forms' })
      files.push({ name: `${base}-page-${String(indices[i] + 1).padStart(String(pages.length).length, '0')}.${ext}`, blob: await canvasToBlob(canvas, type, opts.quality) })
      canvas.width = canvas.height = 0
      ctx.progress(0.3 + ((i + 1) / models.length) * 0.7, `Page ${i + 1} of ${models.length}`)
    }
  } finally {
    if (temp) await destroySource(temp.id)
  }
  if (files.length === 1) await saveBlob(files[0].blob, files[0].name)
  else {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    for (const f of files) zip.file(f.name, f.blob)
    await saveBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${base}-images.zip`)
  }
  return files.length
}

/** Reading-order text of a page: extracted text, then any text the user overlaid, then OCR text. */
export async function pageText(docId: string, page: PageModel): Promise<string> {
  const doc = getDoc(docId)
  const parts: string[] = []
  const pt = await getPageText(page)
  if (pt.index.text.trim()) parts.push(pt.index.text.trim())
  const overlay = getObjects(docId).filter((o) => o.pageId === page.id && o.type === 'text' && o.text.trim()).map((o) => (o as { text: string }).text)
  if (overlay.length) parts.push(overlay.join('\n'))
  if (!pt.index.text.trim() && doc?.ocr[page.id]) parts.push(doc.ocr[page.id].text)
  return parts.join('\n')
}

export async function exportText(docId: string, indices: number[], ctx: TaskContext): Promise<string> {
  const pages = getPages(docId)
  const out: string[] = []
  for (let k = 0; k < indices.length; k++) {
    const p = pages[indices[k]]
    if (!p) continue
    out.push(`--- Page ${indices[k] + 1} ---\n${await pageText(docId, p)}`)
    ctx.progress((k + 1) / indices.length)
  }
  return out.join('\n\n')
}

export async function exportHtml(docId: string, indices: number[], ctx: TaskContext): Promise<string> {
  const doc = getDoc(docId)
  const pages = getPages(docId)
  const sections: string[] = []
  for (let k = 0; k < indices.length; k++) {
    const p = pages[indices[k]]
    if (!p) continue
    const pt = await getPageText(p)
    const lines = groupLines(pt.items)
    const paras: string[] = []
    let cur: string[] = []
    let prevBottom = -1
    let prevH = 0
    for (const line of lines) {
      const items = line.map((i) => pt.items[i])
      const top = Math.min(...items.map((i) => i.rect.y))
      const h = Math.max(...items.map((i) => i.size))
      const text = items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
      if (!text) continue
      if (prevBottom >= 0 && top - prevBottom > Math.max(prevH, h) * 0.9 && cur.length) {
        paras.push(cur.join(' '))
        cur = []
      }
      cur.push(text)
      prevBottom = Math.max(...items.map((i) => i.rect.y + i.rect.h))
      prevH = h
    }
    if (cur.length) paras.push(cur.join(' '))
    const ocr = !paras.length && doc?.ocr[p.id] ? doc.ocr[p.id].text.split(/\n{2,}/) : []
    sections.push(`<section class="page" id="page-${indices[k] + 1}"><h2>Page ${indices[k] + 1}</h2>\n${[...paras, ...ocr].map((t) => `<p>${escapeHtml(t)}</p>`).join('\n')}</section>`)
    ctx.progress((k + 1) / indices.length)
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc?.name ?? 'Document')}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111}.page{border-top:1px solid #ddd;padding-top:1rem;margin-top:2rem}h2{font-size:.9rem;color:#666;text-transform:uppercase;letter-spacing:.05em}</style>
</head><body>
<h1>${escapeHtml(stripExtension(doc?.name ?? 'Document'))}</h1>
${sections.join('\n')}
</body></html>`
}

export { getSource }
