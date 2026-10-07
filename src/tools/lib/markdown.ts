import { escapeHtml } from '@/lib/html'

/** Small CommonMark/GFM subset → HTML: headings, emphasis, code, links, images, lists, task lists, quotes, tables, rules. */

function inline(s: string): string {
  const codes: string[] = []
  let t = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${escapeHtml(c)}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  t = escapeHtml(t)
  t = t
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, src) => (/^data:image\//.test(src) ? `<img alt="${alt}" src="${src}">` : `[${alt || 'image'}]`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, txt, href) => (/^(https?:|mailto:|tel:|#)/.test(href) ? `<a href="${href}">${txt}</a>` : txt))
    .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1">$1</a>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/ {2,}$/g, '<br>')
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)])
}

const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const para: string[] = []
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' ').trim())}</p>`)
    para.length = 0
  }
  while (i < lines.length) {
    const line = lines[i]
    const fence = /^\s*(```|~~~)(.*)$/.exec(line)
    if (fence) {
      flush()
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) buf.push(lines[i++])
      i++
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      flush()
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      out.push(/^\s*(\\pagebreak|<!--\s*pagebreak\s*-->)/.test(line) ? '<hr class="pagebreak">' : '<hr>')
      i++
      continue
    }
    if (/^\s*(\\pagebreak|<!--\s*pagebreak\s*-->)\s*$/.test(line)) {
      flush()
      out.push('<hr class="pagebreak">')
      i++
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush()
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      out.push(`<table><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</table>`)
      continue
    }
    if (/^\s*>/.test(line)) {
      flush()
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(`<blockquote>${markdownToHtml(buf.join('\n'))}</blockquote>`)
      continue
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (li) {
      flush()
      // collect the whole list (including nested items) and build it recursively by indentation
      const items: { indent: number; ordered: boolean; text: string }[] = []
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
        if (m) items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), text: m[3] })
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1].text += ` ${lines[i].trim()}`
        else break
        i++
      }
      const build = (from: number, indent: number): [string, number] => {
        const ordered = items[from].ordered
        let html = ordered ? '<ol>' : '<ul>'
        let k = from
        while (k < items.length && items[k].indent >= indent) {
          if (items[k].indent > indent) {
            const [sub, next] = build(k, items[k].indent)
            html = html.replace(/<\/li>$/, `${sub}</li>`)
            k = next
            continue
          }
          const task = /^\[( |x)\]\s+(.*)$/i.exec(items[k].text)
          html += `<li>${task ? `${task[1].trim() ? '☑' : '☐'} ${inline(task[2])}` : inline(items[k].text)}</li>`
          k++
        }
        return [html + (ordered ? '</ol>' : '</ul>'), k]
      }
      let k = 0
      while (k < items.length) {
        const [html, next] = build(k, items[k].indent)
        out.push(html)
        k = next
      }
      continue
    }
    if (!line.trim()) {
      flush()
      i++
      continue
    }
    para.push(line.endsWith('  ') ? `${line.trim()}  ` : line.trim())
    i++
  }
  flush()
  return out.join('\n')
}
