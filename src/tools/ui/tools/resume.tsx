'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { closePdf, openPdfjs, renderPage } from '@/tools/lib/pdf'
import { EMPTY_EDU, EMPTY_JOB, EMPTY_PROJECT, resumeLatex, resumePdf, SAMPLE_RESUME, type Resume, type Template } from '@/tools/lib/resume'
import { ColorInput, Grid, Panel, Results, RunBar, TextArea, TextInput, pdfOut, useTask, type OutFile } from '../kit'

const KEY = 'ourpdf.resume.v1'
const TEMPLATES: [Template, string, string][] = [['modern', 'Modern', 'Colour header band'], ['classic', 'Classic', 'Serif, centred – traditional'], ['compact', 'Compact', 'Fits more on one page']]

export function ResumeBuilder() {
  const [r, setR] = useState<Resume>(SAMPLE_RESUME)
  const [tpl, setTpl] = useState<Template>('modern')
  const [accent, setAccent] = useState('#2952cc')
  const [preview, setPreview] = useState<string[]>([])
  const [out, setOut] = useState<OutFile[]>([])
  const task = useTask()
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the draft saved in this browser
        setR({ ...SAMPLE_RESUME, ...saved.r })
        setTpl(saved.tpl ?? 'modern')
        setAccent(saved.accent ?? '#2952cc')
      }
    } catch {
      /* ignore */
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ r, tpl, accent }))
    } catch {
      /* ignore */
    }
    let cancel = false
    const t = setTimeout(async () => {
      const bytes = await resumePdf(r, tpl, accent)
      const doc = await openPdfjs(bytes)
      const urls: string[] = []
      for (let i = 1; i <= Math.min(2, doc.numPages); i++) urls.push((await renderPage(await doc.getPage(i), 1.2)).toDataURL('image/jpeg', 0.85))
      await closePdf(doc)
      if (!cancel) setPreview(urls)
    }, 400)
    return () => {
      cancel = true
      clearTimeout(t)
    }
  }, [r, tpl, accent])
  const set = <K extends keyof Resume>(k: K, v: Resume[K]) => setR({ ...r, [k]: v })
  const list = <T,>(k: 'jobs' | 'education' | 'projects', i: number, patch: Partial<T>) => set(k, (r[k] as T[]).map((x, j) => (j === i ? { ...x, ...patch } : x)) as never)
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,460px)]">
      <div className="space-y-6">
        <Panel title="Template">
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map(([id, name, d]) => <button key={id} type="button" onClick={() => setTpl(id)} className={cn('rounded-xl border p-3 text-left', tpl === id ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary')}><span className="block font-semibold">{name}</span><span className="text-xs text-muted-foreground">{d}</span></button>)}
          </div>
          <div className="mt-4 max-w-xs"><ColorInput label="Accent colour" value={accent} onChange={setAccent} /></div>
        </Panel>
        <Panel title="Personal details">
          <Grid>
            <TextInput label="Full name" value={r.name} onChange={(v) => set('name', v)} />
            <TextInput label="Headline" value={r.title} onChange={(v) => set('title', v)} />
            <TextInput label="Email" type="email" value={r.email} onChange={(v) => set('email', v)} />
            <TextInput label="Phone" value={r.phone} onChange={(v) => set('phone', v)} />
            <TextInput label="Location" value={r.location} onChange={(v) => set('location', v)} />
            <TextInput label="Links" value={r.links} onChange={(v) => set('links', v)} placeholder="linkedin.com/in/you · github.com/you" />
          </Grid>
          <div className="mt-4"><TextArea label="Summary" value={r.summary} onChange={(v) => set('summary', v)} rows={3} /></div>
        </Panel>
        <Panel title="Experience" actions={<Button variant="outline" size="sm" onClick={() => set('jobs', [...r.jobs, { ...EMPTY_JOB }])}><Plus className="mr-1 size-4" aria-hidden /> Add</Button>}>
          <div className="space-y-4">
            {r.jobs.map((j, i) => (
              <div key={i} className="space-y-3 rounded-xl border p-3">
                <Grid>
                  <TextInput label="Role" value={j.role} onChange={(v) => list('jobs', i, { role: v })} />
                  <TextInput label="Company" value={j.org} onChange={(v) => list('jobs', i, { org: v })} />
                  <TextInput label="City" value={j.place} onChange={(v) => list('jobs', i, { place: v })} />
                  <div className="grid grid-cols-2 gap-2"><TextInput label="From" value={j.start} onChange={(v) => list('jobs', i, { start: v })} /><TextInput label="To" value={j.end} onChange={(v) => list('jobs', i, { end: v })} /></div>
                </Grid>
                <TextArea label="Achievements (one per line)" value={j.bullets} onChange={(v) => list('jobs', i, { bullets: v })} rows={3} />
                <Button variant="ghost" size="sm" onClick={() => set('jobs', r.jobs.filter((_, k) => k !== i))}><Trash2 className="mr-1 size-4" aria-hidden /> Remove</Button>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Education" actions={<Button variant="outline" size="sm" onClick={() => set('education', [...r.education, { ...EMPTY_EDU }])}><Plus className="mr-1 size-4" aria-hidden /> Add</Button>}>
          <div className="space-y-4">
            {r.education.map((e, i) => (
              <div key={i} className="space-y-3 rounded-xl border p-3">
                <Grid>
                  <TextInput label="Degree" value={e.degree} onChange={(v) => list('education', i, { degree: v })} />
                  <TextInput label="Institution" value={e.school} onChange={(v) => list('education', i, { school: v })} />
                  <TextInput label="City" value={e.place} onChange={(v) => list('education', i, { place: v })} />
                  <div className="grid grid-cols-2 gap-2"><TextInput label="From" value={e.start} onChange={(v) => list('education', i, { start: v })} /><TextInput label="To" value={e.end} onChange={(v) => list('education', i, { end: v })} /></div>
                </Grid>
                <TextInput label="Details (grade, honours)" value={e.detail} onChange={(v) => list('education', i, { detail: v })} />
                <Button variant="ghost" size="sm" onClick={() => set('education', r.education.filter((_, k) => k !== i))}><Trash2 className="mr-1 size-4" aria-hidden /> Remove</Button>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Skills & more">
          <div className="space-y-4">
            <TextArea label="Skills (comma-separated)" value={r.skills} onChange={(v) => set('skills', v)} rows={2} />
            <div className="space-y-3">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">Projects</p><Button variant="outline" size="sm" onClick={() => set('projects', [...r.projects, { ...EMPTY_PROJECT }])}><Plus className="mr-1 size-4" aria-hidden /> Add</Button></div>
              {r.projects.map((p, i) => (
                <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <TextInput label="Name" value={p.name} onChange={(v) => list('projects', i, { name: v })} />
                  <TextInput label="Link" value={p.link} onChange={(v) => list('projects', i, { link: v })} />
                  <Button variant="ghost" size="icon" className="self-end" aria-label="Remove project" onClick={() => set('projects', r.projects.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button>
                  <div className="sm:col-span-3"><TextInput label="Description" value={p.detail} onChange={(v) => list('projects', i, { detail: v })} /></div>
                </div>
              ))}
            </div>
            <TextArea label="Certifications (one per line)" value={r.certifications} onChange={(v) => set('certifications', v)} rows={2} />
            <TextInput label="Languages" value={r.languages} onChange={(v) => set('languages', v)} />
          </div>
        </Panel>
        <RunBar task={task} label="Download PDF" extra={<>
          <Button variant="outline" onClick={() => setOut([{ name: `${r.name || 'resume'}.tex`.replace(/\s+/g, '-'), blob: new Blob([resumeLatex(r, accent)], { type: 'application/x-tex' }), note: 'LaTeX source – compile with pdflatex or Overleaf' }])}>Download LaTeX</Button>
          <Button variant="ghost" onClick={() => { if (confirm('Clear all fields?')) setR({ name: '', title: '', email: '', phone: '', location: '', links: '', summary: '', jobs: [{ ...EMPTY_JOB }], education: [{ ...EMPTY_EDU }], skills: '', projects: [], certifications: '', languages: '' }) }}>Start blank</Button>
        </>} onRun={async () => {
          const b = await task.run(() => resumePdf(r, tpl, accent), 'Building')
          if (b) setOut([pdfOut(b, `${(r.name || 'resume').replace(/\s+/g, '-')}-resume.pdf`)])
        }} />
        <Results files={out} onReset={() => setOut([])} />
      </div>
      <Panel title="Live preview" className="lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-3">
          { }
          {preview.length ? preview.map((u, i) => <img key={i} src={u} alt={`Resume page ${i + 1}`} className="w-full rounded border shadow-sm" />) : <div className="aspect-[1/1.414] animate-pulse rounded bg-muted" />}
          <p className="text-xs text-muted-foreground">Your details are saved only in this browser.</p>
        </div>
      </Panel>
    </div>
  )
}
