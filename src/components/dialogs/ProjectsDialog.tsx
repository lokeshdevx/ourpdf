'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Download, FileText, FolderOpen, History, Pencil, Save, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { saveBlob } from '@/services/download'
import { pickFiles } from '@/services/import'
import { deleteProject, deleteSnapshot, duplicateProject, exportProjectFile, importProjectFile, listProjects, listSnapshots, openProject, renameProject, restoreSnapshot, saveProject, saveSnapshot } from '@/services/storage/projects'
import { runTask } from '@/services/tasks'
import { confirmAction } from '@/stores/confirm-store'
import { useProjectStore } from '@/stores/project-store'
import { usePdfStore } from '@/stores/pdf-store'
import { useUiStore } from '@/stores/ui-store'
import { formatBytes } from '@/utils/format'
import { DialogShell } from './DialogShell'

export default function ProjectsDialog() {
  const projects = useProjectStore((s) => s.projects)
  const storageOk = useProjectStore((s) => s.storageOk)
  const activeId = usePdfStore((s) => s.activeId)
  const close = useUiStore((s) => s.closeDialog)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [snaps, setSnaps] = useState<{ id: string; label: string; time: number; size: number }[]>([])
  const reload = useCallback(() => { void listProjects().catch(() => useProjectStore.getState().setStorageOk(false)); if (activeId) void listSnapshots(activeId).then(setSnaps).catch(() => {}) }, [activeId])
  useEffect(reload, [reload])
  const guard = (label: string, fn: () => Promise<unknown>) => runTask(label, async () => { await fn(); reload() }, { quiet: true })

  return (
    <DialogShell id="projects" title="Local projects" description="Projects are saved automatically in this browser (IndexedDB). Nothing is uploaded. Clearing site data removes them – export a project file to back it up." size="xl" footer={<Button variant="outline" className="h-9 px-5" onClick={close}>Close</Button>}>
      {!storageOk && <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive" role="alert">Local storage is unavailable (private mode or blocked). Autosave and projects are disabled – download your work regularly.</p>}
      <Tabs defaultValue="projects">
        <TabsList><TabsTrigger value="projects">Projects</TabsTrigger><TabsTrigger value="history" disabled={!activeId}>Version history</TabsTrigger></TabsList>
        <TabsContent value="projects" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-9 gap-2 px-3.5" disabled={!activeId} onClick={() => activeId && void guard('Saving project', () => saveProject(activeId))}><Save className="size-4" /> Save now</Button>
            <Button variant="outline" className="h-9 gap-2 px-3.5" disabled={!activeId} onClick={() => activeId && void guard('Exporting project', async () => saveBlob(await exportProjectFile(activeId), `${usePdfStore.getState().docs.find((d) => d.id === activeId)?.name.replace(/\.pdf$/i, '')}.ourpdf`))}><Download className="size-4" /> Export project file</Button>
            <Button variant="outline" className="h-9 gap-2 px-3.5" onClick={async () => { const f = (await pickFiles({ accept: '.ourpdf,.pdfstudio,.zip', multiple: false }))[0]; if (f) void guard('Importing project', async () => { const id = await importProjectFile(f); await openProject(id); close() }) }}><Upload className="size-4" /> Import project file</Button>
          </div>
          <ul className="space-y-2" data-testid="project-list">
            {!projects.length && <li className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No saved projects yet. Your first edit creates one.</li>}
            {projects.map((p) => (
              <li key={p.id} className={cn('group flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm transition hover:border-primary/40 hover:shadow-sm', p.id === activeId && 'border-primary/50 bg-primary/[0.03]')}>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400"><FileText className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  {renaming === p.id ? <Input autoFocus defaultValue={p.name} className="h-9" onBlur={(e) => { setRenaming(null); if (e.target.value.trim()) void guard('Renaming', () => renameProject(p.id, e.target.value.trim())) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }} aria-label="Project name" /> : <div className="flex items-center gap-2"><span className="truncate font-semibold">{p.name}</span>{p.id === activeId && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Open</span>}</div>}
                  <div className="text-xs text-muted-foreground">{p.pageCount} page{p.pageCount === 1 ? '' : 's'} · {formatBytes(p.size)} · {new Date(p.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
                </div>
                <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="size-9" aria-label={`Open ${p.name}`} onClick={() => void guard('Opening', async () => { await openProject(p.id); close() })}><FolderOpen className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-9" aria-label={`Rename ${p.name}`} onClick={() => setRenaming(p.id)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-9" aria-label={`Duplicate ${p.name}`} onClick={() => void guard('Duplicating', () => duplicateProject(p.id))}><Copy className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-9 text-muted-foreground hover:text-destructive" aria-label={`Delete ${p.name}`} onClick={async () => { if (await confirmAction({ title: `Delete “${p.name}”?`, description: 'The locally saved copy and its history are permanently removed. Open tabs are not affected.', confirmLabel: 'Delete', destructive: true })) void guard('Deleting', () => deleteProject(p.id)) }}><Trash2 className="size-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="history" className="space-y-4 pt-4">
          <Button variant="outline" className="h-9 gap-2 px-3.5" onClick={() => activeId && void guard('Saving version', () => saveSnapshot(activeId, 'Manual version'))}><History className="size-4" /> Save a version now</Button>
          <ul className="space-y-2">
            {!snaps.length && <li className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No versions yet. Versions are saved automatically before destructive operations (redaction, flatten, compress) or on demand.</li>}
            {snaps.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><History className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1 space-y-0.5"><div className="truncate font-semibold">{s.label}</div><div className="text-xs text-muted-foreground">{new Date(s.time).toLocaleString()} · {formatBytes(s.size)}</div></div>
                <Button variant="outline" className="h-9 px-4" onClick={async () => { if (activeId && (await confirmAction({ title: 'Restore this version?', description: 'The current state is saved as a version first. Undo history is cleared.', confirmLabel: 'Restore' }))) void guard('Restoring version', () => restoreSnapshot(activeId, s.id)) }}>Restore</Button>
                <Button size="icon" variant="ghost" className="size-9" aria-label="Delete version" onClick={() => void guard('Deleting version', () => deleteSnapshot(s.id))}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </DialogShell>
  )
}
