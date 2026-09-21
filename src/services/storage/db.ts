import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AssetInfo, DocInfo, EditObject, Layer, PageModel } from '@/types'

export interface SessionJSON {
  version: 1
  doc: Pick<DocInfo, 'name' | 'metadata' | 'originalMetadata' | 'bookmarks' | 'pageLabels' | 'attachments' | 'ocr' | 'hasForms' | 'encrypted'>
  pages: PageModel[]
  objects: EditObject[]
  layers: Layer[]
  nativeRegistry: [string, { sourceId: string; name: string }][]
  activePage: number
  sourceMeta: Record<string, { name: string; encrypted: boolean }>
}

export interface ProjectRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  size: number
  pageCount: number
  session: SessionJSON
}
export interface BlobRecord {
  key: string
  projectId: string
  blob: Blob
}
export interface AssetRecord {
  key: string
  projectId: string
  info: AssetInfo
  blob: Blob
}
export interface FontRecord {
  key: string
  projectId: string
  id: string
  name: string
  bytes: Uint8Array
}
export interface SnapshotRecord {
  id: string
  projectId: string
  label: string
  time: number
  size: number
  blob: Blob
}
export interface SignatureRecord {
  id: string
  name: string
  kind: 'drawn' | 'typed' | 'uploaded'
  role: 'signature' | 'initials'
  blob: Blob
  width: number
  height: number
  createdAt: number
}

interface Schema extends DBSchema {
  projects: { key: string; value: ProjectRecord; indexes: { updatedAt: number } }
  blobs: { key: string; value: BlobRecord; indexes: { projectId: string } }
  assets: { key: string; value: AssetRecord; indexes: { projectId: string } }
  fonts: { key: string; value: FontRecord; indexes: { projectId: string } }
  snapshots: { key: string; value: SnapshotRecord; indexes: { projectId: string } }
  signatures: { key: string; value: SignatureRecord }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

/** Local-only database. Everything the app persists lives here; nothing is ever transmitted. */
export function getDb(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>('pdfstudio', 1, {
    upgrade(db) {
      const p = db.createObjectStore('projects', { keyPath: 'id' })
      p.createIndex('updatedAt', 'updatedAt')
      db.createObjectStore('blobs', { keyPath: 'key' }).createIndex('projectId', 'projectId')
      db.createObjectStore('assets', { keyPath: 'key' }).createIndex('projectId', 'projectId')
      db.createObjectStore('fonts', { keyPath: 'key' }).createIndex('projectId', 'projectId')
      db.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('projectId', 'projectId')
      db.createObjectStore('signatures', { keyPath: 'id' })
    },
  })
  return dbPromise
}

export async function isStorageAvailable(): Promise<boolean> {
  try {
    await getDb()
    return true
  } catch {
    return false
  }
}
