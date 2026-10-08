import { canvasBytes, closePdf, groupLines, openPdfjs, pageText, paragraphs, renderPage } from './pdf'
import { detectTable, type Cell } from './extract'

/** Minimal, standards-conformant WordprocessingML writer (opens in Word, LibreOffice, Google Docs, Pages). */

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

export type DocxBlock =
  | { type: 'p'; text: string; style?: 'Title' | 'Heading1' | 'Heading2' | 'Heading3'; bold?: boolean; italic?: boolean; size?: number; align?: 'left' | 'center' | 'right' | 'both' }
  | { type: 'table'; rows: Cell[][]; header: boolean }
  | { type: 'image'; bytes: Uint8Array; ext: 'png' | 'jpeg'; widthPt: number; heightPt: number }
  | { type: 'pagebreak' }

const EMU = 12700

function run(text: string, o: { bold?: boolean; italic?: boolean; size?: number }) {
  const rpr = `${o.bold ? '<w:b/>' : ''}${o.italic ? '<w:i/>' : ''}${o.size ? `<w:sz w:val="${Math.round(o.size * 2)}"/><w:szCs w:val="${Math.round(o.size * 2)}"/>` : ''}`
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

export interface DocxMedia { name: string; bytes: Uint8Array }

export const DOCX_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'

/** Zips a document body (and its images, referenced as rImg1, rImg2, … in order) into a .docx package. */
export async function packageDocx(body: string, media: DocxMedia[], title: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${DOCX_NS}><w:body>${body}</w:body></w:document>`)
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${[['Title', 56, 0], ['Heading1', 32, 1], ['Heading2', 26, 2], ['Heading3', 24, 3]].map(([id, sz, lvl]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id === 'Title' ? 'Title' : `heading ${lvl}`}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/>${id === 'Title' ? '' : `<w:outlineLvl w:val="${Number(lvl) - 1}"/>`}</w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`).join('')}<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/></w:tblBorders></w:tblPr></w:style></w:styles>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((m, i) => `<Relationship Id="rImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>`)
  for (const m of media) zip.file(`word/media/${m.name}`, m.bytes)
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>OurPDF</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`)
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' })
}

export async function buildDocx(blocks: DocxBlock[], meta: { title: string; pageWidthPt?: number; pageHeightPt?: number }): Promise<Blob> {
  const media: DocxMedia[] = []
  const pw = meta.pageWidthPt ?? 595.28
  const ph = meta.pageHeightPt ?? 841.89
  const margin = 1440 // twips (1in)
  const contentWidthPt = pw - 144
  let imgId = 0
  const body = blocks.map((b) => {
    if (b.type === 'pagebreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    if (b.type === 'p') {
      const ppr = `${b.style ? `<w:pStyle w:val="${b.style}"/>` : ''}${b.align && b.align !== 'left' ? `<w:jc w:val="${b.align}"/>` : ''}`
      return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${run(b.text, b)}</w:p>`
    }
    if (b.type === 'table') {
      const cols = Math.max(1, ...b.rows.map((r) => r.length))
      const w = Math.floor((contentWidthPt * 20) / cols)
      const grid = `<w:tblGrid>${'<w:gridCol w:w="' + w + '"/>'.repeat(cols)}</w:tblGrid>`
      const rows = b.rows.map((r, ri) => `<w:tr>${Array.from({ length: cols }, (_, ci) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p>${run(String(r[ci] ?? ''), { bold: b.header && ri === 0 })}</w:p></w:tc>`).join('')}</w:tr>`).join('')
      return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>${grid}${rows}</w:tbl><w:p/>`
    }
    imgId++
    const name = `image${imgId}.${b.ext === 'jpeg' ? 'jpg' : 'png'}`
    media.push({ name, bytes: b.bytes })
    const k = Math.min(1, contentWidthPt / b.widthPt, (ph - 144) / b.heightPt)
    const cx = Math.round(b.widthPt * k * EMU)
    const cy = Math.round(b.heightPt * k * EMU)
    return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${imgId}" name="Picture ${imgId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imgId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImg${imgId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  }).join('')
  const sect = `<w:sectPr><w:pgSz w:w="${Math.round(pw * 20)}" w:h="${Math.round(ph * 20)}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`
  return packageDocx(`${body}${sect}`, media, meta.title)
}

/**
 * PDF → editable Word: headings, paragraphs and tables are rebuilt from the text layer. Pages without text
 * (scans) are inserted as images so nothing is lost – run OCR first to make them editable.
 */
export async function pdfToDocx(bytes: Uint8Array, opts: { title: string; tables: boolean; scannedAsImages: boolean; pageBreaks: boolean; onProgress?: (f: number) => void }): Promise<Blob> {
  const doc = await openPdfjs(bytes)
  const blocks: DocxBlock[] = []
  let size: { w: number; h: number } | null = null
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    size ??= { w: vp.width, h: vp.height }
    const t = await pageText(page)
    const lines = groupLines(t.runs)
    if (i > 1 && opts.pageBreaks) blocks.push({ type: 'pagebreak' })
    if (!lines.length) {
      if (opts.scannedAsImages) {
        const canvas = await renderPage(page, 2)
        blocks.push({ type: 'image', bytes: await canvasBytes(canvas, 'image/jpeg', 0.85), ext: 'jpeg', widthPt: vp.width, heightPt: vp.height })
      }
    } else {
      const table = opts.tables ? detectTable(t.runs, { numbers: false, onlyTables: true }) : []
      const tableLike = table.length >= 3 && table.length >= lines.length * 0.6
      if (tableLike) blocks.push({ type: 'table', rows: table, header: true })
      else for (const p of paragraphs(lines)) {
        blocks.push({ type: 'p', text: p.text, style: p.heading === 1 ? 'Heading1' : p.heading === 2 ? 'Heading2' : p.heading === 3 ? 'Heading3' : undefined, bold: !p.heading && p.bold })
      }
    }
    page.cleanup()
    opts.onProgress?.(i / doc.numPages)
  }
  await closePdf(doc)
  return buildDocx(blocks, { title: opts.title, pageWidthPt: size?.w, pageHeightPt: size?.h })
}
