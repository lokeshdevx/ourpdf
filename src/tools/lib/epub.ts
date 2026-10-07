import { escapeHtml } from '@/lib/html'
import { closePdf, groupLines, openPdfjs, pageText, paragraphs, renderPage, canvasBytes } from './pdf'
import { readOutline } from './pages'

/* ====================================================== PDF → EPUB */

interface Chapter { title: string; html: string }

export async function pdfToEpub(bytes: Uint8Array, opts: { title: string; author: string; scansAsImages: boolean; onProgress?: (f: number) => void }): Promise<Blob> {
  const doc = await openPdfjs(bytes)
  const outline = (await readOutline(doc)).filter((o) => o.level === 1 && o.page >= 0)
  const starts = new Map(outline.map((o) => [o.page, o.title]))
  const chapters: Chapter[] = []
  const images: { name: string; bytes: Uint8Array }[] = []
  let cur: Chapter = { title: starts.get(0) ?? opts.title, html: '' }
  for (let i = 1; i <= doc.numPages; i++) {
    if (starts.has(i - 1) && cur.html) {
      chapters.push(cur)
      cur = { title: starts.get(i - 1)!, html: '' }
    } else if (!outline.length && i > 1 && (i - 1) % 20 === 0 && cur.html) {
      chapters.push(cur)
      cur = { title: `Pages ${i}–${Math.min(doc.numPages, i + 19)}`, html: '' }
    }
    const page = await doc.getPage(i)
    const t = await pageText(page)
    const lines = groupLines(t.runs)
    if (!lines.length && opts.scansAsImages) {
      const name = `page${i}.jpg`
      images.push({ name, bytes: await canvasBytes(await renderPage(page, 1.5), 'image/jpeg', 0.85) })
      cur.html += `<div class="scan"><img src="images/${name}" alt="Page ${i}"/></div>\n`
    }
    for (const p of paragraphs(lines)) {
      const tag = p.heading ? `h${Math.min(3, p.heading + 1)}` : 'p'
      cur.html += `<${tag}>${escapeHtml(p.text)}</${tag}>\n`
    }
    page.cleanup()
    opts.onProgress?.(i / doc.numPages)
  }
  if (cur.html || !chapters.length) chapters.push(cur)
  await closePdf(doc)
  return buildEpub(chapters, images, opts)
}

const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`

async function buildEpub(chapters: Chapter[], images: { name: string; bytes: Uint8Array }[], meta: { title: string; author: string }): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  const id = `urn:uuid:${crypto.randomUUID()}`
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  zip.file('OEBPS/style.css', 'body{font-family:serif;line-height:1.5;margin:0 5%}h1,h2,h3{font-family:sans-serif;line-height:1.2;page-break-after:avoid}p{margin:0 0 .8em;text-align:justify}.scan img{max-width:100%}')
  chapters.forEach((c, i) => zip.file(`OEBPS/chap${i + 1}.xhtml`, xhtml(c.title, `<h1>${escapeHtml(c.title)}</h1>\n${c.html}`)))
  for (const im of images) zip.file(`OEBPS/images/${im.name}`, im.bytes)
  zip.file('OEBPS/nav.xhtml', xhtml('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${chapters.map((c, i) => `<li><a href="chap${i + 1}.xhtml">${escapeHtml(c.title)}</a></li>`).join('')}</ol></nav>`))
  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${escapeHtml(meta.title)}</text></docTitle><navMap>${chapters.map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeHtml(c.title)}</text></navLabel><content src="chap${i + 1}.xhtml"/></navPoint>`).join('')}</navMap></ncx>`)
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${escapeHtml(meta.title)}</dc:title><dc:creator>${escapeHtml(meta.author || 'Unknown')}</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">${now}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>${chapters.map((_, i) => `<item id="c${i + 1}" href="chap${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}${images.map((im, i) => `<item id="img${i + 1}" href="images/${im.name}" media-type="image/jpeg"/>`).join('')}</manifest><spine toc="ncx">${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine></package>`)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' })
}

/* ====================================================== EPUB → HTML */

function resolve(base: string, href: string): string {
  const parts = base.split('/').slice(0, -1)
  for (const seg of decodeURIComponent(href.split('#')[0]).split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

const mimeOf = (p: string) => (/\.png$/i.test(p) ? 'image/png' : /\.gif$/i.test(p) ? 'image/gif' : /\.svg$/i.test(p) ? 'image/svg+xml' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg')

async function toDataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.readAsDataURL(new Blob([bytes as BlobPart], { type: mime }))
  })
}

/** Reads an EPUB (2 or 3) and returns its chapters, in reading order, as one HTML string with inlined images. */
export async function epubToHtml(file: Blob): Promise<{ html: string; title: string; author: string; chapters: number }> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file).catch(() => {
    throw new Error('This is not a valid EPUB file. DRM-protected books cannot be converted.')
  })
  if (zip.file('META-INF/encryption.xml')) {
    const enc = await zip.file('META-INF/encryption.xml')!.async('string')
    if (/EncryptedData/.test(enc) && !/obfuscation/i.test(enc)) throw new Error('This eBook is DRM-protected and cannot be converted.')
  }
  const container = await zip.file('META-INF/container.xml')?.async('string')
  const opfPath = container ? /full-path="([^"]+)"/.exec(container)?.[1] : Object.keys(zip.files).find((f) => f.endsWith('.opf'))
  if (!opfPath || !zip.file(opfPath)) throw new Error('The EPUB package file is missing.')
  const opf = new DOMParser().parseFromString(await zip.file(opfPath)!.async('string'), 'application/xml')
  const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() ?? 'eBook'
  const author = opf.getElementsByTagNameNS('*', 'creator')[0]?.textContent?.trim() ?? ''
  const manifest = new Map(Array.from(opf.getElementsByTagNameNS('*', 'item')).map((it) => [it.getAttribute('id') ?? '', { href: it.getAttribute('href') ?? '', type: it.getAttribute('media-type') ?? '' }]))
  const spine = Array.from(opf.getElementsByTagNameNS('*', 'itemref')).map((r) => manifest.get(r.getAttribute('idref') ?? '')).filter((m) => m && /html|xml/.test(m.type)) as { href: string }[]
  const parts: string[] = [`<h1>${escapeHtml(title)}</h1>${author ? `<p><em>${escapeHtml(author)}</em></p>` : ''}`]
  for (const item of spine) {
    const path = resolve(opfPath, item.href)
    const f = zip.file(path)
    if (!f) continue
    const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xhtml+xml')
    const body = doc.getElementsByTagName('body')[0] ?? doc.documentElement
    for (const img of Array.from(body.querySelectorAll('img, image'))) {
      const src = img.getAttribute('src') ?? img.getAttribute('xlink:href') ?? img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? ''
      const ip = resolve(path, src)
      const imf = zip.file(ip)
      if (imf && !/svg/.test(mimeOf(ip))) {
        const url = await toDataUrl(await imf.async('uint8array'), mimeOf(ip))
        const el = doc.createElementNS('http://www.w3.org/1999/xhtml', 'img')
        el.setAttribute('src', url)
        el.setAttribute('alt', img.getAttribute('alt') ?? '')
        img.replaceWith(el)
      } else img.remove()
    }
    parts.push(new XMLSerializer().serializeToString(body).replace(/^<body[^>]*>|<\/body>$/g, ''))
    parts.push('<hr class="pagebreak"/>')
  }
  return { html: parts.join('\n'), title, author, chapters: spine.length }
}

/** Plain-text books: blank lines are paragraphs, short ALL-CAPS / "Chapter …" lines become headings. */
export function textBookToHtml(text: string, title: string): string {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
  return `<h1>${escapeHtml(title)}</h1>` + paras.map((p) => (/^(chapter|part|book|prologue|epilogue)\b/i.test(p) && p.length < 80) || (p.length < 60 && p === p.toUpperCase() && /[A-Z]/.test(p)) ? `<h2>${escapeHtml(p)}</h2>` : `<p>${escapeHtml(p)}</p>`).join('\n')
}
