import { PDFArray, PDFDict, PDFName } from 'pdf-lib'
import { closePdf, loadDoc, openPdfjs, pageText, renderPage, type TextRun } from './pdf'
import { boxesFor, findPii, indexRuns, type Box, type Finding } from './pii'
import { ocrCanvas, ocrRuns } from './ocr'

export interface ScanHit extends Finding { id: number; boxes: Box[] }
export interface ScanResult { hits: ScanHit[]; pages: number; scannedPages: number[]; ocrPages: number[] }

/** Finds PII on every page. Pages without a text layer are OCR'd locally when `ocr` is on. */
export async function scanPdfForPii(bytes: Uint8Array, types: string[], custom: string[], opts: { ocr: boolean; onProgress?: (f: number, l: string) => void }): Promise<ScanResult> {
  const doc = await openPdfjs(bytes)
  const hits: ScanHit[] = []
  const scannedPages: number[] = []
  const ocrPages: number[] = []
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1)
    let runs: TextRun[] = (await pageText(page)).runs
    if (!runs.some((r) => r.str.trim())) {
      scannedPages.push(i)
      if (opts.ocr) {
        const scale = 2.5
        const canvas = await renderPage(page, scale)
        opts.onProgress?.(i / doc.numPages, `Reading scanned page ${i + 1} (OCR)`)
        runs = ocrRuns(await ocrCanvas(canvas), scale)
        canvas.width = canvas.height = 0
        ocrPages.push(i)
      }
    }
    const idx = indexRuns(runs)
    for (const f of findPii(idx.text, i, types, custom)) hits.push({ ...f, id: hits.length, boxes: boxesFor(runs, idx, f.start, f.end) })
    page.cleanup()
    opts.onProgress?.((i + 1) / doc.numPages, `Scanning page ${i + 1} of ${doc.numPages}`)
  }
  const pages = doc.numPages
  await closePdf(doc)
  return { hits, pages, scannedPages, ocrPages }
}

export interface HiddenRisk { id: string; label: string; detail: string; risk: 'high' | 'medium' | 'low' }

/** Looks for hidden information: metadata, XMP, attachments, scripts, forms, comments, hidden layers, external links. */
export async function hiddenRisks(bytes: Uint8Array): Promise<HiddenRisk[]> {
  const doc = await loadDoc(bytes)
  const out: HiddenRisk[] = []
  const meta = [['Author', doc.getAuthor()], ['Creator', doc.getCreator()], ['Producer', doc.getProducer()], ['Title', doc.getTitle()], ['Subject', doc.getSubject()], ['Keywords', doc.getKeywords()]].filter(([, v]) => v)
  if (meta.length) out.push({ id: 'meta', label: 'Document metadata', detail: meta.map(([k, v]) => `${k}: ${v}`).join(' · '), risk: meta.some(([k]) => k === 'Author') ? 'medium' : 'low' })
  const created = doc.getCreationDate()
  if (created) out.push({ id: 'dates', label: 'Timestamps', detail: `Created ${created.toLocaleString()}${doc.getModificationDate() ? `, modified ${doc.getModificationDate()!.toLocaleString()}` : ''}`, risk: 'low' })
  if (doc.catalog.has(PDFName.of('Metadata'))) out.push({ id: 'xmp', label: 'XMP metadata stream', detail: 'May contain editing history, software versions, author names and document IDs.', risk: 'medium' })
  const names = doc.catalog.lookup(PDFName.of('Names'))
  if (names instanceof PDFDict && names.has(PDFName.of('EmbeddedFiles'))) out.push({ id: 'attach', label: 'Embedded attachments', detail: 'Files are hidden inside this PDF. They travel with it when you share it.', risk: 'high' })
  if ((names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) || doc.catalog.has(PDFName.of('OpenAction')) || doc.catalog.has(PDFName.of('AA'))) out.push({ id: 'js', label: 'Scripts or auto-run actions', detail: 'The PDF runs JavaScript or actions when opened.', risk: 'high' })
  if (doc.catalog.has(PDFName.of('OCProperties'))) out.push({ id: 'layers', label: 'Optional content layers', detail: 'Some layers may be hidden in normal viewing but still present.', risk: 'medium' })
  let annots = 0, fields = 0
  const external = new Set<string>()
  for (const p of doc.getPages()) {
    const a = p.node.lookup(PDFName.of('Annots'))
    if (!(a instanceof PDFArray)) continue
    for (let i = 0; i < a.size(); i++) {
      const d = a.lookup(i)
      if (!(d instanceof PDFDict)) continue
      const sub = d.lookup(PDFName.of('Subtype'))?.toString()
      if (sub === '/Link') {
        const act = d.lookup(PDFName.of('A'))
        const uri = act instanceof PDFDict ? act.lookup(PDFName.of('URI')) : undefined
        if (uri) external.add(String(uri.toString()).replace(/^\(|\)$/g, '').slice(0, 80))
      } else if (sub === '/Widget') fields++
      else if (sub !== '/Popup') annots++
    }
  }
  if (annots) out.push({ id: 'annots', label: `${annots} comment${annots > 1 ? 's' : ''} / annotation${annots > 1 ? 's' : ''}`, detail: 'Comments and markup can reveal reviewers’ names and internal notes.', risk: 'medium' })
  if (fields) out.push({ id: 'fields', label: `${fields} form field${fields > 1 ? 's' : ''}`, detail: 'Field values can be edited or extracted by anyone who receives the file.', risk: 'low' })
  if (external.size) out.push({ id: 'links', label: `${external.size} external link${external.size > 1 ? 's' : ''}`, detail: [...external].slice(0, 3).join(', ') + (external.size > 3 ? '…' : ''), risk: 'low' })
  return out
}
