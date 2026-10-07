'use client'

import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Pilcrow, Quote, Redo2, Scissors, Strikethrough, Table, Underline, Undo2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { htmlToPdfBlob, imagesToPdfBlob, type PageSizeName } from '@/services/convert/to-pdf'
import { Grid, Panel, Results, RunBar, Select, TextInput, useTask, type OutFile } from '../kit'

const KEY = 'ourpdf.create-pdf.draft'
const START = '<h1>Untitled document</h1><p>Start typing here. Use the toolbar for <strong>bold</strong>, <em>italic</em>, headings, lists, tables and images.</p>'

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value)
}

/** The editor uses inline styles for alignment; the PDF generator understands the `align` attribute. */
function normalise(html: string): string {
  const d = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  d.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
    const a = el.style.textAlign
    if (a && el.tagName === 'P') el.setAttribute('align', a)
    if (a && el.tagName === 'DIV') {
      const p = d.createElement('p')
      p.setAttribute('align', a)
      p.innerHTML = el.innerHTML
      el.replaceWith(p)
    }
  })
  d.querySelectorAll('div').forEach((el) => {
    if (!el.querySelector('p,h1,h2,h3,ul,ol,table,blockquote,hr,img')) {
      const p = d.createElement('p')
      p.innerHTML = el.innerHTML
      el.replaceWith(p)
    }
  })
  return d.body.firstElementChild!.innerHTML
}

async function snapshot(el: HTMLElement, size: PageSizeName): Promise<Blob> {
  const { toCanvas } = await import('html-to-image')
  const widthPx = size === 'Letter' || size === 'Legal' ? 816 : size === 'A3' ? 1123 : 794
  const host = el.cloneNode(true) as HTMLElement
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${widthPx}px;padding:72px;box-sizing:border-box;background:#fff;color:#111;font:15px/1.6 system-ui,sans-serif`
  document.body.appendChild(host)
  try {
    const canvas = await toCanvas(host, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true })
    const ratio = size === 'Letter' ? 11 / 8.5 : size === 'Legal' ? 14 / 8.5 : 1.4142
    const pageH = Math.floor(canvas.width * ratio)
    const pages: Blob[] = []
    for (let y = 0; y < canvas.height; y += pageH) {
      const c = document.createElement('canvas')
      c.width = canvas.width
      c.height = pageH
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(canvas, 0, y, canvas.width, Math.min(pageH, canvas.height - y), 0, 0, canvas.width, Math.min(pageH, canvas.height - y))
      pages.push(await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Snapshot failed'))), 'image/jpeg', 0.92)))
    }
    return imagesToPdfBlob(pages, { pageSize: size, orientation: 'portrait', margin: 0, dpi: 192 })
  } finally {
    host.remove()
  }
}

export function CreatePdf() {
  const editor = useRef<HTMLDivElement>(null)
  const img = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('document')
  const [size, setSize] = useState<PageSizeName>('A4')
  const [mode, setMode] = useState<'text' | 'visual'>('text')
  const [words, setWords] = useState(0)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  useEffect(() => {
    let html = START
    try {
      html = localStorage.getItem(KEY) || START
    } catch {
      /* storage unavailable */
    }
    if (editor.current) editor.current.innerHTML = html
    setWords(editor.current?.innerText.split(/\s+/).filter(Boolean).length ?? 0)
  }, [])
  const changed = () => {
    const el = editor.current
    if (!el) return
    setWords(el.innerText.split(/\s+/).filter(Boolean).length)
    try {
      localStorage.setItem(KEY, el.innerHTML)
    } catch {
      /* ignore */
    }
  }
  const pickImage = () => img.current?.click()
  const tools: [LucideIcon, string, (c: { pickImage: () => void }) => void][] = [
    [Undo2, 'Undo', () => exec('undo')], [Redo2, 'Redo', () => exec('redo')],
    [Heading1, 'Heading 1', () => exec('formatBlock', 'H1')], [Heading2, 'Heading 2', () => exec('formatBlock', 'H2')], [Heading3, 'Heading 3', () => exec('formatBlock', 'H3')], [Pilcrow, 'Paragraph', () => exec('formatBlock', 'P')],
    [Bold, 'Bold', () => exec('bold')], [Italic, 'Italic', () => exec('italic')], [Underline, 'Underline', () => exec('underline')], [Strikethrough, 'Strikethrough', () => exec('strikeThrough')],
    [List, 'Bulleted list', () => exec('insertUnorderedList')], [ListOrdered, 'Numbered list', () => exec('insertOrderedList')], [Quote, 'Quote', () => exec('formatBlock', 'BLOCKQUOTE')],
    [AlignLeft, 'Align left', () => exec('justifyLeft')], [AlignCenter, 'Centre', () => exec('justifyCenter')], [AlignRight, 'Align right', () => exec('justifyRight')],
    [Link2, 'Link', () => { const u = prompt('Link address (https://…)'); if (u && /^(https?:|mailto:)/.test(u)) exec('createLink', u) }],
    [ImagePlus, 'Image', (c) => c.pickImage()],
    [Table, 'Table', () => { const r = Number(prompt('Rows', '3')) || 3, c = Number(prompt('Columns', '3')) || 3; exec('insertHTML', `<table><tbody>${Array.from({ length: r }, (_, i) => `<tr>${Array.from({ length: c }, () => (i === 0 ? '<th>Header</th>' : '<td>&nbsp;</td>')).join('')}</tr>`).join('')}</tbody></table><p></p>`) }],
    [Minus, 'Horizontal line', () => exec('insertHorizontalRule')],
    [Scissors, 'Page break', () => exec('insertHTML', '<hr class="pagebreak" data-label="Page break"><p></p>')],
  ]
  return (
    <div className="space-y-6">
      <Panel className="p-0 sm:p-0">
        <div role="toolbar" aria-label="Formatting" className="sticky top-16 z-10 flex flex-wrap gap-0.5 rounded-t-2xl border-b bg-card/95 p-2 backdrop-blur">
          {tools.map(([Icon, label, fn]) => (
            <Button key={label} variant="ghost" size="icon" title={label} aria-label={label} onMouseDown={(e) => { e.preventDefault(); fn({ pickImage }); changed() }}><Icon className="size-4" /></Button>
          ))}
          <input ref={img} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label="Insert image" onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const r = new FileReader()
            r.onload = () => { editor.current?.focus(); exec('insertHTML', `<p><img src="${r.result}" alt="${f.name.replace(/"/g, '')}" style="max-width:100%"></p>`); changed() }
            r.readAsDataURL(f)
          }} />
        </div>
        <div className="bg-muted/40 p-3 sm:p-6">
          <div ref={editor} contentEditable suppressContentEditableWarning onInput={changed} aria-label="Document" role="textbox" aria-multiline="true"
            className="mx-auto min-h-[60vh] max-w-[794px] bg-white p-8 text-[15px] leading-relaxed text-neutral-900 shadow outline-none sm:p-16 [&_a]:text-blue-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:text-neutral-600 [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-semibold [&_hr]:my-4 [&_hr.pagebreak]:border-dashed [&_hr.pagebreak]:border-primary [&_img]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-2 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-1.5 [&_th]:border [&_th]:bg-neutral-100 [&_th]:p-1.5 [&_ul]:ml-6 [&_ul]:list-disc" />
        </div>
        <p className="px-4 pb-3 pt-2 text-xs text-muted-foreground sm:px-6">{words} words · autosaved in this browser</p>
      </Panel>
      <Panel title="Export">
        <Grid cols={3}>
          <TextInput label="File name" value={title} onChange={setTitle} />
          <Select label="Page size" value={size} onChange={setSize} options={[['A4', 'A4'], ['Letter', 'US Letter'], ['Legal', 'US Legal'], ['A3', 'A3']]} />
          <Select label="Rendering" value={mode} onChange={setMode} options={[['text', 'Selectable text (smaller file)'], ['visual', 'Exactly as on screen']]} />
        </Grid>
      </Panel>
      <RunBar task={task} label="Export PDF" extra={<Button variant="ghost" onClick={() => { if (editor.current && confirm('Clear the document?')) { editor.current.innerHTML = '<p></p>'; changed() } }}>New document</Button>} onRun={async () => {
        const el = editor.current!
        const r = await task.run(async () => (mode === 'text' ? htmlToPdfBlob(normalise(el.innerHTML), { pageSize: size, title }) : snapshot(el, size)), 'Building PDF')
        if (r) setOut([{ name: `${title || 'document'}.pdf`, blob: r }])
      }} />
      <Results files={out} onReset={() => setOut([])} />
    </div>
  )
}
