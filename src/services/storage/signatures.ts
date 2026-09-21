import { addAsset } from '@/services/assets'
import { getDb, type SignatureRecord } from './db'
import { uid } from '@/utils/id'

export async function listSignatures(): Promise<SignatureRecord[]> {
  try {
    const db = await getDb()
    return (await db.getAll('signatures')).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

export async function saveSignature(blob: Blob, meta: { name: string; kind: SignatureRecord['kind']; role: SignatureRecord['role']; width: number; height: number }): Promise<SignatureRecord> {
  const db = await getDb()
  const rec: SignatureRecord = { id: uid('sig'), createdAt: Date.now(), blob, ...meta }
  await db.put('signatures', rec)
  return rec
}

export async function deleteSignature(id: string) {
  const db = await getDb()
  await db.delete('signatures', id)
}

/** Registers a saved signature as an image asset so it can be placed on a page. */
export async function signatureAsAsset(rec: SignatureRecord) {
  return addAsset(rec.blob, rec.name)
}
