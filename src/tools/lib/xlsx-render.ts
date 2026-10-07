import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { PAGE_SIZES } from '@/lib/geometry'
import { safe, unicodeFonts } from './fonts'
import { saveDoc } from './pdf'

interface CellStyle { fill?: string; bold?: boolean; italic?: boolean; colour?: string; align?: string; wrap?: boolean }
interface XCell { v?: unknown; w?: string; t?: string; s?: { fgColor?: { rgb?: string }; patternType?: string; font?: { bold?: boolean; italic?: boolean; color?: { rgb?: string } }; alignment?: { horizontal?: string; wrapText?: boolean } } }

const hex = (h?: string) => {
  if (!h) return undefined
  const s = h.length === 8 ? h.slice(2) : h
  return /^[0-9a-f]{6}$/i.test(s) ? s : undefined
}
const col = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255)

export interface XlsxOptions { pageSize: 'A4' | 'Letter' | 'A3' | 'Legal'; orientation: 'auto' | 'portrait' | 'landscape'; fitWidth: boolean; gridlines: boolean; repeatHeader: boolean; sheets: 'all' | 'first' }

/** Renders spreadsheets like a print preview: column widths, row heights, fills, bold, merged cells and alignment. */
export async function xlsxToPdf(file: Blob, o: XlsxOptions, onProgress?: (f: number) => void): Promise<Uint8Array> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellStyles: true, cellDates: true, cellNF: true })
  const doc = await PDFDocument.create({ updateMetadata: false })
  const fonts = await unicodeFonts(doc)
  const names = o.sheets === 'first' ? wb.SheetNames.slice(0, 1) : wb.SheetNames
  let drew = false
  for (let si = 0; si < names.length; si++) {
    const ws = wb.Sheets[names[si]]
    if (!ws['!ref']) continue
    const range = XLSX.utils.decode_range(ws['!ref'])
    // trim empty trailing rows/cols
    let maxR = range.s.r, maxC = range.s.c
    for (const addr of Object.keys(ws)) {
      if (addr[0] === '!') continue
      const c = XLSX.utils.decode_cell(addr)
      const cell = ws[addr] as XCell
      if (cell.v === undefined || cell.v === '') continue
      maxR = Math.max(maxR, c.r)
      maxC = Math.max(maxC, c.c)
    }
    const merges = (ws['!merges'] ?? []) as { s: { r: number; c: number }; e: { r: number; c: number } }[]
    for (const m of merges) {
      maxR = Math.max(maxR, m.e.r)
      maxC = Math.max(maxC, m.e.c)
    }
    const cols = (ws['!cols'] ?? []) as { wpx?: number; wch?: number; hidden?: boolean }[]
    const rows = (ws['!rows'] ?? []) as { hpx?: number; hpt?: number; hidden?: boolean }[]
    const colW: number[] = []
    for (let c = range.s.c; c <= maxC; c++) {
      const ci = cols[c]
      colW.push(ci?.hidden ? 0 : ci?.wpx ? ci.wpx * 0.75 : ci?.wch ? ci.wch * 5.6 + 4 : 48)
    }
    const rowH: number[] = []
    for (let r = range.s.r; r <= maxR; r++) {
      const ri = rows[r]
      rowH.push(ri?.hidden ? 0 : ri?.hpt ?? (ri?.hpx ? ri.hpx * 0.75 : 15))
    }
    const totalW = colW.reduce((a, b) => a + b, 0)
    let [pw, ph] = PAGE_SIZES[o.pageSize]
    if (o.orientation === 'landscape' || (o.orientation === 'auto' && totalW > pw - 72)) [pw, ph] = [ph, pw]
    const M = 30
    const scale = o.fitWidth ? Math.min(1, (pw - 2 * M) / Math.max(1, totalW)) : 1
    const mergeAt = new Map<string, { r: number; c: number; rs: number; cs: number }>()
    const covered = new Set<string>()
    for (const m of merges) {
      mergeAt.set(`${m.s.r},${m.s.c}`, { r: m.s.r, c: m.s.c, rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 })
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`)
    }
    // column pages (only when not fitting to width)
    const colPages: [number, number][] = []
    if (o.fitWidth) colPages.push([0, colW.length])
    else {
      let start = 0, w = 0
      colW.forEach((cw, i) => {
        if (w + cw > pw - 2 * M && i > start) {
          colPages.push([start, i])
          start = i
          w = 0
        }
        w += cw
      })
      colPages.push([start, colW.length])
    }
    for (const [c0, c1] of colPages) {
      let page: PDFPage | null = null
      let y = 0
      const header = o.repeatHeader ? 0 : -1
      const newPage = () => {
        page = doc.addPage([pw, ph])
        y = ph - M
        page.drawText(safe(fonts.bold, names[si]), { x: M, y: ph - M + 10, size: 8, font: fonts.bold, color: rgb(0.45, 0.45, 0.45) })
      }
      newPage()
      const drawRow = (ri: number) => {
        const h = rowH[ri] * scale
        if (!h) return
        if (y - h < M) {
          newPage()
          if (header >= 0 && ri !== header) drawRow(header)
        }
        let x = M
        for (let ci = c0; ci < c1; ci++) {
          const r = range.s.r + ri, c = range.s.c + ci
          const w = colW[ci] * scale
          const key = `${r},${c}`
          if (covered.has(key) || !w) {
            x += w
            continue
          }
          const mg = mergeAt.get(key)
          const cw = mg ? colW.slice(ci, Math.min(c1, ci + mg.cs)).reduce((a, b) => a + b, 0) * scale : w
          const chh = mg ? rowH.slice(ri, ri + mg.rs).reduce((a, b) => a + b, 0) * scale : h
          const cell = ws[XLSX.utils.encode_cell({ r, c })] as XCell | undefined
          const st: CellStyle = { fill: cell?.s?.patternType === 'solid' ? hex(cell.s.fgColor?.rgb) : undefined, bold: cell?.s?.font?.bold, italic: cell?.s?.font?.italic, colour: hex(cell?.s?.font?.color?.rgb), align: cell?.s?.alignment?.horizontal, wrap: cell?.s?.alignment?.wrapText }
          const p = page as unknown as PDFPage
          if (st.fill && st.fill.toUpperCase() !== 'FFFFFF') p.drawRectangle({ x, y: y - chh, width: cw, height: chh, color: col(st.fill) })
          if (o.gridlines) p.drawRectangle({ x, y: y - chh, width: cw, height: chh, borderColor: rgb(0.82, 0.82, 0.82), borderWidth: 0.4 })
          const text = cell ? (cell.w ?? (cell.v instanceof Date ? cell.v.toLocaleDateString() : String(cell.v ?? ''))) : ''
          if (text) {
            const font: PDFFont = st.bold ? fonts.bold : st.italic ? fonts.italic : fonts.regular
            const size = Math.max(4, Math.min(10 * scale, chh * 0.7))
            let t = safe(font, text.replace(/\n/g, ' '))
            const max = cw - 4 * scale
            while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -1)
            const tw = font.widthOfTextAtSize(t, size)
            const numeric = cell?.t === 'n' || cell?.t === 'd'
            const align = st.align ?? (numeric ? 'right' : 'left')
            const tx = align === 'center' || align === 'centerContinuous' ? x + (cw - tw) / 2 : align === 'right' ? x + cw - tw - 2 * scale : x + 2 * scale
            p.drawText(t, { x: tx, y: y - chh / 2 - size * 0.35, size, font, color: st.colour ? col(st.colour) : rgb(0.1, 0.1, 0.1) })
          }
          x += w
        }
        y -= h
      }
      for (let ri = 0; ri < rowH.length; ri++) drawRow(ri)
      drew = true
    }
    onProgress?.((si + 1) / names.length)
  }
  if (!drew) throw new Error('The spreadsheet has no data.')
  return saveDoc(doc)
}
