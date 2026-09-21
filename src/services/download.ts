import { sanitizeFilename } from '@/utils/file'

interface SavePickerWindow {
  showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>
}

/**
 * Saves a blob locally. With `picker` and the File System Access API available the user chooses the location
 * ("Save As"); otherwise a normal browser download is triggered. Nothing is ever uploaded.
 */
export async function saveBlob(blob: Blob, filename: string, opts: { picker?: boolean } = {}): Promise<'picker' | 'download' | 'cancelled'> {
  const name = sanitizeFilename(filename, 'download')
  const w = window as unknown as SavePickerWindow
  if (opts.picker && typeof w.showSaveFilePicker === 'function') {
    try {
      const ext = name.includes('.') ? `.${name.split('.').pop()}` : ''
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: ext ? [{ description: ext.slice(1).toUpperCase(), accept: { [blob.type || 'application/octet-stream']: [ext] } }] : undefined,
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'picker'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // fall through to a plain download
    }
  }
  const { saveAs } = await import('file-saver')
  saveAs(blob, name)
  return 'download'
}

export function bytesToBlob(bytes: Uint8Array, type = 'application/pdf'): Blob {
  return new Blob([bytes as BlobPart], { type })
}

/** Creates a short-lived object URL and revokes it after `ttl` ms (or when `revoke()` is called). */
export function tempObjectUrl(blob: Blob, ttl = 60_000): { url: string; revoke: () => void } {
  const url = URL.createObjectURL(blob)
  const t = setTimeout(() => URL.revokeObjectURL(url), ttl)
  return {
    url,
    revoke: () => {
      clearTimeout(t)
      URL.revokeObjectURL(url)
    },
  }
}
