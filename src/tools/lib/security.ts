import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from 'pdf-lib'
import { collectGarbage } from '@/engine/assemble'
import { canvasBytes, closePdf, isPasswordError, loadDoc, openPdfjs, renderPage, saveDoc } from './pdf'

/* ------------------------------------------------------------ encryption */

export interface EncryptOptions {
  userPassword: string
  ownerPassword: string
  algorithm: 'AES-256' | 'AES-128'
  allowPrint: boolean
  allowCopy: boolean
  allowModify: boolean
  allowAnnotate: boolean
  allowForms: boolean
}

export async function encryptPdf(bytes: Uint8Array, o: EncryptOptions, currentPassword?: string): Promise<Uint8Array> {
  if (!o.userPassword && !o.ownerPassword) throw new Error('Enter a password')
  const doc = await loadDoc(bytes, currentPassword)
  doc.encrypt({
    userPassword: o.userPassword || undefined,
    ownerPassword: o.ownerPassword || `${o.userPassword}-${crypto.getRandomValues(new Uint32Array(2)).join('')}`,
    algorithm: o.algorithm,
    permissions: {
      printing: o.allowPrint ? 'highResolution' : false,
      copying: o.allowCopy,
      modifying: o.allowModify,
      annotating: o.allowAnnotate,
      fillingForms: o.allowForms,
      contentAccessibility: true,
      documentAssembly: o.allowModify,
    },
  } as never)
  doc.setProducer('OurPDF')
  return doc.save({ useObjectStreams: false, addDefaultPage: false })
}

export interface EncryptionInfo { encrypted: boolean; needsPassword: boolean; restrictions: string[] }

/** Inspects encryption: whether a password is needed to open and which permissions are restricted. */
export async function encryptionInfo(bytes: Uint8Array): Promise<EncryptionInfo> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false })
  } catch {
    return { encrypted: false, needsPassword: false, restrictions: [] }
  }
  if (!doc.isEncrypted) return { encrypted: false, needsPassword: false, restrictions: [] }
  let needsPassword = false
  try {
    await PDFDocument.load(bytes, { password: '', updateMetadata: false, throwOnInvalidObject: false })
  } catch {
    needsPassword = true
  }
  const enc = doc.context.lookup(doc.context.trailerInfo.Encrypt)
  const restrictions: string[] = []
  if (enc instanceof PDFDict) {
    const p = enc.get(PDFName.of('P'))
    if (p instanceof PDFNumber) {
      const v = p.asNumber() >>> 0
      if (!(v & (1 << 2))) restrictions.push('Printing')
      if (!(v & (1 << 3))) restrictions.push('Editing')
      if (!(v & (1 << 4))) restrictions.push('Copying text')
      if (!(v & (1 << 5))) restrictions.push('Annotating')
      if (!(v & (1 << 8))) restrictions.push('Filling forms')
      if (!(v & (1 << 10))) restrictions.push('Assembling pages')
    }
  }
  return { encrypted: true, needsPassword, restrictions }
}

/** Saves a decrypted copy. Owner-password-only files (restrictions) open with an empty password. */
export async function decryptPdf(bytes: Uint8Array, password = ''): Promise<Uint8Array> {
  const doc = await loadDoc(bytes, password)
  return saveDoc(doc)
}

/* -------------------------------------------------------------- metadata */

export interface Metadata { title: string; author: string; subject: string; keywords: string; creator: string; producer: string; creationDate: string; modificationDate: string }
export const EMPTY_META: Metadata = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '', creationDate: '', modificationDate: '' }

const toLocal = (d?: Date) => (d && !Number.isNaN(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')

export async function readMetadata(bytes: Uint8Array, password?: string): Promise<Metadata & { pages: number; xmp: boolean; version: string }> {
  const doc = await loadDoc(bytes, password)
  const head = new TextDecoder().decode(bytes.subarray(0, 16))
  return {
    title: doc.getTitle() ?? '', author: doc.getAuthor() ?? '', subject: doc.getSubject() ?? '', keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '', producer: doc.getProducer() ?? '', creationDate: toLocal(doc.getCreationDate()), modificationDate: toLocal(doc.getModificationDate()),
    pages: doc.getPageCount(), xmp: doc.catalog.has(PDFName.of('Metadata')), version: /%PDF-(\d\.\d)/.exec(head)?.[1] ?? '?',
  }
}

export async function writeMetadata(bytes: Uint8Array, m: Metadata, opts: { stripXmp: boolean }, password?: string): Promise<Uint8Array> {
  const doc = await loadDoc(bytes, password)
  doc.setTitle(m.title, { showInWindowTitleBar: !!m.title })
  doc.setAuthor(m.author)
  doc.setSubject(m.subject)
  doc.setKeywords(m.keywords.split(/[,;]\s*/).filter(Boolean))
  doc.setCreator(m.creator)
  if (m.creationDate) doc.setCreationDate(new Date(m.creationDate))
  if (m.modificationDate) doc.setModificationDate(new Date(m.modificationDate))
  if (opts.stripXmp) doc.catalog.delete(PDFName.of('Metadata'))
  const out = await doc.save({ useObjectStreams: true, addDefaultPage: false })
  if (!m.producer) return out
  const again = await PDFDocument.load(out, { updateMetadata: false })
  again.setProducer(m.producer)
  return again.save({ useObjectStreams: true, addDefaultPage: false })
}

/** Removes the Info dictionary entries and XMP metadata. */
export async function stripMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await loadDoc(bytes)
  const info = doc.context.lookup(doc.context.trailerInfo.Info)
  if (info instanceof PDFDict) for (const k of info.keys()) info.delete(k)
  doc.catalog.delete(PDFName.of('Metadata'))
  doc.catalog.delete(PDFName.of('PieceInfo'))
  for (const p of doc.getPages()) {
    p.node.delete(PDFName.of('PieceInfo'))
    p.node.delete(PDFName.of('Metadata'))
  }
  collectGarbage(doc)
  return doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false } as never)
}

/* --------------------------------------------------------------- flatten */

export interface FlattenOptions { forms: boolean; annotations: boolean; scripts: boolean; keepLinks: boolean }

const num = (o: unknown) => (o instanceof PDFNumber ? o.asNumber() : 0)

function removeScripts(doc: PDFDocument): number {
  let n = 0
  const names = doc.catalog.lookup(PDFName.of('Names'))
  if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) {
    names.delete(PDFName.of('JavaScript'))
    n++
  }
  for (const k of ['OpenAction', 'AA']) if (doc.catalog.has(PDFName.of(k))) {
    doc.catalog.delete(PDFName.of(k))
    n++
  }
  for (const p of doc.getPages()) if (p.node.has(PDFName.of('AA'))) {
    p.node.delete(PDFName.of('AA'))
    n++
  }
  const acro = doc.catalog.lookup(PDFName.of('AcroForm'))
  if (acro instanceof PDFDict) acro.delete(PDFName.of('XFA'))
  return n
}

/** Burns forms and annotation appearances into page content, then removes the interactive objects and scripts. */
export async function flattenPdf(bytes: Uint8Array, o: FlattenOptions, password?: string): Promise<{ bytes: Uint8Array; fields: number; annotations: number; scripts: number }> {
  const doc = await loadDoc(bytes, password)
  let fields = 0
  if (o.forms) {
    try {
      const form = doc.getForm()
      fields = form.getFields().length
      if (fields) {
        try {
          form.updateFieldAppearances()
        } catch {
          /* keep existing appearances */
        }
        form.flatten({ updateFieldAppearances: false })
      }
      doc.catalog.delete(PDFName.of('AcroForm'))
    } catch {
      /* no form */
    }
  }
  let annotations = 0
  if (o.annotations) {
    for (const page of doc.getPages()) {
      const annots = page.node.lookup(PDFName.of('Annots'))
      if (!(annots instanceof PDFArray)) continue
      const keep: unknown[] = []
      for (let i = 0; i < annots.size(); i++) {
        const ref = annots.get(i)
        const a = doc.context.lookup(ref)
        if (!(a instanceof PDFDict)) continue
        const sub = a.lookup(PDFName.of('Subtype'))
        const subtype = sub instanceof PDFName ? sub.asString() : ''
        if (subtype === '/Link' && o.keepLinks) {
          keep.push(ref)
          continue
        }
        if (subtype === '/Widget' && !o.forms) {
          keep.push(ref)
          continue
        }
        if (subtype === '/Popup') continue
        const hidden = (num(a.lookup(PDFName.of('F'))) & 2) !== 0
        const ap = a.lookup(PDFName.of('AP'))
        let normal = ap instanceof PDFDict ? ap.get(PDFName.of('N')) : undefined
        const nObj = normal ? doc.context.lookup(normal) : undefined
        if (nObj instanceof PDFDict && !(nObj instanceof PDFStream)) {
          const as = a.lookup(PDFName.of('AS'))
          normal = as instanceof PDFName ? nObj.get(as) : undefined
        }
        const rect = a.lookup(PDFName.of('Rect'))
        const stream = normal ? doc.context.lookup(normal) : undefined
        if (!hidden && stream instanceof PDFStream && rect instanceof PDFArray && normal instanceof PDFRef) {
          const [x1, y1, x2, y2] = [0, 1, 2, 3].map((k) => num(rect.lookup(k)))
          const bbox = stream.dict.lookup(PDFName.of('BBox'))
          const mtx = stream.dict.lookup(PDFName.of('Matrix'))
          const [bx1, by1, bx2, by2] = bbox instanceof PDFArray ? [0, 1, 2, 3].map((k) => num(bbox.lookup(k))) : [0, 0, x2 - x1, y2 - y1]
          const m = mtx instanceof PDFArray ? [0, 1, 2, 3, 4, 5].map((k) => num(mtx.lookup(k))) : [1, 0, 0, 1, 0, 0]
          const corners = [[bx1, by1], [bx2, by1], [bx1, by2], [bx2, by2]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
          const tx1 = Math.min(...corners.map((c) => c[0]))
          const ty1 = Math.min(...corners.map((c) => c[1]))
          const tw = Math.max(...corners.map((c) => c[0])) - tx1 || 1
          const th = Math.max(...corners.map((c) => c[1])) - ty1 || 1
          const sx = (Math.abs(x2 - x1) || tw) / tw
          const sy = (Math.abs(y2 - y1) || th) / th
          stream.dict.set(PDFName.of('Type'), PDFName.of('XObject'))
          stream.dict.set(PDFName.of('Subtype'), PDFName.of('Form'))
          const name = page.node.newXObject('FlatAP', normal)
          page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, sy, Math.min(x1, x2) - tx1 * sx, Math.min(y1, y2) - ty1 * sy), drawObject(name), popGraphicsState())
        }
        annotations++
      }
      if (keep.length) page.node.set(PDFName.of('Annots'), doc.context.obj(keep as never))
      else page.node.delete(PDFName.of('Annots'))
    }
  }
  const scripts = o.scripts ? removeScripts(doc) : 0
  collectGarbage(doc)
  return { bytes: await saveDoc(doc), fields, annotations, scripts }
}

/* ---------------------------------------------------------------- repair */

export interface RepairResult { bytes: Uint8Array; method: 'rebuilt' | 'rasterized'; pages: number; notes: string[] }

/**
 * Repairs a damaged PDF. First pdf-lib rebuilds the structure (fresh xref, pages copied into a clean document);
 * if that fails, pdf.js – which reconstructs broken cross-reference tables – renders every readable page.
 */
export async function repairPdf(bytes: Uint8Array, onProgress?: (f: number, label: string) => void): Promise<RepairResult> {
  const notes: string[] = []
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  const start = head.indexOf('%PDF-')
  let data = bytes
  if (start > 0) {
    data = bytes.subarray(start)
    notes.push(`Removed ${start} bytes of junk before the PDF header.`)
  } else if (start < 0) notes.push('The file has no PDF header – trying anyway.')
  const tail = new TextDecoder('latin1').decode(data.subarray(Math.max(0, data.length - 2048)))
  if (!tail.includes('%%EOF')) notes.push('The file is truncated (no end-of-file marker).')

  onProgress?.(0.1, 'Rebuilding structure')
  try {
    const src = await PDFDocument.load(data, { ignoreEncryption: false, throwOnInvalidObject: false, updateMetadata: false, password: '' })
    const n = src.getPageCount()
    if (n > 0) {
      const out = await PDFDocument.create({ updateMetadata: false })
      const pages = await out.copyPages(src, src.getPageIndices())
      pages.forEach((p) => out.addPage(p))
      const t = src.getTitle()
      if (t) out.setTitle(t)
      const fixed = await saveDoc(out)
      // verify that a strict reader can open and render the result
      const check = await openPdfjs(fixed)
      const p1 = await check.getPage(1)
      await renderPage(p1, 0.2)
      await closePdf(check)
      notes.push('Rebuilt the cross-reference table and page tree.')
      return { bytes: fixed, method: 'rebuilt', pages: n, notes }
    }
  } catch (e) {
    if (isPasswordError(e)) throw new Error('This PDF is password-protected. Remove the password first.')
    notes.push('The structure could not be rebuilt directly; recovering pages visually.')
  }

  const doc = await openPdfjs(data).catch(() => {
    throw new Error('This file is too damaged to recover – no readable pages were found.')
  })
  const out = await PDFDocument.create({ updateMetadata: false })
  let ok = 0
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i)
      const vp = page.getViewport({ scale: 1 })
      const canvas = await renderPage(page, 2)
      const img = await out.embedJpg(await canvasBytes(canvas, 'image/jpeg', 0.9))
      out.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height })
      ok++
    } catch {
      notes.push(`Page ${i} could not be recovered.`)
    }
    onProgress?.(0.2 + (0.8 * i) / doc.numPages, `Recovering page ${i}`)
  }
  await closePdf(doc)
  if (!ok) throw new Error('No pages could be recovered from this file.')
  notes.push('Recovered pages as images (run OCR afterwards to make the text searchable again).')
  return { bytes: await saveDoc(out), method: 'rasterized', pages: ok, notes }
}
