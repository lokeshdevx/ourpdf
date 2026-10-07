import DOMPurify from 'dompurify'
import type { Block, Run } from '@/engine/generate'
import { normalizeImage } from '@/services/pdf/image-service'

/** Sanitises untrusted HTML: no scripts, styles, forms, event handlers or remote resources. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base', 'svg', 'math', 'video', 'audio'],
    FORBID_ATTR: ['style', 'srcset', 'formaction'],
    ALLOW_DATA_ATTR: false,
    // Only data: images survive (the app is offline-first and must not fetch remote content).
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'ADDRESS', 'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD'])

interface Style {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  mono?: boolean
  link?: string
}

function inlineRuns(node: Node, style: Style, out: Run[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').replace(/[\t\r\n ]+/g, ' ')
    if (text) out.push({ text, ...style })
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as HTMLElement
  const tag = el.tagName
  if (tag === 'BR') {
    out.push({ text: '\n', ...style })
    return
  }
  if (tag === 'IMG') {
    const alt = el.getAttribute('alt')
    if (alt) out.push({ text: `[${alt}]`, ...style })
    return
  }
  const next: Style = { ...style }
  if (tag === 'B' || tag === 'STRONG') next.bold = true
  if (tag === 'I' || tag === 'EM' || tag === 'CITE') next.italic = true
  if (tag === 'U' || tag === 'INS') next.underline = true
  if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') next.mono = true
  if (tag === 'A') {
    const href = el.getAttribute('href')
    if (href && /^(https?:|mailto:|tel:)/i.test(href)) next.link = href
  }
  el.childNodes.forEach((c) => inlineRuns(c, next, out))
}

function trimRuns(runs: Run[]): Run[] {
  const r = runs.map((x) => ({ ...x }))
  while (r.length && !r[0].text.trim() && r[0].text !== '\n') r.shift()
  if (r.length) r[0].text = r[0].text.replace(/^ +/, '')
  while (r.length && !r[r.length - 1].text.trim() && r[r.length - 1].text !== '\n') r.pop()
  if (r.length) r[r.length - 1].text = r[r.length - 1].text.replace(/ +$/, '')
  return r
}

const hasContent = (runs: Run[]) => runs.some((r) => r.text.trim().length > 0)

async function dataUrlImage(src: string) {
  if (!src.startsWith('data:image/')) return null
  try {
    const blob = await (await fetch(src)).blob()
    const n = await normalizeImage(blob)
    return { type: 'image' as const, bytes: n.bytes, mime: n.mime, width: n.width, height: n.height }
  } catch {
    return null
  }
}

async function walk(node: Node, blocks: Block[]) {
  const pending: Run[] = []
  const flush = () => {
    const runs = trimRuns(pending.splice(0))
    if (hasContent(runs)) blocks.push({ type: 'paragraph', runs })
  }
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      inlineRuns(child, {}, pending)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    const tag = el.tagName
    if (/^H[1-6]$/.test(tag)) {
      flush()
      const runs: Run[] = []
      inlineRuns(el, {}, runs)
      const t = trimRuns(runs)
      if (hasContent(t)) blocks.push({ type: 'heading', level: Number(tag[1]) as 1, runs: t })
    } else if (tag === 'P') {
      flush()
      const img = el.querySelector('img')
      const runs: Run[] = []
      inlineRuns(el, {}, runs)
      const t = trimRuns(runs)
      if (hasContent(t)) blocks.push({ type: 'paragraph', runs: t, align: (el.getAttribute('align') as 'left') || undefined })
      if (img) {
        const im = await dataUrlImage(img.getAttribute('src') ?? '')
        if (im) blocks.push(im)
      }
    } else if (tag === 'UL' || tag === 'OL') {
      flush()
      const items: Run[][] = []
      const collect = (list: HTMLElement, depth: number) => {
        for (const li of Array.from(list.children)) {
          if (li.tagName !== 'LI') continue
          const runs: Run[] = []
          li.childNodes.forEach((c) => {
            if (c.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test((c as HTMLElement).tagName)) return
            inlineRuns(c, {}, runs)
          })
          const t = trimRuns(runs)
          if (hasContent(t)) items.push(depth ? [{ text: `${'    '.repeat(depth)}` }, ...t] : t)
          li.querySelectorAll(':scope > ul, :scope > ol').forEach((sub) => collect(sub as HTMLElement, depth + 1))
        }
      }
      collect(el, 0)
      if (items.length) blocks.push({ type: 'list', ordered: tag === 'OL', items })
    } else if (tag === 'PRE') {
      flush()
      blocks.push({ type: 'pre', text: el.textContent ?? '' })
    } else if (tag === 'BLOCKQUOTE') {
      flush()
      const runs: Run[] = []
      inlineRuns(el, {}, runs)
      const t = trimRuns(runs)
      if (hasContent(t)) blocks.push({ type: 'quote', runs: t })
    } else if (tag === 'HR') {
      flush()
      blocks.push(el.classList.contains('pagebreak') ? { type: 'pagebreak' } : { type: 'hr' })
    } else if (tag === 'TABLE') {
      flush()
      const rows: Run[][][] = []
      let header = false
      el.querySelectorAll('tr').forEach((tr, i) => {
        const cells: Run[][] = []
        tr.querySelectorAll('th,td').forEach((td) => {
          const runs: Run[] = []
          inlineRuns(td, {}, runs)
          cells.push(trimRuns(runs))
          if (i === 0 && td.tagName === 'TH') header = true
        })
        if (cells.length) rows.push(cells)
      })
      if (rows.length) blocks.push({ type: 'table', rows, header })
    } else if (tag === 'IMG') {
      flush()
      const im = await dataUrlImage(el.getAttribute('src') ?? '')
      if (im) blocks.push(im)
      else if (el.getAttribute('alt')) blocks.push({ type: 'paragraph', runs: [{ text: `[${el.getAttribute('alt')}]` }] })
    } else if (BLOCK_TAGS.has(tag) || tag === 'BODY') {
      flush()
      await walk(el, blocks)
    } else {
      inlineRuns(el, {}, pending)
    }
  }
  flush()
}

/** Parses (already sanitised) HTML into layout blocks for the PDF generator. */
export async function htmlToBlocks(html: string): Promise<Block[]> {
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html')
  const blocks: Block[] = []
  await walk(doc.body, blocks)
  return blocks
}
