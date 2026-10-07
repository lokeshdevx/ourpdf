'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Copy, Send, Sparkles, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { blocksToPdfBlob } from '@/services/convert/to-pdf'
import { embed, modelAvailable, stopAi } from '@/tools/lib/ai-client'
import { Bm25, cosineVec, extractAnswer, keywords, makePassages, sentences, stats, summarize, type Passage } from '@/tools/lib/nlp'
import { allPageText, baseName, closePdf, groupLines, openPdfjs, paragraphs } from '@/tools/lib/pdf'
import { Note, Panel, PdfPicker, Results, RunBar, Segmented, Select, Toggle, usePdfInput, useTask, type OutFile } from '../kit'

async function documentText(bytes: Uint8Array, onProgress: (f: number) => void): Promise<string[]> {
  const doc = await openPdfjs(bytes)
  const pages = await allPageText(doc, onProgress)
  await closePdf(doc)
  const texts = pages.map((p) => paragraphs(groupLines(p.runs)).map((x) => x.text).join('\n'))
  if (!texts.some((t) => t.trim())) throw new Error('This PDF has no text layer (it is probably scanned). Make it searchable with OCR first.')
  return texts
}

/* ---------------------------------------------------------- chat with PDF */

interface Msg { role: 'user' | 'bot'; text: string; pages?: number[]; sources?: Passage[] }

export function ChatWithPdf() {
  const pdf = usePdfInput()
  const [index, setIndex] = useState<{ passages: Passage[]; bm25: Bm25; vectors: Float32Array[] | null; pages: string[] } | null>(null)
  const [semantic, setSemantic] = useState(true)
  const [hasModel, setHasModel] = useState<boolean | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [thinking, setThinking] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const task = useTask()
  useEffect(() => {
    void modelAvailable('embed').then(setHasModel)
    return () => stopAi()
  }, [])
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [msgs])
  const suggestions = index ? keywords(index.pages.join('\n'), 4).map((k) => `What does it say about ${k}?`) : []

  const ask = async (question: string) => {
    if (!index || !question.trim()) return
    setMsgs((m) => [...m, { role: 'user', text: question }])
    setQ('')
    setThinking(true)
    try {
      let reply: Msg
      if (/^\s*(summari[sz]e|summary|tl;?dr|overview)\b/i.test(question)) {
        const s = summarize(index.pages.join('\n'), { count: 6 })
        reply = { role: 'bot', text: s.sentences.join(' ') }
      } else if (/how many pages/i.test(question)) {
        reply = { role: 'bot', text: `The document has ${index.pages.length} page${index.pages.length === 1 ? '' : 's'}.` }
      } else {
        let hits = index.bm25.search(question, 8)
        if (index.vectors) {
          const [qv] = await embed([question])
          const maxB = Math.max(1e-6, ...hits.map((h) => h.score))
          const bm = new Map(hits.map((h) => [h.passage.id, h.score / maxB]))
          const scored = index.passages.map((p, i) => ({ passage: p, score: 0.65 * cosineVec(qv, index.vectors![i]) + 0.35 * (bm.get(p.id) ?? 0) }))
          hits = scored.sort((a, b) => b.score - a.score).slice(0, 6)
        }
        let { answer, pages } = extractAnswer(question, hits.slice(0, 5), 3)
        if (index.vectors && hits.length) {
          // rank the sentences of the best passages by meaning, keep the closest ones in reading order
          const cands = [...new Map(hits.slice(0, 3).flatMap((h) => sentences(h.passage.text).map((t) => [t, h.passage.page] as const))).entries()]
          const vecs = await embed([question, ...cands.map(([t]) => t)])
          const ranked = cands.map(([t, pg], i) => ({ t, pg, i, s: cosineVec(vecs[0], vecs[i + 1]) })).sort((a, b) => b.s - a.s)
          const top = ranked.filter((r) => r.s >= ranked[0].s - 0.08).slice(0, 2).sort((a, b) => a.i - b.i)
          if (top.length) {
            answer = top.map((r) => r.t).join(' ')
            pages = [...new Set(top.map((r) => r.pg))]
          }
        }
        const best = answer || hits[0]?.passage.text || ''
        reply = best
          ? { role: 'bot', text: best, pages: pages.length ? pages : hits.slice(0, 1).map((h) => h.passage.page), sources: hits.slice(0, 3).map((h) => h.passage) }
          : { role: 'bot', text: 'I couldn’t find anything about that in this document. Try different words, or ask about a topic it covers.' }
      }
      setMsgs((m) => [...m, reply])
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', text: `Something went wrong: ${(e as Error).message}` }])
    } finally {
      setThinking(false)
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setIndex(null); setMsgs([]); pdf.reset() } }} /></Panel>
      {pdf.input && !index && (
        <Panel>
          <div className="space-y-4">
            {hasModel && <Toggle label="Understand meaning, not just keywords" hint="Uses a small on-device neural model (MiniLM) to match questions to passages with similar meaning" checked={semantic} onChange={setSemantic} />}
            <RunBar task={task} label="Start chatting" onRun={async () => {
              const r = await task.run(async (p) => {
                const pages = await documentText(pdf.input!.bytes, (f) => p(f * 0.3, 'Reading the document'))
                const passages = makePassages(pages)
                const bm25 = new Bm25(passages)
                const vectors = semantic && hasModel ? await embed(passages.map((x) => x.text), (f, stage) => p(0.3 + f * 0.7, stage)) : null
                return { pages, passages, bm25, vectors }
              }, 'Preparing')
              if (r) {
                setIndex(r)
                const st = stats(r.pages.join(' '))
                setMsgs([{ role: 'bot', text: `I’ve read “${pdf.input!.file.name}” – ${r.pages.length} page${r.pages.length === 1 ? '' : 's'}, about ${st.words.toLocaleString()} words. Ask me anything about it, or say “summarise”.` }])
              }
            }} />
          </div>
        </Panel>
      )}
      {index && (
        <Panel className="flex h-[70vh] flex-col p-0 sm:p-0">
          <div className="flex-1 space-y-4 overflow-auto p-4" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{m.role === 'user' ? <User className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}</span>
                <div className={cn('max-w-[85%] space-y-2 rounded-2xl px-4 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.pages && m.pages.length > 0 && <p className="text-xs opacity-75">Source: page {m.pages.join(', ')}</p>}
                  {m.sources && m.sources.length > 0 && (
                    <details className="text-xs opacity-90"><summary className="cursor-pointer">Show passages</summary><ul className="mt-2 space-y-2">{m.sources.map((s) => <li key={s.id} className="rounded-lg bg-background/70 p-2"><strong>p{s.page}:</strong> {s.text}</li>)}</ul></details>
                  )}
                </div>
              </div>
            ))}
            {thinking && <p className="text-sm text-muted-foreground">Searching the document…</p>}
            <div ref={end} />
          </div>
          {msgs.length <= 1 && suggestions.length > 0 && <div className="flex flex-wrap gap-2 border-t p-3">{['Summarise this document', ...suggestions].map((s) => <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border bg-background px-3 py-1 text-xs hover:border-primary">{s}</button>)}</div>}
          <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void ask(q) }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question about the PDF…" aria-label="Your question" className="h-11 flex-1 rounded-xl border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <Button type="submit" size="lg" disabled={!q.trim() || thinking} aria-label="Send"><Send className="size-4" /></Button>
          </form>
        </Panel>
      )}
      <Note>Answers are taken word-for-word from your PDF and cite the page, so the assistant can’t invent facts. Everything – including the AI model – runs on your device.</Note>
    </div>
  )
}

/* ------------------------------------------------------------ summarizer */

export function Summarizer() {
  const pdf = usePdfInput()
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium')
  const [scope, setScope] = useState<'document' | 'pages'>('document')
  const [bullets, setBullets] = useState(true)
  const [result, setResult] = useState<{ sections: { title: string; sentences: string[] }[]; keywords: string[]; words: number; minutes: number; ratio: number } | null>(null)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  const text = result ? result.sections.map((s) => `${result.sections.length > 1 ? `${s.title}\n` : ''}${s.sentences.map((x) => (bullets ? `• ${x}` : x)).join(bullets ? '\n' : ' ')}`).join('\n\n') : ''
  return (
    <div className="space-y-6">
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { setResult(null); pdf.reset() } }} /></Panel>
      <Panel title="Summary style">
        <div className="space-y-4">
          <Segmented label="Length" value={length} onChange={setLength} options={[['short', 'Short – key points'], ['medium', 'Medium'], ['long', 'Detailed']]} />
          <Select label="Summarise" value={scope} onChange={setScope} options={[['document', 'The whole document'], ['pages', 'Each page separately']]} />
          <Toggle label="Bullet points" checked={bullets} onChange={setBullets} />
        </div>
      </Panel>
      <RunBar task={task} label={result ? 'Summarise again' : 'Summarise'} disabled={!pdf.input} onRun={async () => {
        const r = await task.run(async (p) => {
          const pages = await documentText(pdf.input!.bytes, (f) => p(f * 0.7, 'Reading'))
          const all = pages.join('\n')
          const st = stats(all)
          const target = (n: number) => (length === 'short' ? Math.min(5, n) : length === 'medium' ? Math.max(5, Math.round(n * 0.12)) : Math.max(8, Math.round(n * 0.25)))
          if (scope === 'pages') {
            const sections = pages.map((t, i) => ({ title: `Page ${i + 1}`, sentences: t.trim() ? summarize(t, { count: Math.max(1, Math.min(length === 'short' ? 2 : length === 'medium' ? 3 : 6, 99)) }).sentences : [] })).filter((s) => s.sentences.length)
            return { sections, keywords: keywords(all, 12), words: st.words, minutes: st.readingMinutes, ratio: 0 }
          }
          const s = summarize(all, { count: Math.min(40, target(st.sentences)) })
          return { sections: [{ title: 'Summary', sentences: s.sentences }], keywords: s.keywords, words: st.words, minutes: st.readingMinutes, ratio: s.ratio }
        }, 'Summarising')
        if (r) setResult(r)
      }} />
      {result && (
        <Panel title={<span className="flex items-center gap-2"><Sparkles className="size-5 text-primary" aria-hidden /> Summary</span>} actions={<Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(text); toast.success('Copied') }}><Copy className="mr-1.5 size-4" aria-hidden /> Copy</Button>}>
          <p className="mb-4 text-xs text-muted-foreground">{result.words.toLocaleString()} words · ~{result.minutes} min read → ~{Math.max(1, Math.round(text.split(/\s+/).length / 230))} min</p>
          <div className="space-y-4 text-[15px] leading-relaxed">
            {result.sections.map((s) => (
              <section key={s.title}>
                {result.sections.length > 1 && <h3 className="mb-1 font-semibold">{s.title}</h3>}
                {bullets ? <ul className="list-disc space-y-1.5 pl-5">{s.sentences.map((x) => <li key={x}>{x}</li>)}</ul> : <p>{s.sentences.join(' ')}</p>}
              </section>
            ))}
          </div>
          {result.keywords.length > 0 && <div className="mt-5"><p className="mb-2 text-sm font-medium">Key topics</p><div className="flex flex-wrap gap-2">{result.keywords.map((k) => <span key={k} className="rounded-full border bg-muted px-3 py-1 text-xs">{k}</span>)}</div></div>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={async () => {
              const name = baseName(pdf.input!.file.name)
              setOut([{ name: `${name}-summary.pdf`, blob: await blocksToPdfBlob([
                { type: 'heading', level: 1, runs: [{ text: `Summary – ${name}` }] },
                ...result.sections.flatMap((s) => [...(result.sections.length > 1 ? [{ type: 'heading' as const, level: 2 as const, runs: [{ text: s.title }] }] : []), bullets ? { type: 'list' as const, ordered: false, items: s.sentences.map((x) => [{ text: x }]) } : { type: 'paragraph' as const, runs: [{ text: s.sentences.join(' ') }] }]),
                { type: 'heading', level: 3, runs: [{ text: 'Key topics' }] }, { type: 'paragraph', runs: [{ text: result.keywords.join(', ') }] },
              ], { title: `${name} summary` }) }])
            }}>Download as PDF</Button>
            <Button variant="outline" onClick={() => setOut([{ name: `${baseName(pdf.input!.file.name)}-summary.txt`, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }])}>Download text</Button>
          </div>
        </Panel>
      )}
      <Results files={out} onReset={() => setOut([])} />
      <Note>The summariser picks the most representative sentences from your document (extractive summarisation with TextRank), so every line is a real quote – nothing is made up and nothing is uploaded.</Note>
    </div>
  )
}
