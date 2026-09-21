import { toast } from 'sonner'
import { addAsset, getAsset, registerAsset } from '@/services/assets'
import { execute } from '@/services/history'
import { saveBlob } from '@/services/download'
import { getDoc, usePdfStore } from '@/stores/pdf-store'
import { uid } from '@/utils/id'
import { allSources } from './sources'

export async function addAttachment(docId: string, file: File) {
  const doc = getDoc(docId)
  if (!doc) return
  const key = uid('att')
  registerAsset({ id: key, mime: file.type || 'application/octet-stream', width: 0, height: 0, size: file.size, name: file.name }, file)
  const before = doc.attachments
  const next = [...before, { id: key, name: file.name, size: file.size, staged: true, blobKey: key }]
  execute(docId, 'Attach file', () => usePdfStore.getState().updateDoc(docId, { attachments: next }), () => usePdfStore.getState().updateDoc(docId, { attachments: before }), { scope: 'document' })
}

export function removeAttachment(docId: string, id: string) {
  const doc = getDoc(docId)
  if (!doc) return
  const before = doc.attachments
  const target = before.find((a) => a.id === id)
  if (!target?.staged) return void toast.info('Attachments that are already in the PDF can be downloaded but not removed by this editor.')
  execute(docId, 'Remove attachment', () => usePdfStore.getState().updateDoc(docId, { attachments: before.filter((a) => a.id !== id) }), () => usePdfStore.getState().updateDoc(docId, { attachments: before }), { scope: 'document' })
}

/** Downloads an attachment – either one we staged, or one embedded in any loaded source. */
export async function downloadAttachment(name: string, blobKey?: string) {
  if (blobKey) {
    const rec = getAsset(blobKey)
    if (rec) return void (await saveBlob(rec.blob, name))
  }
  for (const s of allSources()) {
    const att = (await s.proxy.getAttachments()) as Record<string, { filename: string; content: Uint8Array }> | null
    const hit = att && Object.values(att).find((a) => a.filename === name)
    if (hit) return void (await saveBlob(new Blob([hit.content as BlobPart]), name))
  }
  toast.error('Attachment data is not available.')
}

export { addAsset }
