import { toast } from 'sonner'
import { docChanged } from '@/lib/events'
import { AppError } from '@/lib/errors'
import { getAsset, listAssets, registerAsset } from '@/services/assets'
import { exportCustomFonts, restoreCustomFont } from '@/services/fonts'
import { defaultLayers, getLayers, getObjects, useAnnotationStore } from '@/stores/annotation-store'
import { useHistoryStore } from '@/stores/history-store'
import { getPages, usePageStore } from '@/stores/page-store'
import { getDoc, usePdfStore } from '@/stores/pdf-store'
import { useProjectStore } from '@/stores/project-store'
import { useUiStore } from '@/stores/ui-store'
import type { DocInfo, EditObject } from '@/types'
import { uid } from '@/utils/id'
import { docSourceIds, getNativeRegistry, replaceDocContent, setNativeRegistry } from '@/services/pdf/document-service'
import { exportPdfBytes } from '@/services/pdf/export-service'
import { getSource, openSource } from '@/services/pdf/sources'
import { getDb, type ProjectRecord, type SessionJSON, type SnapshotRecord } from './db'
import { requestPassword } from '@/services/import'

const MAX_SNAPSHOTS = 12

function buildSession(docId: string): SessionJSON | null {
  const doc = getDoc(docId)
  if (!doc) return null
  const pages = getPages(docId)
  const sourceMeta: SessionJSON['sourceMeta'] = {}
  for (const id of docSourceIds(docId)) {
    const s = getSource(id)
    if (s) sourceMeta[id] = { name: s.name, encrypted: s.encrypted }
  }
  return {
    version: 1,
    doc: { name: doc.name, metadata: doc.metadata, originalMetadata: doc.originalMetadata, bookmarks: doc.bookmarks, pageLabels: doc.pageLabels, attachments: doc.attachments, ocr: doc.ocr, hasForms: doc.hasForms, encrypted: doc.encrypted },
    pages,
    objects: getObjects(docId),
    layers: getLayers(docId),
    nativeRegistry: [...getNativeRegistry(docId)],
    activePage: usePageStore.getState().byDoc[docId]?.current ?? 0,
    sourceMeta,
  }
}

function assetIdsOf(objects: EditObject[], attachments: DocInfo['attachments']): Set<string> {
  const ids = new Set<string>()
  for (const o of objects) if (o.type === 'image') ids.add(o.assetId)
  for (const a of attachments) if (a.blobKey) ids.add(a.blobKey)
  return ids
}

/** Persists the whole document (sources, edits, assets, fonts) to IndexedDB. */
export async function saveProject(docId: string): Promise<void> {
  const session = buildSession(docId)
  const doc = getDoc(docId)
  if (!session || !doc) return
  const db = await getDb()
  const existing = await db.get('projects', docId)
  const record: ProjectRecord = { id: docId, name: doc.name, createdAt: existing?.createdAt ?? doc.createdAt, updatedAt: Date.now(), size: doc.size, pageCount: session.pages.length, session }
  const tx = db.transaction(['projects', 'blobs', 'assets', 'fonts'], 'readwrite')
  const sourceIds = Object.keys(session.sourceMeta)
  const have = new Set((await tx.objectStore('blobs').index('projectId').getAllKeys(docId)) as string[])
  for (const sid of sourceIds) {
    const key = `${docId}:${sid}`
    if (!have.has(key)) {
      const src = getSource(sid)
      if (src) await tx.objectStore('blobs').put({ key, projectId: docId, blob: src.blob })
    }
    have.delete(key)
  }
  for (const stale of have) await tx.objectStore('blobs').delete(stale)
  const wantAssets = assetIdsOf(session.objects, session.doc.attachments)
  const haveAssets = new Set((await tx.objectStore('assets').index('projectId').getAllKeys(docId)) as string[])
  for (const a of listAssets(wantAssets)) {
    const key = `${docId}:${a.info.id}`
    if (!haveAssets.has(key)) await tx.objectStore('assets').put({ key, projectId: docId, info: a.info, blob: a.blob })
    haveAssets.delete(key)
  }
  for (const stale of haveAssets) await tx.objectStore('assets').delete(stale)
  const usedFonts = new Set<string>()
  for (const o of session.objects) {
    if (o.type !== 'text') continue
    for (const k of [o.font, o.fontSwap?.home.font, o.fontSwap?.alt.font]) if (k?.startsWith('custom:')) usedFonts.add(k.slice(7))
  }
  for (const f of exportCustomFonts()) if (usedFonts.has(f.id)) await tx.objectStore('fonts').put({ key: `${docId}:${f.id}`, projectId: docId, id: f.id, name: f.name, bytes: f.bytes })
  await tx.objectStore('projects').put(record)
  await tx.done
  useProjectStore.getState().markSaved(docId, record.updatedAt)
}

export async function listProjects() {
  const db = await getDb()
  const all = await db.getAll('projects')
  const metas = all
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt, size: p.size, pageCount: p.pageCount }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  useProjectStore.getState().setProjects(metas)
  return metas
}

/** Re-opens a saved project as a document tab. */
export async function openProject(id: string): Promise<string | null> {
  const open = usePdfStore.getState().docs.find((d) => d.id === id)
  if (open) {
    usePdfStore.getState().setActive(id)
    return id
  }
  const db = await getDb()
  const rec = await db.get('projects', id)
  if (!rec) throw new AppError('io', 'This project no longer exists.')
  const s = rec.session
  for (const a of await db.getAllFromIndex('assets', 'projectId', id)) registerAsset(a.info, a.blob)
  for (const f of await db.getAllFromIndex('fonts', 'projectId', id)) restoreCustomFont(f.id, f.name, f.bytes)
  const blobs = await db.getAllFromIndex('blobs', 'projectId', id)
  for (const b of blobs) {
    const sid = b.key.slice(id.length + 1)
    const meta = s.sourceMeta[sid]
    let password: string | undefined
    for (;;) {
      try {
        await openSource(b.blob, meta?.name ?? 'document.pdf', { id: sid, password })
        break
      } catch (e) {
        const err = e as AppError
        if (err.code === 'password-required' || err.code === 'password-incorrect') {
          const pw = await requestPassword(meta?.name ?? 'document.pdf', err.code === 'password-incorrect')
          if (pw === null) return null
          password = pw
        } else throw e
      }
    }
  }
  const info: DocInfo = { id, size: rec.size, createdAt: rec.createdAt, modified: false, ...s.doc }
  usePageStore.getState().init(id, s.pages)
  usePageStore.getState().setCurrent(id, s.activePage)
  useAnnotationStore.getState().init(id, s.objects, s.layers.length ? s.layers : defaultLayers())
  useHistoryStore.getState().clear(id)
  setNativeRegistry(id, s.nativeRegistry)
  usePdfStore.getState().addDoc(info, true)
  useProjectStore.getState().markSaved(id, rec.updatedAt)
  return id
}

export async function renameProject(id: string, name: string) {
  const db = await getDb()
  const rec = await db.get('projects', id)
  if (!rec) return
  rec.name = name
  rec.session.doc.name = name
  rec.updatedAt = Date.now()
  await db.put('projects', rec)
  if (getDoc(id)) usePdfStore.getState().updateDoc(id, { name })
  await listProjects()
}

export async function deleteProject(id: string) {
  const db = await getDb()
  const tx = db.transaction(['projects', 'blobs', 'assets', 'fonts', 'snapshots'], 'readwrite')
  await tx.objectStore('projects').delete(id)
  for (const store of ['blobs', 'assets', 'fonts', 'snapshots'] as const) {
    const keys = await tx.objectStore(store).index('projectId').getAllKeys(id)
    for (const k of keys) await tx.objectStore(store).delete(k as string)
  }
  await tx.done
  await listProjects()
}

export async function duplicateProject(id: string): Promise<string> {
  const db = await getDb()
  const rec = await db.get('projects', id)
  if (!rec) throw new AppError('io', 'Project not found.')
  const newId = uid('doc')
  const now = Date.now()
  const session = structuredClone(rec.session)
  session.doc.name = `${rec.name.replace(/\.pdf$/i, '')} copy.pdf`
  // source ids are global; blobs are copied under the new project id and re-keyed on open
  await db.put('projects', { ...rec, id: newId, name: session.doc.name, createdAt: now, updatedAt: now, session })
  for (const b of await db.getAllFromIndex('blobs', 'projectId', id)) {
    const sid = b.key.slice(id.length + 1)
    await db.put('blobs', { key: `${newId}:${sid}`, projectId: newId, blob: b.blob })
  }
  for (const a of await db.getAllFromIndex('assets', 'projectId', id)) await db.put('assets', { ...a, key: `${newId}:${a.info.id}`, projectId: newId })
  for (const f of await db.getAllFromIndex('fonts', 'projectId', id)) await db.put('fonts', { ...f, key: `${newId}:${f.id}`, projectId: newId })
  await listProjects()
  return newId
}

/* ------------------------------------------------------------- history */

export async function saveSnapshot(docId: string, label: string): Promise<void> {
  const bytes = await exportPdfBytes(docId, { annotations: true, forms: true })
  const db = await getDb()
  const rec: SnapshotRecord = { id: uid('snap'), projectId: docId, label, time: Date.now(), size: bytes.byteLength, blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }) }
  await db.put('snapshots', rec)
  const all = (await db.getAllFromIndex('snapshots', 'projectId', docId)).sort((a, b) => b.time - a.time)
  for (const old of all.slice(MAX_SNAPSHOTS)) await db.delete('snapshots', old.id)
}

export async function listSnapshots(docId: string) {
  const db = await getDb()
  return (await db.getAllFromIndex('snapshots', 'projectId', docId)).sort((a, b) => b.time - a.time).map(({ id, label, time, size }) => ({ id, label, time, size }))
}

export async function restoreSnapshot(docId: string, snapId: string): Promise<void> {
  const db = await getDb()
  const snap = await db.get('snapshots', snapId)
  if (!snap) throw new AppError('io', 'Snapshot not found.')
  await saveSnapshot(docId, 'Before restore')
  await replaceDocContent(docId, snap.blob)
}

export async function deleteSnapshot(id: string) {
  const db = await getDb()
  await db.delete('snapshots', id)
}

/* -------------------------------------------------------- export / import */

export async function exportProjectFile(docId: string): Promise<Blob> {
  await saveProject(docId)
  const db = await getDb()
  const rec = await db.get('projects', docId)
  if (!rec) throw new AppError('io', 'Project not saved.')
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('project.json', JSON.stringify({ format: 'pdfstudio-project', version: 1, record: rec }))
  for (const b of await db.getAllFromIndex('blobs', 'projectId', docId)) zip.file(`sources/${b.key.slice(docId.length + 1)}.pdf`, b.blob)
  for (const a of await db.getAllFromIndex('assets', 'projectId', docId)) {
    zip.file(`assets/${a.info.id}.bin`, a.blob)
    zip.file(`assets/${a.info.id}.json`, JSON.stringify(a.info))
  }
  for (const f of await db.getAllFromIndex('fonts', 'projectId', docId)) {
    zip.file(`fonts/${f.id}.bin`, f.bytes)
    zip.file(`fonts/${f.id}.json`, JSON.stringify({ id: f.id, name: f.name }))
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function importProjectFile(file: Blob): Promise<string> {
  const { default: JSZip } = await import('jszip')
  let zip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new AppError('unreadable', 'This is not a valid OurPDF project file.')
  }
  const manifest = zip.file('project.json')
  if (!manifest) throw new AppError('unreadable', 'This is not a valid OurPDF project file.')
  const parsed = JSON.parse(await manifest.async('string')) as { format?: string; record?: ProjectRecord }
  if (parsed.format !== 'pdfstudio-project' || !parsed.record) throw new AppError('unreadable', 'Unsupported project file version.')
  const rec = parsed.record
  const newId = uid('doc')
  const db = await getDb()
  const record: ProjectRecord = { ...rec, id: newId, updatedAt: Date.now() }
  await db.put('projects', record)
  for (const path of Object.keys(zip.files)) {
    const f = zip.files[path]
    if (f.dir) continue
    if (path.startsWith('sources/')) {
      const sid = path.slice(8).replace(/\.pdf$/, '')
      await db.put('blobs', { key: `${newId}:${sid}`, projectId: newId, blob: new Blob([await f.async('uint8array') as BlobPart], { type: 'application/pdf' }) })
    } else if (path.startsWith('assets/') && path.endsWith('.json')) {
      const info = JSON.parse(await f.async('string'))
      const bin = zip.file(`assets/${info.id}.bin`)
      if (bin) await db.put('assets', { key: `${newId}:${info.id}`, projectId: newId, info, blob: new Blob([await bin.async('uint8array') as BlobPart], { type: info.mime }) })
    } else if (path.startsWith('fonts/') && path.endsWith('.json')) {
      const meta = JSON.parse(await f.async('string'))
      const bin = zip.file(`fonts/${meta.id}.bin`)
      if (bin) await db.put('fonts', { key: `${newId}:${meta.id}`, projectId: newId, id: meta.id, name: meta.name, bytes: await bin.async('uint8array') })
    }
  }
  await listProjects()
  return newId
}

/* ------------------------------------------------------------- autosave */

let timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Debounced autosave wired to document changes. Returns a disposer. */
export function startAutosave(): () => void {
  const off = docChanged.on((docId) => {
    useUiStore.getState().set({ saveState: 'unsaved' })
    const t = timers.get(docId)
    if (t) clearTimeout(t)
    timers.set(
      docId,
      setTimeout(async () => {
        timers.delete(docId)
        if (!getDoc(docId)) return
        useUiStore.getState().set({ saveState: 'saving' })
        try {
          await saveProject(docId)
          if (timers.size === 0) useUiStore.getState().set({ saveState: 'saved', lastSavedAt: Date.now() })
        } catch (e) {
          useUiStore.getState().set({ saveState: 'error' })
          if ((e as Error).name === 'QuotaExceededError') toast.error('Local storage is full', { description: 'Autosave stopped. Delete old projects or download your work.' })
        }
      }, 1500),
    )
  })
  return () => {
    off()
    for (const t of timers.values()) clearTimeout(t)
    timers = new Map()
  }
}

export async function flushAutosave() {
  for (const [id, t] of timers) {
    clearTimeout(t)
    timers.delete(id)
    if (getDoc(id)) await saveProject(id).catch(() => {})
  }
}

export { getAsset }
