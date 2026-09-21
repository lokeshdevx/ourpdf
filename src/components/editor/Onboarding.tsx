'use client'

import { useEffect, useState } from 'react'
import { FilePlus2, FolderOpen, Combine, ImagePlus, Lock, Clock } from 'lucide-react'
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
  const recent = projects.slice(0, 4)
  return (
    <div className="relative flex h-full flex-col overflow-y-auto overscroll-contain bg-gradient-to-b from-primary/5 via-background to-violet-500/5 text-center" data-testid="onboarding">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      {/* m-auto centres short content but lets tall content start at the top and scroll (justify-center would clip the top on phones) */}
      <div className="relative m-auto flex w-full flex-col items-center gap-6 p-4 sm:p-6">
      <div className="relative w-full max-w-2xl rounded-3xl border-2 border-dashed border-primary/30 bg-card/80 p-6 shadow-xl shadow-primary/5 backdrop-blur sm:p-10">
        <BrandMark size={72} className="mx-auto mb-4 drop-shadow-lg" />
        <h1 className="text-3xl font-bold tracking-tight">Drop a PDF here</h1>
        {hint && <p className="mt-2 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary" data-testid="launch-hint">{hint}</p>}
        <p className="mt-1 text-sm text-muted-foreground">or choose how to start. Everything stays in your browser.</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Button size="lg" className="h-auto flex-col gap-1.5 py-4" onClick={() => void openFileDialog()} data-testid="onboarding-open"><FolderOpen className="size-6" /> Open PDF</Button>
          <Button size="lg" variant="outline" className="h-auto flex-col gap-1.5 py-4" onClick={() => open('merge')} data-testid="onboarding-merge"><Combine className="size-6" /> Merge PDFs</Button>
          <Button size="lg" variant="outline" className="h-auto flex-col gap-1.5 py-4" onClick={() => open('newPdf')} data-testid="onboarding-create"><FilePlus2 className="size-6" /> Create PDF</Button>
          <Button size="lg" variant="outline" className="h-auto flex-col gap-1.5 py-4" onClick={() => open('imagesToPdf')} data-testid="onboarding-images"><ImagePlus className="size-6" /> Import Images</Button>
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" /> All processing happens locally in your browser. Files are never uploaded.</p>
      </div>
      {ready && storageOk && recent.length > 0 && (
        <div className="relative w-full max-w-2xl text-left" data-testid="recent-projects">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Clock className="size-4" /> Continue where you left off</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.pageCount} pages · {formatBytes(p.size)} · autosaved {new Date(p.updatedAt).toLocaleString()}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void runTask(`Restoring ${p.name}`, () => openProject(p.id), { quiet: true })} data-testid="restore-project">Restore</Button>
              </li>
            ))}
          </ul>
          <Tooltip>
            <TooltipTrigger asChild><Button variant="link" size="sm" className="mt-1 px-0" onClick={() => open('projects')}>All local projects…</Button></TooltipTrigger>
            <TooltipContent>Rename, duplicate, delete, export and restore versions</TooltipContent>
          </Tooltip>
        </div>
      )}
      </div>
    </div>
  )
}
