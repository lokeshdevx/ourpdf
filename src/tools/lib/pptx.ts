import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { canvasBytes, closePdf, groupLines, openPdfjs, pageText, renderPage, saveDoc } from './pdf'
import { safe, unicodeFonts, wrap, type FontSet } from './fonts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
const EMU = 12700

/* =================================================== PDF → PowerPoint */

interface SlideText { x: number; y: number; w: number; h: number; text: string; size: number; bold: boolean; italic: boolean; colour: string; font: string }
interface Slide { image: Uint8Array; texts: SlideText[] }

/** Darkest-against-background pixel colour inside a box – the text colour, sampled from the full render. */
function sampleColour(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): string {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y))
  const ww = Math.min(W - x0, Math.max(1, Math.ceil(w))), hh = Math.min(H - y0, Math.max(1, Math.ceil(h)))
  if (ww <= 0 || hh <= 0) return '000000'
  const d = ctx.getImageData(x0, y0, ww, hh).data
  // background = the most common bright-ish colour; text = the pixel furthest from it
  const bg = [d[0], d[1], d[2]]
  let best = 0
  let col = [0, 0, 0]
  for (let i = 0; i < d.length; i += 16) {
    const dist = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2])
    if (dist > best) {
      best = dist
      col = [d[i], d[i + 1], d[i + 2]]
    }
  }
  return col.map((v) => v.toString(16).padStart(2, '0')).join('')
}

const officeFont = (family: string) => (/mono|courier/i.test(family) ? 'Courier New' : /serif/i.test(family) && !/sans/i.test(family) ? 'Times New Roman' : 'Arial')

export async function pdfToSlides(bytes: Uint8Array, opts: { editable: boolean; scale: number; onProgress?: (f: number) => void }): Promise<{ slides: Slide[]; width: number; height: number }> {
  const doc = await openPdfjs(bytes)
  const slides: Slide[] = []
  let W = 0
  let H = 0
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    if (i === 1) {
      W = vp.width
      H = vp.height
    }
    const texts: SlideText[] = []
    let image: Uint8Array
    if (opts.editable) {
      const full = await renderPage(page, opts.scale)
      const fctx = full.getContext('2d', { willReadFrequently: true })!
      const t = await pageText(page)
      for (const l of groupLines(t.runs)) {
        const r0 = l.runs[0]
        texts.push({
          x: l.x, y: l.y, w: l.right - l.x, h: l.h * 1.2, text: l.text, size: l.size, bold: l.bold, italic: l.runs.every((r) => r.italic), font: officeFont(r0.font),
          colour: sampleColour(fctx, l.x * opts.scale, l.y * opts.scale, (l.right - l.x) * opts.scale, l.h * opts.scale),
        })
      }
      full.width = full.height = 0
      image = await canvasBytes(await renderPage(page, opts.scale, { noText: true }), 'image/jpeg', 0.88)
    } else image = await canvasBytes(await renderPage(page, opts.scale), 'image/jpeg', 0.9)
    // slides keep one size: fit other page sizes into the first page's frame
    const k = Math.min(W / vp.width, H / vp.height)
    if (k !== 1) for (const t of texts) Object.assign(t, { x: t.x * k + (W - vp.width * k) / 2, y: t.y * k + (H - vp.height * k) / 2, w: t.w * k, h: t.h * k, size: t.size * k })
    slides.push({ image, texts })
    page.cleanup()
    opts.onProgress?.(i / doc.numPages)
  }
  await closePdf(doc)
  return { slides, width: W, height: H }
}

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const EMPTY_TREE = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>'

export async function buildPptx(deck: { slides: Slide[]; width: number; height: number }, title: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const cx = Math.min(51206400, Math.max(914400, Math.round(deck.width * EMU)))
  const cy = Math.min(51206400, Math.max(914400, Math.round(deck.height * EMU)))
  const k = cx / (deck.width * EMU)
  const e = (v: number) => Math.round(v * EMU * k)
  const n = deck.slides.length
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${deck.slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`)
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>OurPDF</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`)
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>OurPDF</Application><Slides>${n}</Slides></Properties>`)
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst><p:sldIdLst>${deck.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdS${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`)
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdM" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rIdP" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rIdV" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rIdTS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>${deck.slides.map((_, i) => `<Relationship Id="rIdS${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`)
  zip.file('ppt/presProps.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentationPr ${NS}/>`)
  zip.file('ppt/viewProps.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`)
  zip.file('ppt/tableStyles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`)
  zip.file('ppt/theme/theme1.xml', THEME)
  zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${NS}>${EMPTY_TREE.replace('<p:cSld>', '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>')}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdL"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`)
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`)
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS} type="blank" preserve="1">${EMPTY_TREE.replace('<p:cSld>', '<p:cSld name="Blank">')}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdM" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`)
  deck.slides.forEach((s, i) => {
    let id = 3
    const boxes = s.texts.map((t) => {
      id++
      const pad = 0
      return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(t.x)}" y="${e(t.y - t.h * 0.1)}"/><a:ext cx="${Math.max(e(t.w * 1.04), 12700)}" cy="${Math.max(e(t.h), 12700)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="${pad}" tIns="${pad}" rIns="${pad}" bIns="${pad}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${Math.max(100, Math.round(t.size * k * 100))}" b="${t.bold ? 1 : 0}" i="${t.italic ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${t.colour}"/></a:solidFill><a:latin typeface="${t.font}"/></a:rPr><a:t>${esc(t.text)}</a:t></a:r></a:p></p:txBody></p:sp>`
    }).join('')
    const pic = `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${i + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${pic}${boxes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`)
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/page${i + 1}.jpg"/></Relationships>`)
    zip.file(`ppt/media/page${i + 1}.jpg`, s.image)
  })
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' })
}

/* =================================================== PowerPoint → PDF */

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

type Zip = import('jszip')
const parseXml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
const kids = (el: Element | null | undefined, ns: string, name: string) => (el ? Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === name) : [])
const kid = (el: Element | null | undefined, ns: string, name: string) => kids(el, ns, name)[0] ?? null
const deep = (el: Element | null | undefined, ns: string, name: string) => (el ? (el.getElementsByTagNameNS(ns, name)[0] ?? null) : null)

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

async function readRels(zip: Zip, part: string): Promise<Map<string, { target: string; type: string }>> {
  const relPath = part.replace(/([^/]+)$/, '_rels/$1.rels')
  const f = zip.file(relPath)
  const map = new Map<string, { target: string; type: string }>()
  if (!f) return map
  const xml = parseXml(await f.async('string'))
  for (const r of Array.from(xml.getElementsByTagName('Relationship'))) map.set(r.getAttribute('Id') ?? '', { target: resolvePath(part, r.getAttribute('Target') ?? ''), type: r.getAttribute('Type') ?? '' })
  return map
}

interface Xfrm { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean }
function readXfrm(spPr: Element | null): Xfrm | null {
  const x = kid(spPr, A, 'xfrm')
  const off = kid(x, A, 'off')
  const ext = kid(x, A, 'ext')
  if (!off || !ext) return null
  return { x: Number(off.getAttribute('x')) / EMU, y: Number(off.getAttribute('y')) / EMU, w: Number(ext.getAttribute('cx')) / EMU, h: Number(ext.getAttribute('cy')) / EMU, rot: Number(x?.getAttribute('rot') ?? 0) / 60000, flipH: x?.getAttribute('flipH') === '1', flipV: x?.getAttribute('flipV') === '1' }
}

interface Theme { colours: Record<string, string>; major: string; minor: string }
function readTheme(xml: Document | null): Theme {
  const colours: Record<string, string> = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' }
  if (xml) {
    const scheme = xml.getElementsByTagNameNS(A, 'clrScheme')[0]
    for (const c of Array.from(scheme?.children ?? [])) {
      const s = kid(c, A, 'srgbClr')?.getAttribute('val') ?? kid(c, A, 'sysClr')?.getAttribute('lastClr')
      if (s) colours[c.localName] = s
    }
  }
  return { colours, major: 'sans', minor: 'sans' }
}

function colourOf(el: Element | null, theme: Theme): { hex: string; alpha: number } | null {
  if (!el) return null
  const c = kid(el, A, 'srgbClr') ?? kid(el, A, 'schemeClr') ?? kid(el, A, 'sysClr') ?? kid(el, A, 'prstClr')
  if (!c) return null
  let hex = c.localName === 'srgbClr' ? c.getAttribute('val') ?? '000000' : c.localName === 'sysClr' ? c.getAttribute('lastClr') ?? '000000' : c.localName === 'prstClr' ? ({ black: '000000', white: 'FFFFFF', red: 'FF0000', blue: '0000FF', green: '008000' } as Record<string, string>)[c.getAttribute('val') ?? ''] ?? '000000' : ''
  if (c.localName === 'schemeClr') {
    const v = c.getAttribute('val') ?? 'tx1'
    const map: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' }
    hex = theme.colours[map[v] ?? v] ?? '000000'
  }
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  let alpha = 1
  for (const mod of Array.from(c.children)) {
    const v = Number(mod.getAttribute('val') ?? 100000) / 100000
    if (mod.localName === 'lumMod') [r, g, b] = [r * v, g * v, b * v]
    if (mod.localName === 'lumOff') [r, g, b] = [r + v, g + v, b + v]
    if (mod.localName === 'tint') [r, g, b] = [r + (1 - r) * (1 - v), g + (1 - g) * (1 - v), b + (1 - b) * (1 - v)]
    if (mod.localName === 'shade') [r, g, b] = [r * v, g * v, b * v]
    if (mod.localName === 'alpha') alpha = v
  }
  const h = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')
  return { hex: h(r) + h(g) + h(b), alpha }
}
const toRgb = (hex: string) => rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255)

interface Ctx { zip: Zip; theme: Theme; fonts: FontSet; doc: PDFDocument; page: PDFPage; H: number; images: Map<string, PDFImage | null>; layoutPh: Map<string, { xfrm: Xfrm | null; size?: number }>; defaultSize: (type: string) => number; layoutPhSize: (t: string | null) => number | undefined }

async function embedMedia(ctx: Ctx, path: string): Promise<PDFImage | null> {
  if (ctx.images.has(path)) return ctx.images.get(path) ?? null
  const f = ctx.zip.file(path)
  let img: PDFImage | null = null
  if (f) {
    const bytes = await f.async('uint8array')
    try {
      if (bytes[0] === 0x89 && bytes[1] === 0x50) img = await ctx.doc.embedPng(bytes)
      else if (bytes[0] === 0xff && bytes[1] === 0xd8) img = await ctx.doc.embedJpg(bytes)
      else if (/\.(gif|bmp|webp|tiff?)$/i.test(path)) {
        // let the browser decode other raster formats, then re-encode as PNG
        const bmp = await createImageBitmap(new Blob([bytes as BlobPart]))
        const c = document.createElement('canvas')
        c.width = bmp.width
        c.height = bmp.height
        c.getContext('2d')!.drawImage(bmp, 0, 0)
        img = await ctx.doc.embedPng(await canvasBytes(c, 'image/png'))
      }
    } catch {
      img = null
    }
  }
  ctx.images.set(path, img)
  return img
}

function phKey(sp: Element): { key: string; type: string } | null {
  const ph = deep(kid(sp, P, 'nvSpPr') ?? kid(sp, P, 'nvPicPr'), P, 'ph')
  if (!ph) return null
  const type = ph.getAttribute('type') ?? 'body'
  return { key: ph.getAttribute('idx') ? `idx:${ph.getAttribute('idx')}` : `type:${type}`, type }
}

function drawShapeFill(ctx: Ctx, spPr: Element | null, x: Xfrm) {
  const fill = colourOf(kid(spPr, A, 'solidFill'), ctx.theme)
  const ln = kid(spPr, A, 'ln')
  const line = ln && !kid(ln, A, 'noFill') ? colourOf(kid(ln, A, 'solidFill'), ctx.theme) : null
  const lw = ln ? Number(ln.getAttribute('w') ?? 12700) / EMU : 0
  if (!fill && !line) return
  const geom = kid(spPr, A, 'prstGeom')?.getAttribute('prst') ?? 'rect'
  const y = ctx.H - x.y - x.h
  const common = { color: fill ? toRgb(fill.hex) : undefined, opacity: fill?.alpha ?? 1, borderColor: line ? toRgb(line.hex) : undefined, borderWidth: line ? Math.max(0.25, lw) : 0 }
  if (geom === 'ellipse') ctx.page.drawEllipse({ x: x.x + x.w / 2, y: y + x.h / 2, xScale: x.w / 2, yScale: x.h / 2, ...common })
  else if (geom === 'line' || geom === 'straightConnector1') {
    if (line) ctx.page.drawLine({ start: { x: x.x, y: x.flipV ? y : y + x.h }, end: { x: x.x + x.w, y: x.flipV ? y + x.h : y }, thickness: Math.max(0.5, lw), color: toRgb(line.hex) })
  } else ctx.page.drawRectangle({ x: x.x, y, width: x.w, height: x.h, ...common })
}

function drawText(ctx: Ctx, sp: Element, x: Xfrm, phType: string | null) {
  const body = kid(sp, P, 'txBody')
  if (!body) return
  const bodyPr = kid(body, A, 'bodyPr')
  const ins = (n: string, d: number) => Number(bodyPr?.getAttribute(n) ?? d * EMU) / EMU
  const l = ins('lIns', 7.2), r = ins('rIns', 7.2), t = ins('tIns', 3.6), b = ins('bIns', 3.6)
  const scale = Number(deep(bodyPr, A, 'normAutofit')?.getAttribute('fontScale') ?? 100000) / 100000
  const width = Math.max(10, x.w - l - r)
  const anchor = bodyPr?.getAttribute('anchor') ?? (phType === 'title' || phType === 'ctrTitle' ? 'ctr' : 't')
  const isBody = phType === 'body' || phType === 'obj'
  interface L { text: string; size: number; font: PDFFont; colour: string; align: string; indent: number }
  const lines: L[] = []
  for (const p of kids(body, A, 'p')) {
    const pPr = kid(p, A, 'pPr')
    const lvl = Number(pPr?.getAttribute('lvl') ?? 0)
    const algn = pPr?.getAttribute('algn') ?? (phType === 'ctrTitle' || phType === 'subTitle' ? 'ctr' : 'l')
    const runs = [...kids(p, A, 'r'), ...kids(p, A, 'fld')]
    const text = Array.from(p.children).map((c) => (c.localName === 'br' ? '\n' : c.localName === 'r' || c.localName === 'fld' ? kid(c, A, 't')?.textContent ?? '' : '')).join('')
    const rPr = kid(runs[0], A, 'rPr') ?? kid(p, A, 'endParaRPr')
    const sz = Number(rPr?.getAttribute('sz') ?? 0) / 100 || ctx.layoutPhSize(phType) || ctx.defaultSize(phType ?? 'other')
    const size = Math.max(4, sz * scale)
    const bold = rPr?.getAttribute('b') === '1' || phType === 'title' || phType === 'ctrTitle'
    const italic = rPr?.getAttribute('i') === '1'
    const font = bold ? ctx.fonts.bold : italic ? ctx.fonts.italic : ctx.fonts.regular
    const colour = colourOf(kid(rPr, A, 'solidFill'), ctx.theme)?.hex ?? ctx.theme.colours.dk1
    const bullet = !kid(pPr, A, 'buNone') && (kid(pPr, A, 'buChar') || (isBody && text.trim()))
    const indent = lvl * 18 + (bullet ? 14 : 0)
    const wrapped = text.trim() || text.includes('\n') ? wrap(font, (bullet ? '• ' : '') + text, size, width - indent) : ['']
    wrapped.forEach((w, i) => lines.push({ text: w, size, font, colour, align: algn, indent: i === 0 && bullet ? indent - 14 : indent }))
  }
  const total = lines.reduce((s, ln) => s + ln.size * 1.2, 0)
  let y = anchor === 'ctr' ? x.y + t + (x.h - t - b - total) / 2 : anchor === 'b' ? x.y + x.h - b - total : x.y + t
  for (const ln of lines) {
    y += ln.size * 1.2
    if (!ln.text) continue
    const s = safe(ln.font, ln.text)
    const tw = ln.font.widthOfTextAtSize(s, ln.size)
    const left = x.x + l + ln.indent
    const tx = ln.align === 'ctr' ? x.x + l + (width - tw) / 2 : ln.align === 'r' ? x.x + x.w - r - tw : left
    ctx.page.drawText(s, { x: tx, y: ctx.H - y + ln.size * 0.22, size: ln.size, font: ln.font, color: toRgb(ln.colour) })
  }
}

async function drawTree(ctx: Ctx, tree: Element, rels: Map<string, { target: string }>, skipPlaceholders: boolean, offset = { dx: 0, dy: 0, sx: 1, sy: 1 }) {
  for (const el of Array.from(tree.children)) {
    const name = el.localName
    if (name === 'grpSp') {
      const gx = kid(kid(el, P, 'grpSpPr'), A, 'xfrm')
      const off = kid(gx, A, 'off'), ext = kid(gx, A, 'ext'), choff = kid(gx, A, 'chOff'), chext = kid(gx, A, 'chExt')
      if (off && ext && choff && chext) {
        const sx = Number(ext.getAttribute('cx')) / (Number(chext.getAttribute('cx')) || 1)
        const sy = Number(ext.getAttribute('cy')) / (Number(chext.getAttribute('cy')) || 1)
        const inner = { sx: offset.sx * sx, sy: offset.sy * sy, dx: offset.dx + offset.sx * (Number(off.getAttribute('x')) / EMU - (Number(choff.getAttribute('x')) / EMU) * sx), dy: offset.dy + offset.sy * (Number(off.getAttribute('y')) / EMU - (Number(choff.getAttribute('y')) / EMU) * sy) }
        await drawTree(ctx, el, rels, skipPlaceholders, inner)
      } else await drawTree(ctx, el, rels, skipPlaceholders, offset)
      continue
    }
    if (name !== 'sp' && name !== 'pic' && name !== 'cxnSp') continue
    const ph = phKey(el)
    if (ph && skipPlaceholders) continue
    const spPr = kid(el, P, 'spPr')
    let x = readXfrm(spPr)
    if (!x && ph) x = ctx.layoutPh.get(ph.key)?.xfrm ?? ctx.layoutPh.get(`type:${ph.type}`)?.xfrm ?? null
    if (!x) continue
    x = { ...x, x: offset.dx + x.x * offset.sx, y: offset.dy + x.y * offset.sy, w: x.w * offset.sx, h: x.h * offset.sy }
    if (name === 'pic') {
      const blip = deep(el, A, 'blip')
      const rid = blip?.getAttributeNS(R, 'embed')
      const target = rid ? rels.get(rid)?.target : undefined
      const img = target ? await embedMedia(ctx, target) : null
      if (img) ctx.page.drawImage(img, { x: x.x, y: ctx.H - x.y - x.h, width: x.w, height: x.h })
      continue
    }
    drawShapeFill(ctx, spPr, x)
    drawText(ctx, el, x, ph?.type ?? null)
  }
}

function background(ctx: Ctx, cSld: Element | null): boolean {
  const bg = kid(cSld, P, 'bg')
  if (!bg) return false
  const c = colourOf(kid(kid(bg, P, 'bgPr'), A, 'solidFill'), ctx.theme) ?? colourOf(kid(bg, P, 'bgRef'), ctx.theme)
  if (c) ctx.page.drawRectangle({ x: 0, y: 0, width: ctx.page.getWidth(), height: ctx.H, color: toRgb(c.hex) })
  return !!c
}

/** Renders .pptx slides to a vector PDF: backgrounds, shapes, pictures and text (with theme colours and placeholders). */
export async function pptxToPdf(file: Blob, onProgress?: (f: number) => void): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file).catch(() => {
    throw new Error('This is not a valid .pptx file (older .ppt files must be re-saved as .pptx).')
  })
  const presPart = 'ppt/presentation.xml'
  const presFile = zip.file(presPart)
  if (!presFile) throw new Error('This file has no presentation inside – is it a .pptx?')
  const pres = parseXml(await presFile.async('string'))
  const sz = pres.getElementsByTagNameNS(P, 'sldSz')[0]
  const W = Number(sz?.getAttribute('cx') ?? 9144000) / EMU
  const H = Number(sz?.getAttribute('cy') ?? 6858000) / EMU
  const presRels = await readRels(zip, presPart)
  const slideIds = Array.from(pres.getElementsByTagNameNS(P, 'sldId')).map((s) => presRels.get(s.getAttributeNS(R, 'id') ?? '')?.target).filter(Boolean) as string[]
  const doc = await PDFDocument.create({ updateMetadata: false })
  const fonts = await unicodeFonts(doc)
  const images = new Map<string, PDFImage | null>()
  for (let i = 0; i < slideIds.length; i++) {
    const part = slideIds[i]
    const slide = parseXml(await zip.file(part)!.async('string'))
    if (slide.documentElement.getAttribute('show') === '0') continue
    const rels = await readRels(zip, part)
    const layoutPart = [...rels.values()].find((r) => r.type.endsWith('/slideLayout'))?.target
    const layout = layoutPart && zip.file(layoutPart) ? parseXml(await zip.file(layoutPart)!.async('string')) : null
    const layoutRels = layoutPart ? await readRels(zip, layoutPart) : new Map()
    const masterPart = [...layoutRels.values()].find((r: { type: string }) => r.type.endsWith('/slideMaster'))?.target as string | undefined
    const master = masterPart && zip.file(masterPart) ? parseXml(await zip.file(masterPart)!.async('string')) : null
    const masterRels = masterPart ? await readRels(zip, masterPart) : new Map()
    const themePart = [...masterRels.values()].find((r: { type: string }) => r.type.endsWith('/theme'))?.target as string | undefined
    const theme = readTheme(themePart && zip.file(themePart) ? parseXml(await zip.file(themePart)!.async('string')) : null)
    // placeholder geometry and sizes: master first, layout overrides
    const layoutPh = new Map<string, { xfrm: Xfrm | null; size?: number }>()
    for (const src of [master, layout]) {
      if (!src) continue
      for (const sp of Array.from(src.getElementsByTagNameNS(P, 'sp'))) {
        const ph = phKey(sp)
        if (!ph) continue
        const xf = readXfrm(kid(sp, P, 'spPr'))
        const s = Number(deep(sp, A, 'defRPr')?.getAttribute('sz') ?? 0) / 100 || undefined
        for (const key of [ph.key, `type:${ph.type}`]) {
          const prev = layoutPh.get(key)
          layoutPh.set(key, { xfrm: xf ?? prev?.xfrm ?? null, size: s ?? prev?.size })
        }
      }
    }
    const masterSize = (tag: string) => Number(master?.getElementsByTagNameNS(P, tag)[0]?.getElementsByTagNameNS(A, 'lvl1pPr')[0]?.getElementsByTagNameNS(A, 'defRPr')[0]?.getAttribute('sz') ?? 0) / 100
    const page = doc.addPage([W, H])
    const ctx = {
      zip, theme, fonts, doc, page, H, images, layoutPh,
      defaultSize: (t: string) => (t === 'title' || t === 'ctrTitle' ? masterSize('titleStyle') || 40 : t === 'body' || t === 'obj' || t === 'subTitle' ? masterSize('bodyStyle') || 24 : masterSize('otherStyle') || 18),
      layoutPhSize: (t: string | null) => (t ? layoutPh.get(`type:${t}`)?.size : undefined),
    }
    const cSld = slide.getElementsByTagNameNS(P, 'cSld')[0]
    if (!background(ctx, cSld) && !background(ctx, layout?.getElementsByTagNameNS(P, 'cSld')[0] ?? null)) background(ctx, master?.getElementsByTagNameNS(P, 'cSld')[0] ?? null)
    const mTree = master?.getElementsByTagNameNS(P, 'spTree')[0]
    if (mTree && layout?.documentElement.getAttribute('showMasterSp') !== '0' && slide.documentElement.getAttribute('showMasterSp') !== '0') await drawTree(ctx, mTree, masterRels, true)
    const lTree = layout?.getElementsByTagNameNS(P, 'spTree')[0]
    if (lTree) await drawTree(ctx, lTree, layoutRels, true)
    const tree = cSld?.getElementsByTagNameNS(P, 'spTree')[0]
    if (tree) await drawTree(ctx, tree, rels, false)
    onProgress?.((i + 1) / slideIds.length)
  }
  if (!doc.getPageCount()) throw new Error('The presentation has no visible slides.')
  return saveDoc(doc)
}
