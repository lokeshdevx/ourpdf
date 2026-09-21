import { registerMeasureFont } from '@/engine/fonts'
import { libFamily, libFileUrl, libKey, parseLibKey, pickFace } from '@/lib/font-library'
import type { FontFamilyKey } from '@/types'
import { useUiStore } from '@/stores/ui-store'
import { uid } from '@/utils/id'
import { woffToSfnt } from '@/utils/woff'

interface CustomFont {
  id: string
  name: string
  bytes: Uint8Array
  /** 'user' = loaded from a file, 'pdf' = extracted from a document, 'lib' = bundled open-licence library. */
  origin: 'user' | 'pdf' | 'lib'
  face?: FontFace
}
const fonts = new Map<string, CustomFont>()

export const listCustomFonts = () => [...fonts.values()].map((f) => ({ key: `custom:${f.id}` as FontFamilyKey, name: f.name, origin: f.origin }))
export const customFontNames = (): Record<string, string> => Object.fromEntries([...fonts.values()].map((f) => [`custom:${f.id}`, f.name]))
export const getCustomFontBytes = (key: string) => fonts.get(key.replace(/^custom:/, ''))?.bytes
export const isPdfFont = (key: string) => fonts.get(key.replace(/^custom:/, ''))?.origin === 'pdf'
export const isRegistered = (key: string) => fonts.has(key.replace(/^custom:/, ''))
export const fontDisplayName = (key: string) => fonts.get(key.replace(/^custom:/, ''))?.name

async function install(id: string, name: string, bytes: Uint8Array, origin: CustomFont['origin']): Promise<FontFamilyKey> {
  const face = new FontFace(`pdfstudio-${id}`, bytes.slice().buffer)
  await face.load()
  document.fonts.add(face)
  fonts.set(id, { id, name, bytes, origin, face })
  // metrics + glyph coverage for layout/export (real advances, real ascent/descent)
  await registerMeasureFont(`custom:${id}`, bytes)
  useUiStore.getState().set({ fontsEpoch: useUiStore.getState().fontsEpoch + 1 })
  return `custom:${id}`
}

/** 'sfnt' = TrueType / OpenType (incl. CFF) / collection, 'woff' = WOFF 1.0 container. */
function sniff(bytes: Uint8Array): 'sfnt' | 'woff' | null {
  const magic = String.fromCharCode(...bytes.slice(0, 4))
  if (magic === '\u0000\u0001\u0000\u0000' || magic === 'OTTO' || magic === 'true' || magic === 'ttcf') return 'sfnt'
  if (magic === 'wOFF') return 'woff'
  return null
}

/** Registers a user-provided TTF / OTF / WOFF. It is used for display (FontFace) and embedded on export. */
export async function addCustomFont(file: File, id?: string): Promise<FontFamilyKey> {
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer())
  const kind = sniff(bytes)
  if (!kind) throw new Error('Unsupported font file. Use a TrueType (.ttf), OpenType (.otf) or WOFF (.woff) font.')
  if (kind === 'woff') bytes = await woffToSfnt(bytes)
  return install(id ?? uid('font'), file.name.replace(/\.[^.]+$/, ''), bytes, 'user')
}

/** FNV-1a hash so the same embedded font is registered once no matter how often it is edited. */
function hashBytes(b: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < b.length; i++) {
    h ^= b[i]
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16) + b.length.toString(16)
}

/** Registers a font program extracted from a PDF (the exact font used by the original text). */
export async function registerPdfFont(bytes: Uint8Array, displayName: string): Promise<FontFamilyKey | null> {
  if (sniff(bytes) !== 'sfnt') return null
  const id = `pdf-${hashBytes(bytes)}`
  if (fonts.has(id)) return `custom:${id}`
  try {
    return await install(id, displayName, bytes, 'pdf')
  } catch {
    return null
  }
}

const libLoads = new Map<string, Promise<FontFamilyKey | null>>()

/** Loads one face of the bundled font library (fetched from /fonts on first use, cached by the service worker). */
export function loadLibraryFace(familyId: string, weight: number, italic: boolean): Promise<FontFamilyKey | null> {
  const key = libKey(familyId, weight, italic)
  const id = key.slice(7)
  if (fonts.has(id)) return Promise.resolve(key)
  let p = libLoads.get(id)
  if (!p) {
    const fam = libFamily(familyId)
    p = (async () => {
      if (!fam) return null
      try {
        const res = await fetch(libFileUrl(familyId, weight, italic))
        if (!res.ok) return null
        const bytes = await woffToSfnt(new Uint8Array(await res.arrayBuffer()))
        return await install(id, `${fam.name} ${weight === 400 ? '' : weight}${italic ? ' Italic' : ''}`.replace(/\s+/g, ' ').trim(), bytes, 'lib')
      } catch {
        return null
      } finally {
        libLoads.delete(id)
      }
    })()
    libLoads.set(id, p)
  }
  return p
}

/** Makes sure a font key can be used (library faces are fetched on demand). Standard fonts are always available. */
export async function ensureFontKey(key: FontFamilyKey): Promise<boolean> {
  if (!key.startsWith('custom:')) return true
  if (isRegistered(key)) return true
  const lib = parseLibKey(key)
  return lib ? (await loadLibraryFace(lib.id, lib.weight, lib.italic)) !== null : false
}

/** The library face of the same family closest to the requested weight / italic (undefined for non-library fonts). */
export function siblingFace(key: FontFamilyKey, want: { bold?: boolean; italic?: boolean }): FontFamilyKey | undefined {
  const p = parseLibKey(key)
  const fam = p && libFamily(p.id)
  if (!p || !fam) return undefined
  const weight = want.bold === undefined ? p.weight : want.bold ? 700 : p.weight >= 600 ? 400 : p.weight
  const f = pickFace(fam, weight, want.italic ?? p.italic)
  return libKey(p.id, f.weight, f.italic)
}

export function restoreCustomFont(id: string, name: string, bytes: Uint8Array) {
  const origin: CustomFont['origin'] = id.startsWith('pdf-') ? 'pdf' : id.startsWith('lib-') ? 'lib' : 'user'
  void install(id, name, bytes, origin).catch(() => {})
}
export const exportCustomFonts = () => [...fonts.values()].map((f) => ({ id: f.id, name: f.name, bytes: f.bytes }))
