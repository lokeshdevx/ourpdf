'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Download, FolderOpen, History, Pencil, Save, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    <DialogShell id="projects" title="Local projects" description="Projects are saved automatically in this browser (IndexedDB). Nothing is uploaded. Clearing site data removes them – export a project file to back it up." size="lg" footer={<Button variant="outline" onClick={close}>Close</Button>}>
      {!storageOk && <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive" role="alert">Local storage is unavailable (private mode or blocked). Autosave and projects are disabled – download your work regularly.</p>}
      <Tabs defaultValue="projects">
        <TabsList><TabsTrigger value="projects">Projects</TabsTrigger><TabsTrigger value="history" disabled={!activeId}>Version history</TabsTrigger></TabsList>
        <TabsContent value="projects" className="space-y-3 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!activeId} onClick={() => activeId && void guard('Saving project', () => saveProject(activeId))}><Save className="size-3.5" /> Save now</Button>
            <Button size="sm" variant="outline" disabled={!activeId} onClick={() => activeId && void guard('Exporting project', async () => saveBlob(await exportProjectFile(activeId), `${usePdfStore.getState().docs.find((d) => d.id === activeId)?.name.replace(/\.pdf$/i, '')}.ourpdf`))}><Download className="size-3.5" /> Export project file</Button>
            <Button size="sm" variant="outline" onClick={async () => { const f = (await pickFiles({ accept: '.ourpdf,.pdfstudio,.zip', multiple: false }))[0]; if (f) void guard('Importing project', async () => { const id = await importProjectFile(f); await openProject(id); close() }) }}><Upload className="size-3.5" /> Import project file</Button>
          </div>
          <ul className="divide-y rounded-md border" data-testid="project-list">
            {!projects.length && <li className="p-4 text-center text-sm text-muted-foreground">No saved projects yet. Your first edit creates one.</li>}
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  {renaming === p.id ? <Input autoFocus defaultValue={p.name} className="h-7" onBlur={(e) => { setRenaming(null); if (e.target.value.trim()) void guard('Renaming', () => renameProject(p.id, e.target.value.trim())) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }} aria-label="Project name" /> : <div className="truncate font-medium">{p.name}{p.id === activeId ? ' (open)' : ''}</div>}
                  <div className="text-xs text-muted-foreground">{p.pageCount} pages · {formatBytes(p.size)} · {new Date(p.updatedAt).toLocaleString()}</div>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={`Open ${p.name}`} onClick={() => void guard('Opening', async () => { await openProject(p.id); close() })}><FolderOpen className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Rename ${p.name}`} onClick={() => setRenaming(p.id)}><Pencil className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Duplicate ${p.name}`} onClick={() => void guard('Duplicating', () => duplicateProject(p.id))}><Copy className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={async () => { if (await confirmAction({ title: `Delete “${p.name}”?`, description: 'The locally saved copy and its history are permanently removed. Open tabs are not affected.', confirmLabel: 'Delete', destructive: true })) void guard('Deleting', () => deleteProject(p.id)) }}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="history" className="space-y-3 pt-3">
          <Button size="sm" variant="outline" onClick={() => activeId && void guard('Saving version', () => saveSnapshot(activeId, 'Manual version'))}><History className="size-3.5" /> Save a version now</Button>
          <ul className="divide-y rounded-md border">
            {!snaps.length && <li className="p-4 text-center text-sm text-muted-foreground">No versions yet. Versions are saved automatically before destructive operations (redaction, flatten, compress) or on demand.</li>}
            {snaps.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1"><div className="truncate">{s.label}</div><div className="text-xs text-muted-foreground">{new Date(s.time).toLocaleString()} · {formatBytes(s.size)}</div></div>
                <Button size="sm" variant="outline" onClick={async () => { if (activeId && (await confirmAction({ title: 'Restore this version?', description: 'The current state is saved as a version first. Undo history is cleared.', confirmLabel: 'Restore' }))) void guard('Restoring version', () => restoreSnapshot(activeId, s.id)) }}>Restore</Button>
                <Button size="icon-sm" variant="ghost" aria-label="Delete version" onClick={() => void guard('Deleting version', () => deleteSnapshot(s.id))}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </DialogShell>
  )
}
