import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { EditObject, PageModel } from '@/types'
import { createText, createShape, createRedact } from '@/lib/object-factory'
import { DEFAULT_LAYER_ID } from '@/types'
import type { ExportPlan, PlanPage } from '@/engine/types'

/** Builds a simple PDF where page i shows the text `${label} ${i+1}`. */
export async function makePdf(pages: number, opts: { label?: string; size?: [number, number]; rotate?: number[] } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage(opts.size ?? [612, 792])
    p.drawText(`${opts.label ?? 'Page'} ${i + 1}`, { x: 72, y: 700, size: 24, font })
    p.drawRectangle({ x: 72, y: 600, width: 100, height: 50, color: rgb(0.8, 0.9, 1) })
    if (opts.rotate?.[i]) p.setRotation({ type: 'degrees' as never, angle: opts.rotate[i] } as never)
  }
  return doc.save()
}

export async function makeFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const form = doc.getForm()
  const tf = form.createTextField('name')
  tf.addToPage(page, { x: 50, y: 700, width: 200, height: 24 })
  tf.setText('Alice')
  const cb = form.createCheckBox('agree')
  cb.addToPage(page, { x: 50, y: 650, width: 16, height: 16 })
  return doc.save()
}

export function pageModel(sourceId: string | null, sourceIndex: number, over: Partial<PageModel> = {}): PageModel {
  return {
    id: `pg-${sourceId}-${sourceIndex}-${Math.random().toString(36).slice(2, 7)}`,
    sourceId,
    sourceIndex,
    width: 612,
    height: 792,
    intrinsic: 0,
    view: [0, 0, 612, 792],
    rotation: 0,
    crop: null,
    frame: null,
    sizeKnown: true,
    ...over,
  }
}

export function planPage(page: PageModel, objects: EditObject[] = [], extra: Partial<PlanPage> = {}): PlanPage {
  return { page, objects, label: '', ...extra }
}

export function basePlan(sources: Record<string, Uint8Array>, pages: PlanPage[], over: Partial<ExportPlan> = {}): ExportPlan {
  const srcs: ExportPlan['sources'] = {}
  for (const [k, v] of Object.entries(sources)) srcs[k] = { bytes: v }
  return {
    sources: srcs,
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
    now: Date.UTC(2026, 0, 15, 12, 0, 0),
    ...over,
  }
}

export { createText, createShape, createRedact, DEFAULT_LAYER_ID }

/** Text per page from PDF bytes, using pdf.js (legacy build works in Node). */
export async function extractTexts(bytes: Uint8Array, password?: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: bytes.slice(), password, useSystemFonts: true, verbosity: 0 })
  const doc = await task.promise
  const out: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    out.push(tc.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim())
  }
  await task.destroy()
  return out
}
