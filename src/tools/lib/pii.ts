import type { TextRun } from './pdf'

/* ----------------------------------------------------------- validators */

const VD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const VP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
/** Verhoeff checksum – the check digit scheme used by Aadhaar numbers. */
export function verhoeff(num: string): boolean {
  let c = 0
  const digits = num.replace(/\D/g, '').split('').reverse().map(Number)
  digits.forEach((d, i) => (c = VD[c][VP[i % 8][d]]))
  return c === 0
}

/** Luhn checksum – payment card numbers. */
export function luhn(num: string): boolean {
  const d = num.replace(/\D/g, '')
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

/* ------------------------------------------------------------- patterns */

export interface PiiType { id: string; label: string; re: RegExp; validate?: (m: string) => boolean; risk: 'high' | 'medium' | 'low'; india?: boolean }

export const PII_TYPES: PiiType[] = [
  { id: 'aadhaar', label: 'Aadhaar number', re: /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g, validate: verhoeff, risk: 'high', india: true },
  { id: 'pan', label: 'PAN', re: /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/g, risk: 'high', india: true },
  { id: 'card', label: 'Payment card number', re: /\b(?:\d[ -]?){12,18}\d\b/g, validate: luhn, risk: 'high' },
  { id: 'gstin', label: 'GSTIN', re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, risk: 'medium', india: true },
  { id: 'passport', label: 'Passport number (India)', re: /\b[A-PR-WY][1-9]\d\s?\d{4}[1-9]\b/g, risk: 'high', india: true },
  { id: 'voter', label: 'Voter ID (EPIC)', re: /\b[A-Z]{3}\d{7}\b/g, risk: 'medium', india: true },
  { id: 'ifsc', label: 'IFSC code', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, risk: 'low', india: true },
  { id: 'upi', label: 'UPI ID', re: /\b[\w.-]{2,}@(?:ok)?[a-z]{2,}\b(?!\.)/g, validate: (m) => !/\.[a-z]{2,}$/i.test(m.split('@')[1] ?? ''), risk: 'medium', india: true },
  { id: 'email', label: 'Email address', re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, risk: 'medium' },
  { id: 'phone-in', label: 'Indian phone number', re: /(?:\+91[\s-]?|\b0)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, risk: 'medium', india: true },
  { id: 'phone', label: 'Phone number (international)', re: /\+(?:[1-9]\d{0,2})[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b/g, risk: 'medium' },
  { id: 'ssn', label: 'US Social Security number', re: /\b\d{3}-\d{2}-\d{4}\b/g, risk: 'high' },
  { id: 'iban', label: 'IBAN', re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g, risk: 'high' },
  { id: 'ip', label: 'IP address', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, risk: 'low' },
  { id: 'dob', label: 'Date (possible birth date)', re: /\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b/g, risk: 'low' },
]

export interface Finding { type: string; label: string; value: string; page: number; start: number; end: number; risk: PiiType['risk'] }

export function findPii(text: string, page: number, types: string[], custom: string[] = []): Finding[] {
  const out: Finding[] = []
  const taken: [number, number][] = []
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x)
  for (const t of PII_TYPES) {
    if (!types.includes(t.id)) continue
    for (const m of text.matchAll(t.re)) {
      const v = m[0]
      const s = m.index ?? 0
      if (t.validate && !t.validate(v)) continue
      if (overlaps(s, s + v.length)) continue
      taken.push([s, s + v.length])
      out.push({ type: t.id, label: t.label, value: v, page, start: s, end: s + v.length, risk: t.risk })
    }
  }
  for (const word of custom.map((w) => w.trim()).filter(Boolean)) {
    const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    for (const m of text.matchAll(re)) {
      const s = m.index ?? 0
      if (overlaps(s, s + m[0].length)) continue
      taken.push([s, s + m[0].length])
      out.push({ type: 'custom', label: 'Custom term', value: m[0], page, start: s, end: s + m[0].length, risk: 'medium' })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/* --------------------------------------------- page text ↔ rectangles */

export interface IndexedText { text: string; map: { run: number; offset: number }[] }

/** Concatenates runs in reading order so regexes can match across runs; keeps a char → run map. */
export function indexRuns(runs: TextRun[]): IndexedText {
  const order = runs.map((r, i) => ({ r, i })).filter(({ r }) => r.str.length).sort((a, b) => {
    const dy = a.r.y + a.r.h / 2 - (b.r.y + b.r.h / 2)
    return Math.abs(dy) < Math.min(a.r.h, b.r.h) * 0.5 ? a.r.x - b.r.x : dy
  })
  let text = ''
  const map: IndexedText['map'] = []
  let prev: TextRun | null = null
  for (const { r, i } of order) {
    if (prev) {
      const sameLine = Math.abs(prev.y + prev.h / 2 - (r.y + r.h / 2)) < Math.min(prev.h, r.h) * 0.5
      const sep = sameLine ? (r.x - (prev.x + prev.w) > r.size * 0.15 && !text.endsWith(' ') && !r.str.startsWith(' ') ? ' ' : '') : '\n'
      for (const c of sep) {
        text += c
        map.push({ run: -1, offset: 0 })
      }
    }
    for (let k = 0; k < r.str.length; k++) {
      text += r.str[k]
      map.push({ run: i, offset: k })
    }
    prev = r
  }
  return { text, map }
}

export interface Box { x: number; y: number; w: number; h: number }

/** Page-space boxes (top-left origin, points) covering text[start, end). */
export function boxesFor(runs: TextRun[], idx: IndexedText, start: number, end: number, pad = 1): Box[] {
  const per = new Map<number, [number, number]>()
  for (let k = start; k < end; k++) {
    const m = idx.map[k]
    if (!m || m.run < 0) continue
    const cur = per.get(m.run)
    per.set(m.run, cur ? [Math.min(cur[0], m.offset), Math.max(cur[1], m.offset + 1)] : [m.offset, m.offset + 1])
  }
  const out: Box[] = []
  for (const [ri, [a, b]] of per) {
    const r = runs[ri]
    const len = r.str.length || 1
    const x0 = r.x + (r.w * a) / len
    const x1 = r.x + (r.w * b) / len
    out.push({ x: x0 - pad, y: r.y - pad - r.h * 0.1, w: x1 - x0 + 2 * pad, h: r.h * 1.25 + 2 * pad })
  }
  return out
}

export const mask = (v: string) => (v.length <= 4 ? '•'.repeat(v.length) : `${v.slice(0, 2)}${'•'.repeat(Math.max(2, v.length - 4))}${v.slice(-2)}`)
