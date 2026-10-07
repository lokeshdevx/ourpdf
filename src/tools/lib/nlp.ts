/**
 * On-device text intelligence, no model download needed: sentence segmentation, TF-IDF, TextRank summaries,
 * keyword extraction and BM25 passage retrieval. Optional neural embeddings (see ai-client) refine retrieval.
 */

const STOP = new Set('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each either else ever every few for from further had has have having he her here hers herself him himself his how however i if in into is it its itself just let may me might more most must my myself neither no nor not now of off on once only or other ought our ours ourselves out over own per same shall she should so some such than that the their theirs them themselves then there these they this those through thus to too under until up upon us very via was we were what when where whether which while who whom whose why will with within without would yet you your yours yourself yourselves'.split(' '))

export function tokens(s: string): string[] {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9ऀ-ॿ]+/g)?.filter((w) => w.length > 1 && !STOP.has(w)).map(stem) ?? []
}

/** Very light suffix stripping so "invoices" matches "invoice". */
function stem(w: string): string {
  if (w.length < 5) return w
  return w.replace(/(ingly|edly|ations?|ments?|ness|ities|ity|ies|ing|ed|es|s)$/, (m) => (m === 'ies' || m === 'ities' ? 'y' : ''))
}

export function sentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const parts = clean.match(/[^.!?।]+(?:[.!?।]+["')\]]*|$)/g) ?? [clean]
  const out: string[] = []
  for (const p of parts) {
    const s = p.trim()
    if (!s) continue
    // re-join abbreviations like "e.g." / "Mr." / "No. 5"
    if (out.length && /\b(?:mr|mrs|ms|dr|prof|sr|jr|vs|etc|e\.g|i\.e|no|fig|inc|ltd|co|st)\.$/i.test(out[out.length - 1])) out[out.length - 1] += ` ${s}`
    else out.push(s)
  }
  return out.filter((s) => s.length > 2)
}

function tfidfVectors(docs: string[][]): Map<string, number>[] {
  const df = new Map<string, number>()
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1)
  const N = docs.length
  return docs.map((d) => {
    const tf = new Map<string, number>()
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1)
    const v = new Map<string, number>()
    for (const [w, c] of tf) v.set(w, (c / d.length) * Math.log(1 + N / (df.get(w) ?? 1)))
    return v
  })
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0
  for (const [w, x] of a) {
    na += x * x
    const y = b.get(w)
    if (y) dot += x * y
  }
  for (const y of b.values()) nb += y * y
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export interface Summary { sentences: string[]; keywords: string[]; ratio: number }

/** TextRank: sentences vote for similar sentences; the top-ranked ones (in original order) form the summary. */
export function summarize(text: string, opts: { count?: number; ratio?: number } = {}): Summary {
  let sents = sentences(text)
  // very long documents: rank a stride sample to keep the O(n²) graph tractable
  if (sents.length > 1200) {
    const step = Math.ceil(sents.length / 1200)
    sents = sents.filter((_, i) => i % step === 0)
  }
  const toks = sents.map(tokens)
  const keep = toks.map((t) => t.length >= 4)
  const vecs = tfidfVectors(toks)
  const n = sents.length
  const target = Math.max(1, Math.min(n, opts.count ?? Math.round(n * (opts.ratio ?? 0.15)) ?? 5))
  if (n <= target) return { sentences: sents, keywords: keywords(text, 12), ratio: 1 }
  const W: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!keep[i] || !keep[j]) continue
    const s = cosine(vecs[i], vecs[j])
    W[i][j] = W[j][i] = s
  }
  const sums = W.map((r) => r.reduce((a, b) => a + b, 0))
  let score = new Array(n).fill(1 / n)
  for (let it = 0; it < 40; it++) {
    const next = new Array(n).fill((1 - 0.85) / n)
    for (let i = 0; i < n; i++) {
      if (!sums[i]) continue
      for (let j = 0; j < n; j++) if (W[i][j]) next[j] += (0.85 * score[i] * W[i][j]) / sums[i]
    }
    score = next
  }
  // slight preference for early sentences (lead bias) and penalty for very short/long ones
  const ranked = score.map((s, i) => ({ i, s: s * (1 + 0.3 * (1 - i / n)) * (keep[i] ? 1 : 0.1) * (sents[i].length > 400 ? 0.6 : 1) }))
  ranked.sort((a, b) => b.s - a.s)
  const chosen: number[] = []
  for (const r of ranked) {
    if (chosen.length >= target) break
    // skip near-duplicates
    if (chosen.some((c) => cosine(vecs[c], vecs[r.i]) > 0.7)) continue
    chosen.push(r.i)
  }
  chosen.sort((a, b) => a - b)
  return { sentences: chosen.map((i) => sents[i]), keywords: keywords(text, 12), ratio: chosen.length / n }
}

/** Keyword phrases (RAKE-style: runs of non-stopwords scored by word degree/frequency). */
export function keywords(text: string, count: number): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9'-]*|[.,;:!?()\n]/g) ?? []
  const phrases: string[][] = []
  let cur: string[] = []
  for (const w of words) {
    if (STOP.has(w) || /^[.,;:!?()\n]$/.test(w) || w.length < 3) {
      if (cur.length) phrases.push(cur)
      cur = []
    } else cur.push(w)
  }
  if (cur.length) phrases.push(cur)
  const freq = new Map<string, number>()
  const degree = new Map<string, number>()
  for (const p of phrases) for (const w of p) {
    freq.set(w, (freq.get(w) ?? 0) + 1)
    degree.set(w, (degree.get(w) ?? 0) + p.length)
  }
  const scored = new Map<string, number>()
  for (const p of phrases) {
    if (p.length > 4) continue
    const key = p.join(' ')
    scored.set(key, (scored.get(key) ?? 0) + p.reduce((s, w) => s + (degree.get(w)! / freq.get(w)!), 0) * Math.log(1 + (freq.get(p[0]) ?? 1)))
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k, i, arr) => !arr.slice(0, i).some((o) => o.includes(k))).slice(0, count)
}

/* ----------------------------------------------------------- retrieval */

export interface Passage { id: number; page: number; text: string; tokens: string[] }

/** Splits page texts into overlapping ~3-sentence passages. */
export function makePassages(pages: string[]): Passage[] {
  const out: Passage[] = []
  pages.forEach((t, p) => {
    const s = sentences(t)
    for (let i = 0; i < s.length; i += 2) {
      const text = s.slice(i, i + 3).join(' ')
      if (text.length < 20) continue
      out.push({ id: out.length, page: p + 1, text, tokens: tokens(text) })
    }
    if (!s.length && t.trim()) out.push({ id: out.length, page: p + 1, text: t.trim().slice(0, 600), tokens: tokens(t) })
  })
  return out
}

export class Bm25 {
  private df = new Map<string, number>()
  private avg: number
  constructor(private passages: Passage[], private k1 = 1.4, private b = 0.75) {
    for (const p of passages) for (const w of new Set(p.tokens)) this.df.set(w, (this.df.get(w) ?? 0) + 1)
    this.avg = passages.reduce((s, p) => s + p.tokens.length, 0) / Math.max(1, passages.length)
  }
  search(query: string, k = 5): { passage: Passage; score: number }[] {
    const q = [...new Set(tokens(query))]
    const N = this.passages.length
    const res = this.passages.map((p) => {
      const tf = new Map<string, number>()
      for (const w of p.tokens) tf.set(w, (tf.get(w) ?? 0) + 1)
      let s = 0
      for (const w of q) {
        const f = tf.get(w)
        if (!f) continue
        const idf = Math.log(1 + (N - (this.df.get(w) ?? 0) + 0.5) / ((this.df.get(w) ?? 0) + 0.5))
        s += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * p.tokens.length) / this.avg))
      }
      return { passage: p, score: s }
    })
    return res.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k)
  }
}

/** Picks the sentences of the best passages that overlap the question most – an extractive answer. */
export function extractAnswer(question: string, hits: { passage: Passage }[], maxSentences = 3): { answer: string; pages: number[] } {
  const q = new Set(tokens(question))
  const cands: { s: string; page: number; score: number; rank: number }[] = []
  hits.forEach((h, rank) => {
    for (const s of sentences(h.passage.text)) {
      const t = tokens(s)
      const overlap = t.filter((w) => q.has(w)).length
      if (!overlap) continue
      cands.push({ s, page: h.passage.page, score: overlap / Math.sqrt(t.length + 1) + (hits.length - rank) * 0.05, rank })
    }
  })
  const seen = new Set<string>()
  const best = cands.sort((a, b) => b.score - a.score).filter((c) => !seen.has(c.s) && seen.add(c.s)).slice(0, maxSentences)
  best.sort((a, b) => a.rank - b.rank)
  return { answer: best.map((b) => b.s).join(' '), pages: [...new Set(best.map((b) => b.page))] }
}

export function cosineVec(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export function stats(text: string) {
  const words = text.match(/\S+/g)?.length ?? 0
  return { words, sentences: sentences(text).length, readingMinutes: Math.max(1, Math.round(words / 230)) }
}
