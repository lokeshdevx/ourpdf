'use client'

import { useState } from 'react'
import { PDFDocument, rgb } from 'pdf-lib'
import { buildDocx } from '@/tools/lib/docx'
import { safe, unicodeFonts } from '@/tools/lib/fonts'
import { ocrCanvas } from '@/tools/lib/ocr'
import { canvasBytes, closePdf, loadImage, openPdfjs, renderPage, saveDoc } from '@/tools/lib/pdf'
import { toCanvas } from '@/tools/lib/scan'
import { FileDrop, FileOrderList, Grid, Note, Panel, Results, RunBar, Select, Toggle, pdfOut, useTask, type OutFile } from '../kit'

interface OcrPage { width: number; height: number; image: Uint8Array; lines: { text: string; x: number; y: number; w: number; h: number }[]; confidence: number }

/** Light pre-processing that helps Tesseract with pen on paper: grayscale, flatten lighting, boost contrast. */
function prep(c: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = c.width
  out.height = c.height
  const ctx = out.getContext('2d')!
  ctx.filter = 'grayscale(1) contrast(1.6) brightness(1.08)'
  ctx.drawImage(c, 0, 0)
  return out
}

export function HandwritingToPdf() {
  const [files, setFiles] = useState<File[]>([])
  const [lang, setLang] = useState('eng')
  const [pages, setPages] = useState<OcrPage[] | null>(null)
  const [background, setBackground] = useState(false)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  return (
    <div className="space-y-6">
      <Panel title="Handwritten pages">
        <div className="space-y-4">
          {files.length > 0 && <FileOrderList files={files} onChange={(f) => { setFiles(f); setPages(null) }} />}
          <FileDrop accept="image/*,application/pdf,.pdf" multiple compact={files.length > 0} label={files.length ? 'Add more' : 'Choose photos or a PDF'} onFiles={(f) => { setFiles([...files, ...f]); setPages(null) }} />
          <Grid>
            <Select label="Language" value={lang} onChange={setLang} options={[['eng', 'English'], ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['ita', 'Italian'], ['por', 'Portuguese']]} />
          </Grid>
          <Note>Recognition runs on your device. Neat, dark, print-style handwriting works best; joined cursive is harder – you can correct every line before exporting.</Note>
        </div>
      </Panel>
      <RunBar task={task} label={pages ? 'Recognise again' : 'Recognise handwriting'} disabled={!files.length} onRun={async () => {
        const r = await task.run(async (p) => {
          const canvases: HTMLCanvasElement[] = []
          for (const f of files) {
            if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
              const doc = await openPdfjs(new Uint8Array(await f.arrayBuffer()))
              for (let i = 1; i <= doc.numPages; i++) canvases.push(await renderPage(await doc.getPage(i), 2.5))
              await closePdf(doc)
            } else {
              const img = await loadImage(f)
              canvases.push(toCanvas(img, img.naturalWidth, img.naturalHeight, 3000))
            }
          }
          const res: OcrPage[] = []
          for (let i = 0; i < canvases.length; i++) {
            const c = canvases[i]
            const o = await ocrCanvas(prep(c), [lang], (f) => p((i + f) / canvases.length, `Reading page ${i + 1} of ${canvases.length}`))
            // page in points: keep the photo's aspect on an A4-wide page
            const k = 595.28 / c.width
            res.push({
              width: 595.28, height: c.height * k, image: await canvasBytes(c, 'image/jpeg', 0.75), confidence: o.confidence,
              lines: o.lines.filter((l) => l.text).map((l) => ({ text: l.text, x: l.x0 * k, y: l.y0 * k, w: (l.x1 - l.x0) * k, h: (l.y1 - l.y0) * k })),
            })
          }
          return res
        }, 'Recognising')
        if (r) setPages(r)
      }} />
      {pages && (
        <Panel title="Check the text">
          <div className="space-y-6">
            {pages.map((pg, pi) => (
              <section key={pi} aria-label={`Page ${pi + 1}`} className="space-y-2">
                <p className="text-sm font-semibold">Page {pi + 1} <span className="font-normal text-muted-foreground">· confidence {Math.round(pg.confidence)}%</span></p>
                {!pg.lines.length && <p className="text-sm text-muted-foreground">No text found on this page.</p>}
                {pg.lines.map((l, li) => (
                  <input key={li} aria-label={`Page ${pi + 1}, line ${li + 1}`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={l.text} onChange={(e) => setPages(pages.map((p2, k) => (k !== pi ? p2 : { ...p2, lines: p2.lines.map((x, m) => (m === li ? { ...x, text: e.target.value } : x)) })))} />
                ))}
              </section>
            ))}
          </div>
          <div className="mt-4"><Toggle label="Show the original page faintly behind the typed text" checked={background} onChange={setBackground} /></div>
        </Panel>
      )}
      <RunBar task={task} label="Create typed PDF" disabled={!pages} extra={pages && <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={async () => {
        const blob = await buildDocx(pages.flatMap((pg, i) => [...(i ? [{ type: 'pagebreak' as const }] : []), ...pg.lines.map((l) => ({ type: 'p' as const, text: l.text }))]), { title: 'Handwriting' })
        setOut([{ name: 'handwriting.docx', blob }])
      }}>or export Word (.docx)</button>} onRun={async () => {
        const r = await task.run(async () => {
          const doc = await PDFDocument.create({ updateMetadata: false })
          const { regular } = await unicodeFonts(doc)
          for (const pg of pages!) {
            const page = doc.addPage([pg.width, pg.height])
            if (background) page.drawImage(await doc.embedJpg(pg.image), { x: 0, y: 0, width: pg.width, height: pg.height, opacity: 0.18 })
            for (const l of pg.lines) {
              const t = safe(regular, l.text)
              // the typed line keeps the handwritten line's position, height and width
              let size = Math.max(6, Math.min(28, l.h * 0.72))
              const natural = regular.widthOfTextAtSize(t, size)
              if (natural > l.w * 1.15) size = Math.max(6, size * ((l.w * 1.15) / natural))
              page.drawText(t, { x: l.x, y: pg.height - l.y - l.h * 0.8, size, font: regular, color: rgb(0.08, 0.08, 0.1) })
            }
          }
          return saveDoc(doc)
        }, 'Building PDF')
        if (r) setOut([pdfOut(r, 'handwriting-typed.pdf', `${pages!.length} page${pages!.length === 1 ? '' : 's'}`)])
      }} />
      <Results files={out} onReset={() => { setOut([]); setPages(null); setFiles([]) }} />
    </div>
  )
}
