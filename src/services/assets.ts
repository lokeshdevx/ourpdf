import type { AssetInfo } from '@/types'
import { uid } from '@/utils/id'

interface AssetRecord {
  info: AssetInfo
  blob: Blob
  url?: string
}
const assets = new Map<string, AssetRecord>()

export async function measureImage(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(blob)
    const out = { width: bmp.width, height: bmp.height }
    bmp.close()
    return out
  } catch {
    // Fallback via <img>
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Unsupported or corrupted image'))
      }
      img.src = url
    })
  }
}

/** Registers an image blob and returns its asset id. */
export async function addAsset(blob: Blob, name = 'image', id?: string): Promise<AssetInfo> {
  const { width, height } = await measureImage(blob)
  const info: AssetInfo = { id: id ?? uid('asset'), mime: blob.type || 'image/png', width, height, size: blob.size, name }
  assets.set(info.id, { info, blob })
  return info
}
export function registerAsset(info: AssetInfo, blob: Blob): void {
  assets.set(info.id, { info, blob })
}
export const getAsset = (id: string) => assets.get(id)
export const getAssetInfo = (id: string) => assets.get(id)?.info
export const listAssets = (ids?: Set<string>) => [...assets.values()].filter((a) => !ids || ids.has(a.info.id))

/** Object URL for display. Cached per asset and revoked with {@link releaseAsset}. */
export function getAssetUrl(id: string): string | undefined {
  const rec = assets.get(id)
  if (!rec) return undefined
  rec.url ??= URL.createObjectURL(rec.blob)
  return rec.url
}
export function releaseAsset(id: string): void {
  const rec = assets.get(id)
  if (rec?.url) URL.revokeObjectURL(rec.url)
  assets.delete(id)
}
export async function getAssetBytes(id: string): Promise<Uint8Array | null> {
  const rec = assets.get(id)
  return rec ? new Uint8Array(await rec.blob.arrayBuffer()) : null
}
/** Replace the pixels of an asset (used by image replace / crop-bake). */
export async function replaceAssetBlob(id: string, blob: Blob): Promise<AssetInfo | null> {
  const rec = assets.get(id)
  if (!rec) return null
  if (rec.url) URL.revokeObjectURL(rec.url)
  const { width, height } = await measureImage(blob)
  rec.blob = blob
  rec.url = undefined
  rec.info = { ...rec.info, width, height, size: blob.size, mime: blob.type || rec.info.mime }
  return rec.info
}
