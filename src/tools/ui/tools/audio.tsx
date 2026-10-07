'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Pause, Play, Square, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { blocksToPdfBlob } from '@/services/convert/to-pdf'
import { decodeAudio, modelAvailable, stopAi, transcribe, type Transcript } from '@/tools/lib/ai-client'
import { buildDocx } from '@/tools/lib/docx'
import { sentences } from '@/tools/lib/nlp'
import { allPageText, baseName, closePdf, groupLines, openPdfjs, paragraphs } from '@/tools/lib/pdf'
import { FileChip, FileDrop, Grid, Note, Panel, PdfPicker, Range, Results, RunBar, Select, TextArea, TextInput, Toggle, usePdfInput, useTask, type OutFile } from '../kit'

const LANGS: readonly (readonly [string, string])[] = [['auto', 'Detect automatically'], ['english', 'English'], ['hindi', 'Hindi'], ['bengali', 'Bengali'], ['tamil', 'Tamil'], ['telugu', 'Telugu'], ['marathi', 'Marathi'], ['gujarati', 'Gujarati'], ['kannada', 'Kannada'], ['malayalam', 'Malayalam'], ['punjabi', 'Punjabi'], ['urdu', 'Urdu'], ['spanish', 'Spanish'], ['french', 'French'], ['german', 'German'], ['portuguese', 'Portuguese'], ['arabic', 'Arabic'], ['chinese', 'Chinese'], ['japanese', 'Japanese']]

const ts = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/* ---------------------------------------------------------- Audio → PDF */

export function AudioToPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [lang, setLang] = useState('auto')
  const [stamps, setStamps] = useState(true)
  const [title, setTitle] = useState('Transcript')
  const [text, setText] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [recording, setRecording] = useState<MediaRecorder | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  useEffect(() => {
    void modelAvailable('asr').then(setAvailable)
    return () => stopAi()
  }, [])
  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])
  const record = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: rec.mimeType })
        setFile(new File([blob], `recording-${new Date().toISOString().slice(0, 16).replace(':', '')}.${rec.mimeType.includes('ogg') ? 'ogg' : 'webm'}`, { type: rec.mimeType }))
        setRecording(null)
      }
      rec.start()
      setSeconds(0)
      setRecording(rec)
    } catch {
      task.setError('Microphone access was denied or no microphone is available.')
    }
  }
  return (
    <div className="space-y-6">
      {available === false && <Note tone="warn">The on-device speech model is not installed on this server. Whoever hosts OurPDF can add it with <code className="rounded bg-muted px-1">npm run models</code> (about 75 MB, downloaded once). It is never fetched from a third party at runtime.</Note>}
      <Panel title="Audio">
        <div className="space-y-4">
          {file ? <FileChip file={file} onRemove={() => { setFile(null); setText('') }} /> : (
            <div className="space-y-3">
              <FileDrop accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.aac,.flac,.opus" label="Choose audio or video" onFiles={(f) => setFile(f[0])} />
              <div className="flex items-center justify-center gap-3">
                {recording ? <Button variant="destructive" onClick={() => recording.stop()}><Square className="mr-2 size-4" aria-hidden /> Stop recording ({ts(seconds)})</Button> : <Button variant="outline" onClick={() => void record()}><Mic className="mr-2 size-4" aria-hidden /> Record with microphone</Button>}
              </div>
            </div>
          )}
          <Grid>
            <Select label="Spoken language" value={lang} onChange={setLang} options={LANGS} />
            <Toggle label="Include timestamps" checked={stamps} onChange={setStamps} />
          </Grid>
          <p className="text-xs text-muted-foreground">Whisper AI runs inside your browser (WebAssembly). Expect roughly real-time speed on a laptop; phones are slower. The audio never leaves your device.</p>
        </div>
      </Panel>
      <RunBar task={task} label="Transcribe" disabled={!file || available === false} onRun={async () => {
        const r = await task.run(async (p) => {
          p(0, 'Decoding audio')
          const audio = await decodeAudio(file!)
          const res: Transcript = await transcribe(audio, { language: lang === 'auto' ? null : lang, timestamps: stamps }, (f, stage) => p(f, stage))
          if (stamps && res.chunks?.length) return res.chunks.map((c) => `[${ts(c.timestamp[0] ?? 0)}] ${c.text.trim()}`).join('\n')
          return res.text.trim()
        }, 'Preparing')
        if (r !== undefined) {
          setText(r || '(no speech detected)')
          setTitle(baseName(file!.name))
        }
      }} />
      {text && (
        <Panel title="Transcript (edit before exporting)">
          <div className="space-y-4">
            <TextInput label="Title" value={title} onChange={setTitle} />
            <TextArea label="Text" value={text} onChange={setText} rows={14} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={async () => setOut([{ name: `${title || 'transcript'}.pdf`, blob: await blocksToPdfBlob([{ type: 'heading', level: 1, runs: [{ text: title }] }, { type: 'paragraph', runs: [{ text: `Transcribed on ${new Date().toLocaleDateString()} with on-device Whisper`, italic: true, color: '#666666' }] }, ...text.split(/\n+/).filter(Boolean).map((l) => ({ type: 'paragraph' as const, runs: [{ text: l }] }))], { title }) }])}>Create PDF</Button>
              <Button variant="outline" onClick={async () => setOut([{ name: `${title || 'transcript'}.docx`, blob: await buildDocx([{ type: 'p', text: title, style: 'Title' }, ...text.split(/\n+/).filter(Boolean).map((l) => ({ type: 'p' as const, text: l }))], { title }) }])}>Word</Button>
              <Button variant="outline" onClick={() => setOut([{ name: `${title || 'transcript'}.txt`, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }])}>Text</Button>
            </div>
          </div>
        </Panel>
      )}
      <Results files={out} onReset={() => setOut([])} />
    </div>
  )
}

/* ---------------------------------------------------------- PDF → Audio */

export function PdfToAudio() {
  const pdf = usePdfInput()
  const [pages, setPages] = useState<string[][] | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voice, setVoice] = useState('')
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(1)
  const [pos, setPos] = useState(0)
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle')
  const posRef = useRef(0)
  const stopped = useRef(false)
  const task = useTask()
  const flat = useMemo(() => (pages ?? []).flatMap((s, p) => s.map((t) => ({ t, p }))), [pages])
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  useEffect(() => {
    if (!supported) return
    const load = () => {
      const v = speechSynthesis.getVoices()
      setVoices(v)
      setVoice((cur) => cur || v.find((x) => x.default)?.voiceURI || v[0]?.voiceURI || '')
    }
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', load)
      speechSynthesis.cancel()
    }
  }, [supported])
  const speakFrom = (i: number) => {
    speechSynthesis.cancel()
    stopped.current = false
    const next = (k: number) => {
      if (stopped.current || k >= flat.length) {
        if (k >= flat.length) setState('idle')
        return
      }
      posRef.current = k
      setPos(k)
      const u = new SpeechSynthesisUtterance(flat[k].t)
      const v = voices.find((x) => x.voiceURI === voice)
      if (v) {
        u.voice = v
        u.lang = v.lang
      }
      u.rate = rate
      u.pitch = pitch
      u.onend = () => next(k + 1)
      u.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') next(k + 1)
      }
      speechSynthesis.speak(u)
    }
    setState('playing')
    next(i)
  }
  const current = flat[pos]
  useEffect(() => {
    document.getElementById(`sent-${pos}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [pos])
  return (
    <div className="space-y-6">
      {!supported && <Note tone="warn">Your browser has no speech engine. Try Chrome, Edge, Safari or Firefox on a desktop or phone.</Note>}
      <Panel title="PDF"><PdfPicker pdf={{ ...pdf, reset: () => { speechSynthesis.cancel(); setPages(null); setState('idle'); pdf.reset() } }} /></Panel>
      {pdf.input && !pages && <RunBar task={task} label="Prepare for reading" onRun={async () => {
        const r = await task.run(async (p) => {
          const doc = await openPdfjs(pdf.input!.bytes)
          const all = await allPageText(doc, p)
          await closePdf(doc)
          const res = all.map((pg) => sentences(paragraphs(groupLines(pg.runs)).map((x) => x.text).join(' ')))
          if (!res.some((s) => s.length)) throw new Error('This PDF has no readable text (it is probably scanned). Run OCR first.')
          return res
        }, 'Reading text')
        if (r) setPages(r)
      }} />}
      {pages && (
        <>
          <Panel>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" aria-label="Previous sentence" onClick={() => speakFrom(Math.max(0, posRef.current - 1))}><SkipBack className="size-4" /></Button>
                {state === 'playing'
                  ? <Button size="lg" onClick={() => { speechSynthesis.pause(); setState('paused') }}><Pause className="mr-2 size-5" aria-hidden /> Pause</Button>
                  : <Button size="lg" onClick={() => { if (state === 'paused') { speechSynthesis.resume(); setState('playing') } else speakFrom(posRef.current) }}><Play className="mr-2 size-5" aria-hidden /> {state === 'paused' ? 'Resume' : 'Play'}</Button>}
                <Button variant="outline" size="icon" aria-label="Next sentence" onClick={() => speakFrom(Math.min(flat.length - 1, posRef.current + 1))}><SkipForward className="size-4" /></Button>
                <Button variant="ghost" onClick={() => { stopped.current = true; speechSynthesis.cancel(); setState('idle') }}><Square className="mr-1.5 size-4" aria-hidden /> Stop</Button>
                <span className="ml-auto text-sm text-muted-foreground">Page {(current?.p ?? 0) + 1} of {pages.length} · {Math.round((pos / Math.max(1, flat.length)) * 100)}%</span>
              </div>
              <Grid cols={3}>
                <Select label="Voice" value={voice} onChange={(v) => { setVoice(v); if (state === 'playing') setTimeout(() => speakFrom(posRef.current), 0) }} options={voices.length ? voices.map((v) => [v.voiceURI, `${v.name} (${v.lang})${v.localService ? '' : ' · online'}`] as const) : [['', 'Default voice']]} />
                <Range label="Speed" value={rate} min={0.5} max={2} step={0.1} onChange={setRate} format={(v) => `${v.toFixed(1)}×`} />
                <Range label="Pitch" value={pitch} min={0.5} max={1.5} step={0.1} onChange={setPitch} format={(v) => v.toFixed(1)} />
              </Grid>
              <Select label="Jump to page" value={String(current?.p ?? 0)} onChange={(v) => { const i = flat.findIndex((x) => x.p === Number(v)); if (i >= 0) speakFrom(i) }} options={pages.map((_, i) => [String(i), `Page ${i + 1}`] as const)} />
              <p className="text-xs text-muted-foreground">Voices marked “online” are provided by your browser or operating system vendor and may send text to their servers; local voices run entirely on your device.</p>
            </div>
          </Panel>
          <Panel title="Text">
            <div className="max-h-[50vh] overflow-auto text-[15px] leading-relaxed">
              {flat.map((s, i) => (
                <span key={i}>
                  {(i === 0 || flat[i - 1].p !== s.p) && <span className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Page {s.p + 1}</span>}
                  <span id={`sent-${i}`} role="button" tabIndex={0} onClick={() => speakFrom(i)} onKeyDown={(e) => e.key === 'Enter' && speakFrom(i)} className={cn('cursor-pointer rounded px-0.5 hover:bg-muted', i === pos && state !== 'idle' && 'bg-primary/20')}>{s.t} </span>
                </span>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
