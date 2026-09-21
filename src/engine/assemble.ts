import {
  PDFArray,
  PDFBool,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFPage,
  PDFRadioGroup,
  PDFRef,
  PDFStream,
  PDFString,
  PDFTextField,
  degrees,
  rgb,
  type PDFImage,
} from 'pdf-lib'
import { baseRectToPdf, baseToPdf, effectiveCrop, type Placement } from '@/lib/geometry'
import { boxesRegion, placementFor, usesBoxesOnly } from '@/lib/frame'
import { hexToUnit } from '@/utils/color'
import type { EditObject, FieldObj, PageLabelRange, PageModel } from '@/types'
import { drawInvisibleText, drawObject, preloadFonts, type DrawEnv, type LinkRequest, type NoteRequest } from './draw'
import { FontProvider, canEncode, embedsWhole } from './fonts'
import type { ExportPlan, PlanBookmark, ProgressFn } from './types'

export interface AbortSignalLike {
  aborted: boolean
}

function checkAbort(sig?: AbortSignalLike) {
  if (sig?.aborted) {
    const e = new Error('Cancelled')
    e.name = 'AbortError'
    throw e
  }
}

const isFieldObj = (o: EditObject): o is FieldObj => o.type === 'field'

/** Blocks script/data URLs; only http(s), mailto and tel are allowed as link targets. */
export function safeUri(uri: string): string | null {
  const u = uri.trim()
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(u)) return `mailto:${u}`
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(u)) return `https://${u}`
  return null
}

export async function assemble(plan: ExportPlan, onProgress: ProgressFn = () => {}, signal?: AbortSignalLike): Promise<Uint8Array> {
  const userFonts = Object.keys(plan.fonts).some((k) => !embedsWhole(k))
  try {
    return await assembleOnce(plan, onProgress, signal, true)
  } catch (e) {
    if (!userFonts || (e as Error).name === 'AbortError') throw e
    // fontkit's TrueType subsetter fails for some fonts/runtimes: retry embedding the fonts whole.
    return assembleOnce(plan, onProgress, signal, false)
  }
}

async function assembleOnce(plan: ExportPlan, onProgress: ProgressFn, signal: AbortSignalLike | undefined, subsetFonts: boolean): Promise<Uint8Array> {
  const nPages = plan.pages.length
  if (!nPages) throw new Error('Nothing to export: the document has no pages.')

  /* ---- load sources that are actually needed ---- */
  const needed = [...new Set(plan.pages.filter((p) => !p.raster && p.page.sourceId).map((p) => p.page.sourceId as string))]
  const srcDocs = new Map<string, PDFDocument>()
  for (const id of needed) {
    const s = plan.sources[id]
    if (!s) throw new Error('Source file is no longer available in memory.')
    try {
      srcDocs.set(id, await PDFDocument.load(s.bytes, { password: s.password ?? '', updateMetadata: false, throwOnInvalidObject: false }))
    } catch (e) {
      const msg = (e as Error).message ?? ''
      if (/encrypt|password/i.test(msg)) throw new Error('Encrypted PDF is not supported by this operation without the correct password.')
      throw e
    }
    checkAbort(signal)
  }

  /* ---- native form-field values / removals; decide the build strategy ---- */
  const nativeByName = new Map<string, FieldObj[]>()
  for (const p of plan.pages) for (const o of p.objects) if (isFieldObj(o) && o.native && p.page.sourceId) {
    const key = `${p.page.sourceId}\u0000${o.fieldName}`
    nativeByName.set(key, [...(nativeByName.get(key) ?? []), o])
  }
  const sourceHasForm = new Map<string, boolean>()
  for (const [id, doc] of srcDocs) {
    let has = false
    try {
      has = doc.catalog.has(PDFName.of('AcroForm')) && doc.getForm().getFields().length > 0
    } catch {
      has = false
    }
    sourceHasForm.set(id, has)
  }
  const inPlace = needed.length === 1 && !plan.pages.some((p) => p.raster) && !plan.options.flattenForms && sourceHasForm.get(needed[0]) === true
  const flattenSource = (id: string) => plan.options.flattenForms || (!inPlace && needed.length > 0 && sourceHasForm.get(id) === true)

  const helvSrcFonts = new Map<string, FontProvider>()
  for (const [id, doc] of srcDocs) {
    if (!sourceHasForm.get(id)) continue
    const form = doc.getForm()
    for (const [key, objs] of nativeByName) {
      const [sid, name] = key.split('\u0000')
      if (sid !== id) continue
      const field = form.getFieldMaybe(name)
      if (!field) continue
      try {
        if (field instanceof PDFTextField) field.setText(String(objs[0].value ?? ''))
        else if (field instanceof PDFCheckBox) {
          if (objs[0].value) field.check()
          else field.uncheck()
        }
        else if (field instanceof PDFRadioGroup) {
          const sel = objs.find((o) => o.value === true)
          if (sel) field.select(sel.exportValue)
          else field.clear()
        } else if (field instanceof PDFDropdown) {
          const v = String(objs[0].value ?? '')
          if (v) field.select(v)
        } else if (field instanceof PDFOptionList) {
          const v = String(objs[0].value ?? '')
          if (v) field.select(v)
        }
      } catch {
        /* value not representable in this field – leave the original */
      }
    }
    for (const r of plan.removedFields) {
      if (r.sourceId !== id) continue
      const f = form.getFieldMaybe(r.name)
      if (f) form.removeField(f)
    }
    if (flattenSource(id)) {
      const fp = new FontProvider(doc)
      helvSrcFonts.set(id, fp)
      const helv = await fp.ensure('helvetica')
      form.updateFieldAppearances(helv)
      form.flatten()
    }
  }

  const out = inPlace ? srcDocs.get(needed[0])! : await PDFDocument.create({ updateMetadata: false })
  const fonts = new FontProvider(out, plan.fonts)
  fonts.subsetFonts = subsetFonts
  await fonts.ensure('helvetica', false, false)
  await fonts.ensure('helvetica', true, false)

  /* ---- gather / create output pages ---- */
  interface OutPage {
    page: PDFPage
    pl: Placement
    baseW: number
    baseH: number
    plan: (typeof plan.pages)[number]
    links: LinkRequest[]
    notes: NoteRequest[]
  }
  const outPages: OutPage[] = []

  // Batch-copy first occurrences per source (keeps shared resources shared); duplicates are copied separately.
  const copied = new Map<number, PDFPage>() // plan index → page
  if (!inPlace) {
    for (const id of needed) {
      const doc = srcDocs.get(id)!
      const firstIdx = new Map<number, number>() // sourceIndex → plan index
      const dupes: number[] = []
      plan.pages.forEach((p, i) => {
        if (p.raster || p.page.sourceId !== id) return
        if (firstIdx.has(p.page.sourceIndex)) dupes.push(i)
        else firstIdx.set(p.page.sourceIndex, i)
      })
      const entries = [...firstIdx.entries()]
      const idxs = entries.map(([si]) => si)
      const count = doc.getPageCount()
      for (const si of idxs) if (si < 0 || si >= count) throw new Error(`Page ${si + 1} does not exist in the source file.`)
      const pages = await out.copyPages(doc, idxs)
      entries.forEach(([, pi], k) => copied.set(pi, pages[k]))
      for (const pi of dupes) {
        const [pg] = await out.copyPages(doc, [plan.pages[pi].page.sourceIndex])
        copied.set(pi, pg)
      }
      checkAbort(signal)
    }
  } else {
    const doc = out
    const original = doc.getPages()
    const used = new Set<number>()
    for (let i = 0; i < nPages; i++) {
      const p = plan.pages[i]
      if (!p.page.sourceId) continue
      const si = p.page.sourceIndex
      if (!used.has(si)) {
        used.add(si)
        copied.set(i, original[si])
      } else {
        const [pg] = await doc.copyPages(doc, [si])
        copied.set(i, pg)
      }
    }
    for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i)
  }

  const imageCache = new Map<string, PDFImage>()
  const embeddedByKey = new Map<string, PDFImage>()
  const embedPlanImage = async (key: string): Promise<PDFImage | null> => {
    const hit = embeddedByKey.get(key)
    if (hit) return hit
    const data = plan.images[key]
    if (!data) return null
    const img = data.mime === 'image/jpeg' ? await out.embedJpg(data.bytes) : await out.embedPng(data.bytes)
    embeddedByKey.set(key, img)
    return img
  }

  for (let i = 0; i < nPages; i++) {
    checkAbort(signal)
    const pp = plan.pages[i]
    const model = pp.page
    let page: PDFPage
    let intrinsic: PageModel['intrinsic'] = model.intrinsic
    let view = model.view
    if (pp.raster) {
      page = out.addPage([model.width, model.height])
      const img = pp.raster.mime === 'image/jpeg' ? await out.embedJpg(pp.raster.bytes) : await out.embedPng(pp.raster.bytes)
      page.drawImage(img, { x: 0, y: 0, width: model.width, height: model.height })
      intrinsic = 0
      view = [0, 0, model.width, model.height]
    } else if (!model.sourceId) {
      page = out.addPage([model.width, model.height])
      intrinsic = 0
      view = [0, 0, model.width, model.height]
    } else {
      page = copied.get(i)!
      out.addPage(page)
    }
    const gp: PageModel = { ...model, intrinsic, view }
    let pl: Placement
    if (usesBoxesOnly(gp)) {
      pl = placementFor(gp)
      const region = boxesRegion(gp)
      const r = baseRectToPdf(pl, region)
      if (model.frame || model.crop) {
        page.setMediaBox(r.x, r.y, r.w, r.h)
        page.setCropBox(r.x, r.y, r.w, r.h)
        for (const k of ['TrimBox', 'BleedBox', 'ArtBox']) page.node.delete(PDFName.of(k))
      }
    } else {
      const crop = effectiveCrop(gp)
      const srcPl: Placement = { intrinsic, view, s: 1, ox: 0, oy: 0 }
      const bb = baseRectToPdf(srcPl, crop)
      const embedded = await out.embedPage(page, { left: bb.x, bottom: bb.y, right: bb.x + bb.w, top: bb.y + bb.h })
      pl = placementFor(gp)
      const dest = baseRectToPdf(pl, crop)
      const swap = intrinsic === 90 || intrinsic === 270
      const f = model.frame!
      const np = out.addPage([swap ? f.h : f.w, swap ? f.w : f.h])
      np.drawPage(embedded, { x: dest.x, y: dest.y, xScale: f.s, yScale: f.s })
      // remove the original (now unreferenced) page from the tree
      const idx = out.getPages().indexOf(page)
      if (idx >= 0) out.removePage(idx)
      page = np
    }
    const totalRot = (((intrinsic + model.rotation) % 360) + 360) % 360
    page.setRotation(degrees(totalRot))

    /* objects */
    const objs = pp.objects.filter((o) => !isFieldObj(o))
    await preloadFonts(fonts, objs)
    for (const o of objs) {
      if (o.type === 'image') {
        const key = plan.imageKeys[o.id]
        const img = key ? await embedPlanImage(key) : null
        if (img) imageCache.set(`image:${o.id}`, img)
      } else if (o.type === 'text' && plan.textRasters[o.id]) {
        const r = plan.textRasters[o.id]
        imageCache.set(`raster:${o.id}`, await out.embedPng(r.bytes))
      }
    }
    const links: LinkRequest[] = []
    const notes: NoteRequest[] = []
    const env: DrawEnv = {
      doc: out,
      page,
      pl,
      baseW: model.width,
      baseH: model.height,
      tokens: { page: i + 1, total: nPages, label: pp.label, date: new Date(plan.now), batesIndex: i },
      fonts,
      plan,
      imageCache,
      links,
      notes,
    }
    for (const o of objs) await drawObject(env, o)
    if (pp.invisibleText?.length) {
      const font = fonts.get('helvetica', false, false)
      for (const run of pp.invisibleText) drawInvisibleText(page, pl, font, run)
    }
    outPages.push({ page, pl, baseW: model.width, baseH: model.height, plan: pp, links, notes })
    onProgress(((i + 1) / nPages) * 0.85, `Page ${i + 1} of ${nPages}`)
    if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0))
  }

  /* ---- native annotations: links & notes ---- */
  const ctx = out.context
  for (const op of outPages) {
    for (const l of op.links) {
      const r = baseRectToPdf(op.pl, l.rect)
      const dict: Record<string, unknown> = { Type: 'Annot', Subtype: 'Link', Rect: [r.x, r.y, r.x + r.w, r.y + r.h], F: 4 }
      const b = l.border
      const bw = b && b.style !== 'none' ? b.width : 0
      dict.Border = [0, 0, bw]
      if (bw > 0 && b) dict.C = hexToUnit(b.color)
      if (l.target.kind === 'page') {
        const idx = plan.pages.findIndex((p) => p.page.id === l.target.pageId)
        const target = outPages[idx]
        if (!target) continue
        const [, top] = baseToPdf(target.pl, 0, 0)
        dict.Dest = [target.page.ref, PDFName.of('XYZ'), null, top, null]
      } else {
        const uri = l.target.kind === 'email' ? safeUri(`mailto:${l.target.address ?? ''}${l.target.subject ? `?subject=${encodeURIComponent(l.target.subject)}` : ''}`) : safeUri(l.target.url ?? '')
        if (!uri) continue
        dict.A = { Type: 'Action', S: 'URI', URI: PDFString.of(uri) }
      }
      op.page.node.addAnnot(ctx.register(ctx.obj(dict as never)))
    }
    for (const n of op.notes) {
      const r = baseRectToPdf(op.pl, n.rect)
      const annot = ctx.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [r.x, r.y, r.x + r.w, r.y + r.h],
        Contents: PDFHexString.fromText(n.text || ' '),
        T: PDFHexString.fromText(n.author || ''),
        Name: 'Note',
        C: hexToUnit(n.color),
        F: 28,
      } as never)
      op.page.node.addAnnot(ctx.register(annot))
    }
  }

  /* ---- new form fields ---- */
  const newFields: { o: FieldObj; op: OutPage }[] = []
  outPages.forEach((op) => {
    for (const o of op.plan.objects) if (isFieldObj(o) && !o.native) newFields.push({ o, op })
  })
  if (newFields.length) await writeFormFields(out, fonts, newFields)
  const form = sourceHasForm.get(needed[0] ?? '') || newFields.length ? safeGetForm(out) : null
  if (form) {
    try {
      const helv = await fonts.ensure('helvetica')
      form.updateFieldAppearances(helv)
      if (plan.options.flattenForms) form.flatten()
    } catch {
      /* appearance generation is best-effort */
    }
  }

  /* ---- document-level structures ---- */
  writeOutline(out, plan.bookmarks, outPages)
  writePageLabels(out, plan.pageLabels, nPages)
  for (const a of plan.attachments) await out.attach(a.bytes, a.name, { mimeType: guessMime(a.name) })

  if (!plan.removeMetadata && plan.metadata) {
    const m = plan.metadata
    if (m.title) out.setTitle(m.title)
    if (m.author) out.setAuthor(m.author)
    if (m.subject) out.setSubject(m.subject)
    if (m.keywords) out.setKeywords(m.keywords.split(/[,;]\s*/).filter(Boolean))
    if (m.creator) out.setCreator(m.creator)
    out.setProducer(m.producer || plan.options.producer)
    if (m.creationDate) out.setCreationDate(new Date(m.creationDate))
    out.setModificationDate(m.modificationDate ? new Date(m.modificationDate) : new Date(plan.now))
  } else if (!plan.removeMetadata) {
    out.setProducer(plan.options.producer)
    out.setModificationDate(new Date(plan.now))
  } else {
    // stripped: drop Info entries and XMP that an in-place document may carry
    stripMetadata(out)
  }

  // Embedded pages/fonts/images are written lazily; flush them before pruning so their sources are still reachable.
  await out.flush()
  collectGarbage(out)
  onProgress(0.92, 'Serialising')

  const sec = plan.options.security
  if (sec && (sec.userPassword || sec.ownerPassword || !sec.allowPrint || !sec.allowCopy || !sec.allowModify || !sec.allowAnnotate)) {
    out.encrypt({
      userPassword: sec.userPassword || undefined,
      ownerPassword: sec.ownerPassword || (sec.userPassword ? `${sec.userPassword}-owner-${Math.random().toString(36).slice(2, 10)}` : `owner-${Math.random().toString(36).slice(2, 12)}`),
      permissions: {
        printing: sec.allowPrint ? 'highResolution' : false,
        copying: sec.allowCopy,
        modifying: sec.allowModify,
        annotating: sec.allowAnnotate,
        fillingForms: sec.allowAnnotate,
        contentAccessibility: true,
        documentAssembly: sec.allowModify,
      },
    })
  }
  const bytes = await out.save({ useObjectStreams: plan.options.objectStreams && !(sec && (sec.userPassword || sec.ownerPassword)), addDefaultPage: false })
  onProgress(1, 'Done')
  return bytes
}

function safeGetForm(doc: PDFDocument) {
  try {
    return doc.getForm()
  } catch {
    return null
  }
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = { txt: 'text/plain', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', csv: 'text/csv', json: 'application/json', xml: 'application/xml', html: 'text/html', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip' }
  return (ext && map[ext]) || 'application/octet-stream'
}

/* ------------------------------------------------------------------ forms */

async function writeFormFields(out: PDFDocument, fonts: FontProvider, fields: { o: FieldObj; op: { page: PDFPage; pl: Placement } }[]) {
  const form = out.getForm()
  const font = await fonts.ensure('helvetica')
  const used = new Set<string>()
  try {
    for (const f of form.getFields()) used.add(f.getName())
  } catch {
    /* none */
  }
  const unique = (base: string) => {
    let n = base || 'field'
    let i = 1
    while (used.has(n)) n = `${base || 'field'}_${i++}`
    used.add(n)
    return n
  }
  const ordered = fields.slice().sort((a, b) => a.o.tabIndex - b.o.tabIndex)
  const radioGroups = new Map<string, PDFRadioGroup>()
  for (const { o, op } of ordered) {
    const r = baseRectToPdf(op.pl, o)
    const common = { x: r.x, y: r.y, width: r.w, height: r.h, borderWidth: 1, borderColor: rgb(0.3, 0.3, 0.3), backgroundColor: rgb(0.96, 0.97, 1) }
    const setMeta = (field: { acroField: { dict: PDFDict } }) => {
      if (o.tooltip) field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(o.tooltip))
    }
    try {
      switch (o.ftype) {
        case 'text':
        case 'date': {
          const tf = form.createTextField(unique(o.fieldName))
          if (o.multiline) tf.enableMultiline()
          if (o.validation.kind === 'maxlength' && o.validation.max) tf.setMaxLength(o.validation.max)
          if (o.value) tf.setText(String(o.value))
          tf.setFontSize(o.fontSize || 11)
          tf.addToPage(op.page, { ...common, font })
          if (o.required) tf.enableRequired()
          if (o.readOnly) tf.enableReadOnly()
          if (o.defaultValue) tf.acroField.dict.set(PDFName.of('DV'), PDFHexString.fromText(String(o.defaultValue)))
          setMeta(tf)
          break
        }
        case 'checkbox': {
          const cb = form.createCheckBox(unique(o.fieldName))
          cb.addToPage(op.page, common)
          if (o.value === true) cb.check()
          if (o.required) cb.enableRequired()
          if (o.readOnly) cb.enableReadOnly()
          setMeta(cb)
          break
        }
        case 'radio': {
          const name = o.fieldName || 'radio'
          let g = radioGroups.get(name)
          if (!g) {
            g = form.createRadioGroup(unique(name))
            radioGroups.set(name, g)
            if (o.required) g.enableRequired()
            if (o.readOnly) g.enableReadOnly()
            setMeta(g)
          }
          g.addOptionToPage(o.exportValue || 'Choice', op.page, common)
          if (o.value === true) g.select(o.exportValue || 'Choice')
          break
        }
        case 'dropdown': {
          const dd = form.createDropdown(unique(o.fieldName))
          dd.addOptions(o.options.length ? o.options : [' '])
          dd.addToPage(op.page, { ...common, font })
          if (o.value && o.options.includes(String(o.value))) dd.select(String(o.value))
          if (o.required) dd.enableRequired()
          if (o.readOnly) dd.enableReadOnly()
          setMeta(dd)
          break
        }
        case 'listbox': {
          const ol = form.createOptionList(unique(o.fieldName))
          ol.addOptions(o.options.length ? o.options : [' '])
          ol.addToPage(op.page, { ...common, font })
          if (o.value && o.options.includes(String(o.value))) ol.select(String(o.value))
          if (o.required) ol.enableRequired()
          if (o.readOnly) ol.enableReadOnly()
          setMeta(ol)
          break
        }
        case 'button': {
          const btn = form.createButton(unique(o.fieldName))
          btn.addToPage(o.label || 'Button', op.page, { ...common, font, backgroundColor: rgb(0.88, 0.9, 0.95) })
          setMeta(btn)
          break
        }
        case 'signature': {
          // pdf-lib has no signature-field helper: create a /Sig widget by hand (unsigned, fillable in Acrobat).
          const ctx = out.context
          const name = unique(o.fieldName || 'signature')
          const ref = ctx.register(
            ctx.obj({
              Type: 'Annot',
              Subtype: 'Widget',
              FT: 'Sig',
              T: PDFHexString.fromText(name),
              Rect: [r.x, r.y, r.x + r.w, r.y + r.h],
              F: 4,
              P: op.page.ref,
              MK: { BC: [0.3, 0.3, 0.3], BG: [0.96, 0.97, 1] },
              ...(o.tooltip ? { TU: PDFHexString.fromText(o.tooltip) } : {}),
            } as never),
          )
          op.page.node.addAnnot(ref)
          const acro = form.acroForm.dict
          let fieldsArr = acro.lookup(PDFName.of('Fields')) as PDFArray | undefined
          if (!fieldsArr) {
            fieldsArr = ctx.obj([]) as PDFArray
            acro.set(PDFName.of('Fields'), fieldsArr)
          }
          fieldsArr.push(ref)
          break
        }
      }
    } catch (e) {
      // A single bad field must never sink the export; surface it as a thrown warning only for the caller log.
      console.warn('Form field skipped:', o.fieldName, e)
    }
  }
  void canEncode
}

/* ---------------------------------------------------------------- outline */

function writeOutline(out: PDFDocument, items: PlanBookmark[], pages: { page: PDFPage; pl: Placement }[]) {
  if (!items.length) return
  const ctx = out.context
  const rootRef = ctx.nextRef()
  const build = (list: PlanBookmark[], parentRef: PDFRef): { first: PDFRef; last: PDFRef; count: number } | null => {
    if (!list.length) return null
    const refs = list.map(() => ctx.nextRef())
    let total = 0
    list.forEach((b, i) => {
      const dict = ctx.obj({ Title: PDFHexString.fromText(b.title || 'Untitled'), Parent: parentRef }) as PDFDict
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1])
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1])
      const target = b.pageIndex != null ? pages[b.pageIndex] : undefined
      if (target) {
        const top = b.y > 0 ? baseToPdf(target.pl, 0, b.y)[1] : null
        dict.set(PDFName.of('Dest'), ctx.obj([target.page.ref, PDFName.of(top == null ? 'Fit' : 'XYZ'), ...(top == null ? [] : [null, top, null])]))
      }
      const kids = build(b.children, refs[i])
      if (kids) {
        dict.set(PDFName.of('First'), kids.first)
        dict.set(PDFName.of('Last'), kids.last)
        dict.set(PDFName.of('Count'), PDFNumber.of(kids.count))
      }
      ctx.assign(refs[i], dict)
      total += 1 + (kids?.count ?? 0)
    })
    return { first: refs[0], last: refs[refs.length - 1], count: total }
  }
  const res = build(items, rootRef)
  if (!res) return
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: res.first, Last: res.last, Count: res.count } as never))
  out.catalog.set(PDFName.of('Outlines'), rootRef)
}

/* ------------------------------------------------------------ page labels */

function writePageLabels(out: PDFDocument, ranges: PageLabelRange[], nPages: number) {
  const valid = ranges.filter((r) => r.from >= 0 && r.from < nPages).sort((a, b) => a.from - b.from)
  if (!valid.length) return
  const ctx = out.context
  const styleCode: Record<string, string | undefined> = { decimal: 'D', roman: 'r', ROMAN: 'R', alpha: 'a', ALPHA: 'A', none: undefined }
  const nums: unknown[] = []
  if (valid[0].from > 0) nums.push(0, ctx.obj({ S: 'D' }))
  for (const r of valid) {
    const d: Record<string, unknown> = {}
    const s = styleCode[r.style]
    if (s) d.S = s
    if (r.prefix) d.P = PDFString.of(r.prefix)
    if (r.start !== 1) d.St = r.start
    nums.push(r.from, ctx.obj(d as never))
  }
  out.catalog.set(PDFName.of('PageLabels'), ctx.obj({ Nums: nums } as never))
}

/* -------------------------------------------------------- housekeeping */

function stripMetadata(doc: PDFDocument) {
  const ctx = doc.context
  const info = ctx.lookup(ctx.trailerInfo.Info)
  if (info instanceof PDFDict) for (const [k] of info.entries()) info.delete(k)
  doc.catalog.delete(PDFName.of('Metadata'))
  doc.catalog.delete(PDFName.of('PieceInfo'))
  for (const page of doc.getPages()) {
    page.node.delete(PDFName.of('Metadata'))
    page.node.delete(PDFName.of('PieceInfo'))
  }
}

/**
 * Removes every indirect object that is not reachable from the trailer. Objects orphaned by deleting pages would
 * otherwise still be written to the file – a privacy leak – so this runs before every save.
 */
export function collectGarbage(doc: PDFDocument): number {
  const ctx = doc.context
  const seen = new Set<PDFRef>()
  const stack: unknown[] = []
  const push = (o: unknown) => {
    if (o instanceof PDFRef) {
      if (!seen.has(o)) {
        seen.add(o)
        stack.push(ctx.lookup(o))
      }
    } else if (o) stack.push(o)
  }
  push(ctx.trailerInfo.Root)
  push(ctx.trailerInfo.Info)
  push(ctx.trailerInfo.Encrypt)
  while (stack.length) {
    const o = stack.pop()
    if (o instanceof PDFDict) for (const [, v] of o.entries()) push(v)
    else if (o instanceof PDFArray) for (let i = 0; i < o.size(); i++) push(o.get(i))
    else if (o instanceof PDFStream) for (const [, v] of o.dict.entries()) push(v)
  }
  let removed = 0
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref)) {
      ctx.delete(ref)
      removed++
    }
  }
  void PDFBool
  return removed
}
