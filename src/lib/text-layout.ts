export interface LayoutOptions {
  /** Width available for text; null = no wrapping. */
  maxWidth: number | null
  fontSize: number
  lineHeight: number
  align: 'left' | 'center' | 'right' | 'justify'
  list: 'none' | 'bullet' | 'number'
  /** Advance width of a string at fontSize (must already include letter spacing). */
  measure: (text: string) => number
}
export interface LayoutLine {
  text: string
  /** Left offset within the box. */
  x: number
  /** Top of the line box. */
  y: number
  width: number
  /** Extra word spacing for justified lines. */
  wordSpacing: number
  /** List marker rendered before the line (first line of an item only). */
  marker?: string
  markerX?: number
}
export interface TextLayout {
  lines: LayoutLine[]
  width: number
  height: number
}

/** Greedy word-wrap layout that matches what pdf-lib will draw. All distances in points. */
export function layoutText(text: string, o: LayoutOptions): TextLayout {
  const lineH = o.fontSize * o.lineHeight
  const paragraphs = text.split('\n')
  const lines: LayoutLine[] = []
  let maxW = 0
  let counter = 0
  const indent = o.list === 'none' ? 0 : o.measure(o.list === 'bullet' ? '•  ' : '00.  ')
  for (const para of paragraphs) {
    const isItem = o.list !== 'none' && para.trim().length > 0
    if (isItem) counter++
    const avail = o.maxWidth == null ? Infinity : Math.max(1, o.maxWidth - indent)
    const wrapped = wrapParagraph(para, avail, o.measure)
    wrapped.forEach((ln, i) => {
      const width = o.measure(ln)
      const last = i === wrapped.length - 1
      const line: LayoutLine = { text: ln, x: indent, y: lines.length * lineH, width, wordSpacing: 0 }
      if (isItem && i === 0) {
        line.marker = o.list === 'bullet' ? '•' : `${counter}.`
        line.markerX = 0
      }
      if (o.maxWidth != null) {
        const room = o.maxWidth - indent - width
        if (o.align === 'center') line.x = indent + room / 2
        else if (o.align === 'right') line.x = indent + room
        else if (o.align === 'justify' && !last && room > 0) {
          const gaps = (ln.match(/ /g) ?? []).length
          if (gaps > 0) line.wordSpacing = room / gaps
        }
      }
      maxW = Math.max(maxW, indent + width)
      lines.push(line)
    })
  }
  return { lines, width: maxW, height: lines.length * lineH }
}

function wrapParagraph(para: string, maxWidth: number, measure: (t: string) => number): string[] {
  if (para === '') return ['']
  if (!Number.isFinite(maxWidth)) return [para]
  const words = para.split(/( +)/) // keep spaces as tokens
  const out: string[] = []
  let cur = ''
  for (const tok of words) {
    if (tok === '') continue
    const trial = cur + tok
    if (measure(trial.replace(/ +$/, '')) <= maxWidth || cur === '') {
      cur = trial
      // hard-break tokens that alone exceed the width
      while (measure(cur.replace(/ +$/, '')) > maxWidth && cur.length > 1) {
        let cut = cur.length - 1
        while (cut > 1 && measure(cur.slice(0, cut)) > maxWidth) cut--
        out.push(cur.slice(0, cut))
        cur = cur.slice(cut)
      }
    } else {
      out.push(cur.replace(/ +$/, ''))
      cur = tok.trim() === '' ? '' : tok
    }
  }
  if (cur !== '' || out.length === 0) out.push(cur.replace(/ +$/, ''))
  return out
}

/** Largest font size (within bounds) whose laid-out text fits the box. */
export function fitFontSize(
  text: string,
  box: { w: number; h: number },
  base: Omit<LayoutOptions, 'fontSize' | 'measure'> & { measureAt: (size: number) => (t: string) => number },
  min = 4,
  max = 300,
): number {
  let lo = min
  let hi = max
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    const l = layoutText(text, { ...base, fontSize: mid, measure: base.measureAt(mid), maxWidth: box.w })
    if (l.height <= box.h && l.width <= box.w + 0.5) lo = mid
    else hi = mid
  }
  return Math.round(lo * 10) / 10
}

export interface TokenContext {
  page: number
  total: number
  label: string
  date: Date
  batesIndex: number
}
export function resolveTokens(text: string, ctx: TokenContext, bates?: { prefix: string; suffix: string; start: number; digits: number }): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = ctx.date
  return text
    .replace(/\{page\}/gi, String(ctx.page))
    .replace(/\{total\}/gi, String(ctx.total))
    .replace(/\{label\}/gi, ctx.label)
    .replace(/\{date\}/gi, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    .replace(/\{time\}/gi, `${pad(d.getHours())}:${pad(d.getMinutes())}`)
    .replace(/\{bates\}/gi, bates ? `${bates.prefix}${String(bates.start + ctx.batesIndex).padStart(bates.digits, '0')}${bates.suffix}` : '')
}

/** Positions for tiling an item of size (w,h) across a page with gaps. */
export function tileOffsets(pageW: number, pageH: number, w: number, h: number, gapX: number, gapY: number, cap = 600): Array<[number, number]> {
  const out: Array<[number, number]> = []
  // Grow the step so that even a tiny tile on a huge page cannot generate more than `cap` positions.
  let stepX = Math.max(4, w + gapX)
  let stepY = Math.max(4, h + gapY)
  const estimate = ((pageW + stepX) / stepX) * ((pageH + stepY) / stepY)
  if (estimate > cap) {
    const k = Math.sqrt(estimate / cap)
    stepX *= k
    stepY *= k
  }
  let row = 0
  for (let y = 0; y < pageH + stepY && out.length < cap; y += stepY, row++) {
    const shift = row % 2 ? stepX / 2 : 0
    for (let x = -shift; x < pageW + stepX && out.length < cap; x += stepX) out.push([x, y])
  }
  return out
}
