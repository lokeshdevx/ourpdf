import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import { safe, unicodeFonts, wrap } from './fonts'
import { saveDoc } from './pdf'

export interface Job { role: string; org: string; place: string; start: string; end: string; bullets: string }
export interface Edu { degree: string; school: string; place: string; start: string; end: string; detail: string }
export interface Project { name: string; link: string; detail: string }
export interface Resume {
  name: string; title: string; email: string; phone: string; location: string; links: string
  summary: string; jobs: Job[]; education: Edu[]; skills: string; projects: Project[]; certifications: string; languages: string
}
export type Template = 'classic' | 'modern' | 'compact'

export const SAMPLE_RESUME: Resume = {
  name: 'Aarav Sharma', title: 'Senior Frontend Engineer', email: 'aarav.sharma@example.com', phone: '+91 98765 43210', location: 'Bengaluru, India', links: 'linkedin.com/in/aarav · github.com/aarav',
  summary: 'Frontend engineer with 7 years of experience building fast, accessible web apps used by millions. Led the migration of a large e-commerce storefront to React and cut page load time by 45%.',
  jobs: [
    { role: 'Senior Frontend Engineer', org: 'Flipkart', place: 'Bengaluru', start: 'Jan 2022', end: 'Present', bullets: 'Led a team of 6 rebuilding checkout in React and TypeScript\nImproved Core Web Vitals – LCP down from 3.8 s to 1.9 s\nIntroduced visual regression testing, reducing UI bugs by 30%' },
    { role: 'Software Engineer', org: 'Zoho', place: 'Chennai', start: 'Jul 2018', end: 'Dec 2021', bullets: 'Built reusable component library adopted by 12 product teams\nShipped offline mode for the mobile web app' },
  ],
  education: [{ degree: 'B.Tech, Computer Science', school: 'NIT Trichy', place: 'Tiruchirappalli', start: '2014', end: '2018', detail: 'CGPA 8.7 / 10' }],
  skills: 'TypeScript, React, Next.js, Node.js, GraphQL, Accessibility (WCAG), Performance, Testing (Playwright, Vitest)',
  projects: [{ name: 'OpenInvoice', link: 'github.com/aarav/openinvoice', detail: 'Open-source GST invoice generator with 2k stars' }],
  certifications: 'AWS Certified Developer – Associate (2023)', languages: 'English (fluent), Hindi (native), Tamil (conversational)',
}

export const EMPTY_JOB: Job = { role: '', org: '', place: '', start: '', end: '', bullets: '' }
export const EMPTY_EDU: Edu = { degree: '', school: '', place: '', start: '', end: '', detail: '' }
export const EMPTY_PROJECT: Project = { name: '', link: '', detail: '' }

const dates = (a: string, b: string) => [a, b].filter(Boolean).join(' – ')
const bullets = (s: string) => s.split('\n').map((x) => x.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean)

/* ================================================================ PDF */

interface Ctx { doc: PDFDocument; page: PDFPage; y: number; f: { r: PDFFont; b: PDFFont; i: PDFFont }; accent: RGB; x: number; w: number; H: number; M: number }

const GREY = rgb(0.35, 0.35, 0.38)
const INK = rgb(0.1, 0.1, 0.12)

function ensure(c: Ctx, h: number) {
  if (c.y - h < c.M) {
    c.page = c.doc.addPage([595.28, 841.89])
    c.y = c.H - c.M
  }
}
function text(c: Ctx, s: string, o: { size: number; font?: PDFFont; color?: RGB; x?: number; w?: number; gap?: number; align?: 'left' | 'right' | 'center' }) {
  const font = o.font ?? c.f.r
  const w = o.w ?? c.w
  const x0 = o.x ?? c.x
  for (const line of wrap(font, s, o.size, w)) {
    ensure(c, o.size * 1.35)
    const tw = font.widthOfTextAtSize(line, o.size)
    const x = o.align === 'right' ? x0 + w - tw : o.align === 'center' ? x0 + (w - tw) / 2 : x0
    c.page.drawText(line, { x, y: c.y - o.size, size: o.size, font, color: o.color ?? INK })
    c.y -= o.size * (o.gap ?? 1.35)
  }
}
/** Left text with a right-aligned companion (dates) on the same line. */
function row(c: Ctx, left: string, right: string, size: number, font: PDFFont, rightFont: PDFFont = c.f.r) {
  ensure(c, size * 1.4)
  const r = safe(rightFont, right)
  const rw = right ? rightFont.widthOfTextAtSize(r, size - 1) : 0
  const lines = wrap(font, left, size, c.w - rw - 10)
  c.page.drawText(lines[0] ?? '', { x: c.x, y: c.y - size, size, font, color: INK })
  if (right) c.page.drawText(r, { x: c.x + c.w - rw, y: c.y - size, size: size - 1, font: rightFont, color: GREY })
  c.y -= size * 1.35
  for (const l of lines.slice(1)) text(c, l, { size, font })
}
function heading(c: Ctx, s: string, tpl: Template) {
  ensure(c, 40)
  c.y -= tpl === 'compact' ? 6 : 10
  const label = tpl === 'classic' ? s.toUpperCase() : s
  const size = tpl === 'compact' ? 10.5 : 11.5
  c.page.drawText(safe(c.f.b, label), { x: c.x, y: c.y - size, size, font: c.f.b, color: tpl === 'classic' ? INK : c.accent })
  c.y -= size * 1.3
  c.page.drawLine({ start: { x: c.x, y: c.y }, end: { x: c.x + c.w, y: c.y }, thickness: tpl === 'modern' ? 1.2 : 0.6, color: tpl === 'modern' ? c.accent : rgb(0.75, 0.75, 0.78) })
  c.y -= 6
}
function bulletList(c: Ctx, items: string[], size: number) {
  for (const b of items) {
    const lines = wrap(c.f.r, b, size, c.w - 12)
    lines.forEach((l, i) => {
      ensure(c, size * 1.35)
      if (i === 0) c.page.drawText('•', { x: c.x + 2, y: c.y - size, size, font: c.f.r, color: c.accent })
      c.page.drawText(l, { x: c.x + 12, y: c.y - size, size, font: c.f.r, color: INK })
      c.y -= size * 1.35
    })
  }
}

export async function resumePdf(r: Resume, tpl: Template, accentHex: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  const fonts = await unicodeFonts(doc, tpl === 'classic' ? 'dejavu-serif' : 'dejavu-sans')
  const [ar, ag, ab] = [1, 3, 5].map((i) => parseInt(accentHex.slice(i, i + 2), 16) / 255)
  const M = tpl === 'compact' ? 40 : 48
  const page = doc.addPage([595.28, 841.89])
  const c: Ctx = { doc, page, y: 841.89 - M, f: { r: fonts.regular, b: fonts.bold, i: fonts.italic }, accent: rgb(ar, ag, ab), x: M, w: 595.28 - 2 * M, H: 841.89, M }
  const body = tpl === 'compact' ? 9.5 : 10.2

  // header
  if (tpl === 'modern') {
    page.drawRectangle({ x: 0, y: 841.89 - 108, width: 595.28, height: 108, color: c.accent })
    page.drawText(safe(c.f.b, r.name), { x: M, y: 841.89 - 52, size: 26, font: c.f.b, color: rgb(1, 1, 1) })
    if (r.title) page.drawText(safe(c.f.r, r.title), { x: M, y: 841.89 - 74, size: 12.5, font: c.f.r, color: rgb(1, 1, 1) })
    const contact = [r.email, r.phone, r.location, r.links].filter(Boolean).join('  ·  ')
    page.drawText(safe(c.f.r, contact).slice(0, 140), { x: M, y: 841.89 - 94, size: 8.8, font: c.f.r, color: rgb(0.95, 0.95, 1) })
    c.y = 841.89 - 108 - 14
  } else {
    text(c, r.name, { size: tpl === 'compact' ? 20 : 24, font: c.f.b, align: tpl === 'classic' ? 'center' : 'left', gap: 1.2 })
    if (r.title) text(c, r.title, { size: 11.5, color: tpl === 'classic' ? GREY : c.accent, align: tpl === 'classic' ? 'center' : 'left' })
    text(c, [r.email, r.phone, r.location, r.links].filter(Boolean).join('  |  '), { size: 9, color: GREY, align: tpl === 'classic' ? 'center' : 'left' })
  }

  if (r.summary.trim()) {
    heading(c, 'Summary', tpl)
    text(c, r.summary, { size: body })
  }
  const jobs = r.jobs.filter((j) => j.role || j.org)
  if (jobs.length) {
    heading(c, 'Experience', tpl)
    for (const j of jobs) {
      ensure(c, 40)
      row(c, j.role, dates(j.start, j.end), body + 1, c.f.b)
      const sub = [j.org, j.place].filter(Boolean).join(', ')
      if (sub) text(c, sub, { size: body, font: c.f.i, color: GREY })
      bulletList(c, bullets(j.bullets), body)
      c.y -= 4
    }
  }
  const edu = r.education.filter((e) => e.degree || e.school)
  if (edu.length) {
    heading(c, 'Education', tpl)
    for (const e of edu) {
      row(c, e.degree, dates(e.start, e.end), body + 0.5, c.f.b)
      const sub = [e.school, e.place].filter(Boolean).join(', ')
      if (sub) text(c, sub, { size: body, font: c.f.i, color: GREY })
      if (e.detail) text(c, e.detail, { size: body })
      c.y -= 3
    }
  }
  if (r.skills.trim()) {
    heading(c, 'Skills', tpl)
    text(c, r.skills.split(/\s*[,;\n]\s*/).filter(Boolean).join('  ·  '), { size: body })
  }
  const projects = r.projects.filter((p) => p.name)
  if (projects.length) {
    heading(c, 'Projects', tpl)
    for (const p of projects) {
      row(c, p.name, p.link, body + 0.5, c.f.b)
      if (p.detail) text(c, p.detail, { size: body })
    }
  }
  if (r.certifications.trim()) {
    heading(c, 'Certifications', tpl)
    bulletList(c, r.certifications.split('\n').filter((x) => x.trim()), body)
  }
  if (r.languages.trim()) {
    heading(c, 'Languages', tpl)
    text(c, r.languages, { size: body })
  }
  doc.setTitle(`${r.name} – Resume`)
  doc.setAuthor(r.name)
  return saveDoc(doc)
}

/* ============================================================== LaTeX */

const tex = (s: string) => s.replace(/\\/g, '\\textbackslash{}').replace(/([#$%&_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}').replace(/₹/g, '\\rupee{}').replace(/–/g, '--').replace(/—/g, '---')

/** A self-contained, ATS-friendly LaTeX source (pdflatex / xelatex, standard packages only). */
export function resumeLatex(r: Resume, accentHex: string): string {
  const lines: string[] = []
  lines.push('% Generated by OurPDF Resume Builder', '\\documentclass[10.5pt,a4paper]{article}', '\\usepackage[margin=1.6cm]{geometry}', '\\usepackage[T1]{fontenc}', '\\usepackage[utf8]{inputenc}', '\\usepackage{lmodern}', '\\usepackage{enumitem}', '\\usepackage{titlesec}', '\\usepackage[hidelinks]{hyperref}', '\\usepackage{xcolor}',
    `\\definecolor{accent}{HTML}{${accentHex.replace('#', '').toUpperCase()}}`, '\\newcommand{\\rupee}{Rs.}', '\\pagestyle{empty}', '\\setlength{\\parindent}{0pt}',
    '\\titleformat{\\section}{\\large\\bfseries\\color{accent}}{}{0em}{}[\\titlerule]', '\\titlespacing*{\\section}{0pt}{10pt}{5pt}', '\\setlist[itemize]{leftmargin=1.2em,itemsep=1pt,topsep=2pt}',
    '\\newcommand{\\entry}[4]{\\textbf{#1} \\hfill {\\small #2}\\\\\\textit{#3}\\ifx&#4&\\else\\\\#4\\fi\\par\\smallskip}', '', '\\begin{document}', '')
  lines.push(`{\\LARGE\\bfseries ${tex(r.name)}}\\\\[2pt]`)
  if (r.title) lines.push(`{\\large\\color{accent} ${tex(r.title)}}\\\\[4pt]`)
  const contact = [r.email && `\\href{mailto:${r.email}}{${tex(r.email)}}`, r.phone && tex(r.phone), r.location && tex(r.location), r.links && tex(r.links)].filter(Boolean)
  lines.push(`{\\small ${contact.join(' \\textbar{} ')}}`, '')
  if (r.summary.trim()) lines.push('\\section*{Summary}', tex(r.summary), '')
  const jobs = r.jobs.filter((j) => j.role || j.org)
  if (jobs.length) {
    lines.push('\\section*{Experience}')
    for (const j of jobs) {
      lines.push(`\\entry{${tex(j.role)}}{${tex(dates(j.start, j.end))}}{${tex([j.org, j.place].filter(Boolean).join(', '))}}{}`)
      const b = bullets(j.bullets)
      if (b.length) lines.push('\\begin{itemize}', ...b.map((x) => `  \\item ${tex(x)}`), '\\end{itemize}')
    }
    lines.push('')
  }
  const edu = r.education.filter((e) => e.degree || e.school)
  if (edu.length) {
    lines.push('\\section*{Education}')
    for (const e of edu) lines.push(`\\entry{${tex(e.degree)}}{${tex(dates(e.start, e.end))}}{${tex([e.school, e.place].filter(Boolean).join(', '))}}{${tex(e.detail)}}`)
    lines.push('')
  }
  if (r.skills.trim()) lines.push('\\section*{Skills}', r.skills.split(/\s*[,;\n]\s*/).filter(Boolean).map(tex).join(' $\\cdot$ '), '')
  const projects = r.projects.filter((p) => p.name)
  if (projects.length) {
    lines.push('\\section*{Projects}')
    for (const p of projects) lines.push(`\\textbf{${tex(p.name)}}${p.link ? ` \\hfill {\\small \\url{${p.link.replace(/[{}\\]/g, '')}}}` : ''}\\\\`, `${tex(p.detail)}\\par\\smallskip`)
    lines.push('')
  }
  if (r.certifications.trim()) lines.push('\\section*{Certifications}', '\\begin{itemize}', ...r.certifications.split('\n').filter((x) => x.trim()).map((x) => `  \\item ${tex(x)}`), '\\end{itemize}', '')
  if (r.languages.trim()) lines.push('\\section*{Languages}', tex(r.languages), '')
  lines.push('\\end{document}', '')
  return lines.join('\n')
}
