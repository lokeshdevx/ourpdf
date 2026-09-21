/** Parses "1-3, 5, 8-" (1-based, inclusive) into sorted unique 0-based indices. Throws on invalid input. */
export function parsePageRanges(input: string, total: number): number[] {
  const out = new Set<number>()
  const text = input.trim()
  if (!text) return []
  for (const raw of text.split(',')) {
    const part = raw.trim()
    if (!part) continue
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part)
    if (m && (m[1] || m[2])) {
      const a = m[1] ? parseInt(m[1], 10) : 1
      const b = m[2] ? parseInt(m[2], 10) : total
      if (a < 1 || b < 1 || a > total || b > total) throw new Error(`Range "${part}" is outside 1–${total}`)
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      for (let i = lo; i <= hi; i++) out.add(i - 1)
    } else if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10)
      if (n < 1 || n > total) throw new Error(`Page ${n} is outside 1–${total}`)
      out.add(n - 1)
    } else {
      throw new Error(`Invalid page range "${part}"`)
    }
  }
  return [...out].sort((a, b) => a - b)
}

/** Splits a list of ranges like "1-3, 4-6" into separate groups (no de-duplication across groups). */
export function parseRangeGroups(input: string, total: number): number[][] {
  return input
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((g) => parsePageRanges(g, total))
    .filter((g) => g.length > 0)
}

export function chunkEvery(total: number, n: number): number[][] {
  if (n < 1) throw new Error('N must be at least 1')
  const groups: number[][] = []
  for (let i = 0; i < total; i += n) {
    groups.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k))
  }
  return groups
}

export function oddIndices(total: number): number[] {
  return Array.from({ length: Math.ceil(total / 2) }, (_, i) => i * 2)
}
export function evenIndices(total: number): number[] {
  return Array.from({ length: Math.floor(total / 2) }, (_, i) => i * 2 + 1)
}

export function formatRanges(indices: number[]): string {
  const s = [...indices].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < s.length; ) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    parts.push(j > i ? `${s[i] + 1}-${s[j] + 1}` : `${s[i] + 1}`)
    i = j + 1
  }
  return parts.join(', ')
}

const ROMAN: [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
]
export function toRoman(n: number): string {
  let out = ''
  let v = Math.max(1, Math.floor(n))
  for (const [val, sym] of ROMAN) {
    while (v >= val) {
      out += sym
      v -= val
    }
  }
  return out
}
export function toAlpha(n: number): string {
  // 1→a … 26→z, 27→aa (PDF page labels repeat the letter: aa, bb; we use the PDF convention)
  const v = Math.max(1, Math.floor(n))
  const letter = String.fromCharCode(97 + ((v - 1) % 26))
  return letter.repeat(Math.floor((v - 1) / 26) + 1)
}
