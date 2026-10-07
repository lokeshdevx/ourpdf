'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Clock, Combine, FilePlus2, FileText, FolderOpen, ImagePlus, Lock, Upload } from 'lucide-react'
import { BrandMark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { openFileDialog } from '@/services/import'
import { listProjects, openProject } from '@/services/storage/projects'
import { useProjectStore } from '@/stores/project-store'
import { useUiStore } from '@/stores/ui-store'
import { runTask } from '@/services/tasks'
import { formatBytes } from '@/utils/format'

export function Onboarding({ hint }: { hint?: string }) {
  const projects = useProjectStore((s) => s.projects)
  const storageOk = useProjectStore((s) => s.storageOk)
  const open = useUiStore((s) => s.openDialog)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    listProjects().catch(() => useProjectStore.getState().setStorageOk(false)).finally(() => setReady(true))
  }, [])
  const recent = projects.slice(0, 6)
  const [now] = useState(() => Date.now())
  const actions = [
    { id: 'merge', icon: Combine, title: 'Merge PDFs', text: 'Combine files into one', run: () => open('merge'), testid: 'onboarding-merge' },
    { id: 'create', icon: FilePlus2, title: 'Create PDF', text: 'Start from a blank page', run: () => open('newPdf'), testid: 'onboarding-create' },
    { id: 'images', icon: ImagePlus, title: 'Images to PDF', text: 'Turn photos into a PDF', run: () => open('imagesToPdf'), testid: 'onboarding-images' },
  ]
  return (
    <div className="relative flex h-full flex-col overflow-y-auto overscroll-contain bg-gradient-to-b from-primary/[0.06] via-background to-violet-500/[0.06]" data-testid="onboarding">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="pointer-events-none absolute -top-32 left-1/4 size-[36rem] rounded-full bg-primary/10 blur-3xl" aria-hidden />
      {/* m-auto centres short content but lets tall content start at the top and scroll (justify-center would clip the top on phones) */}
      <div className="relative m-auto grid w-full max-w-[1600px] gap-6 p-4 sm:p-8 lg:grid-cols-2 lg:gap-8 xl:px-12">
        {/* ---------------------------------------------------------- open */}
        <section className="flex flex-col overflow-hidden rounded-3xl border bg-card/90 shadow-xl shadow-primary/10 backdrop-blur lg:min-h-[min(680px,78vh)]" aria-labelledby="open-h">
          <div className="h-1.5 bg-gradient-to-r from-primary via-violet-500 to-primary" aria-hidden />
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center sm:px-12">
            <span className="grid size-28 place-items-center rounded-3xl bg-gradient-to-br from-primary/15 to-violet-500/15 ring-1 ring-primary/15"><BrandMark size={72} className="drop-shadow-md" /></span>
            <h1 id="open-h" className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">Open a PDF to start editing</h1>
            {hint && <p className="mt-3 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary" data-testid="launch-hint">{hint}</p>}
            <p className="mt-3 max-w-md text-base text-muted-foreground sm:text-lg">Edit text, annotate, sign, fill forms and reorganise pages – right in your browser.</p>
            <Button size="lg" className="mt-8 h-14 gap-2.5 rounded-2xl px-10 text-lg font-semibold shadow-lg shadow-primary/25 transition hover:-translate-y-0.5" onClick={() => void openFileDialog()} data-testid="onboarding-open"><FolderOpen className="size-6" /> Open PDF</Button>
            <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground"><Upload className="size-4" aria-hidden /> or drag &amp; drop a file anywhere on this page</p>
          </div>
          <div className="grid gap-px border-t bg-border sm:grid-cols-3">
            {actions.map((a) => (
              <button key={a.id} type="button" onClick={a.run} data-testid={a.testid} className="group flex items-center gap-3 bg-card px-5 py-5 text-left transition-colors hover:bg-primary/[0.04] sm:flex-col sm:items-start sm:gap-2">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><a.icon className="size-6" aria-hidden /></span>
                <span className="min-w-0"><span className="block text-[15px] font-semibold">{a.title}</span><span className="block text-sm text-muted-foreground">{a.text}</span></span>
              </button>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- recent */}
        <section className="flex flex-col rounded-3xl border bg-card/90 p-5 shadow-xl shadow-primary/5 backdrop-blur sm:p-8 lg:min-h-[min(680px,78vh)]" data-testid="recent-projects" aria-labelledby="recent-h">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 id="recent-h" className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl"><Clock className="size-6 text-primary" aria-hidden /> Recent PDFs</h2>
            {storageOk && projects.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild><button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => open('projects')}>View all</button></TooltipTrigger>
                <TooltipContent>Rename, duplicate, delete, export and restore versions</TooltipContent>
              </Tooltip>
            )}
          </div>
          {ready && storageOk && recent.length > 0 ? (
            <ul className="space-y-3">
              {recent.map((p) => (
                <li key={p.id} className="group flex items-center gap-3 rounded-2xl border bg-background px-5 py-4 transition hover:border-primary/40 hover:shadow-md">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400"><FileText className="size-6" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold">{p.name}</div>
                    <div className="text-sm text-muted-foreground">{p.pageCount} page{p.pageCount === 1 ? '' : 's'} · {formatBytes(p.size)} · <time dateTime={new Date(p.updatedAt).toISOString()} title={new Date(p.updatedAt).toLocaleString()}>{ago(p.updatedAt, now)}</time></div>
                  </div>
                  <Button variant="outline" className="h-10 rounded-xl px-5 font-semibold group-hover:border-primary group-hover:text-primary" onClick={() => void runTask(`Restoring ${p.name}`, () => openProject(p.id), { quiet: true })} data-testid="restore-project">Restore</Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center">
              <span className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground"><FileText className="size-8" aria-hidden /></span>
              <p className="mt-4 text-lg font-semibold">{!ready ? 'Loading…' : storageOk ? 'No recent PDFs yet' : 'Recent PDFs are unavailable'}</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">{storageOk ? 'PDFs you open are autosaved here, in this browser only, so you can pick up where you left off.' : 'Your browser is blocking local storage (private mode?), so work can’t be autosaved.'}</p>
            </div>
          )}
          <div className="mt-auto space-y-3 border-t pt-5 text-[15px]">
            <p className="flex items-center gap-2 text-muted-foreground"><Lock className="size-4 shrink-0 text-primary" aria-hidden /> Files are processed on your device and never uploaded.</p>
            <Link href="/" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">Browse all PDF tools <ArrowRight className="size-4" aria-hidden /></Link>
          </div>
        </section>
      </div>
    </div>
  )
}

/** "just now", "5 minutes ago", "3 days ago", then a date. */
function ago(t: number, now: number): string {
  const s = Math.max(0, (now - t) / 1000)
  if (s < 60) return 'just now'
  const fmt = (n: number, u: string) => `${n} ${u}${n === 1 ? '' : 's'} ago`
  if (s < 3600) return fmt(Math.floor(s / 60), 'minute')
  if (s < 86400) return fmt(Math.floor(s / 3600), 'hour')
  if (s < 86400 * 7) return fmt(Math.floor(s / 86400), 'day')
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
