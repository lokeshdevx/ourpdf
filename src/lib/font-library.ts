import manifest from './font-library.json'
import type { FontFamilyKey } from '@/types'

/**
 * Open-licence (OFL) fonts bundled with the app (Latin subset, served from /fonts, fetched on demand).
 * They are used when the PDF's own font program is missing or is a subset without the glyphs you type, so the
 * edited text can keep the same typeface (or the closest metric-compatible one) instead of falling back to Helvetica.
 */
export interface LibFamily {
  id: string
  name: string
  cat: string
  /** Available faces as "<weight><n|i>", e.g. "400n", "700i". */
  faces: string[]
}
export const FONT_LIBRARY = manifest as LibFamily[]
const byId = new Map(FONT_LIBRARY.map((f) => [f.id, f]))
export const libFamily = (id: string) => byId.get(id)

export const libKey = (id: string, weight: number, italic: boolean) => `custom:lib-${id}-${weight}-${italic ? 'italic' : 'normal'}` as FontFamilyKey
export function parseLibKey(key: string): { id: string; weight: number; italic: boolean } | null {
  const m = /^custom:lib-(.+)-(\d{3})-(normal|italic)$/.exec(key)
  return m ? { id: m[1], weight: Number(m[2]), italic: m[3] === 'italic' } : null
}
export const libFileUrl = (id: string, weight: number, italic: boolean) => `/fonts/${id}-${weight}-${italic ? 'italic' : 'normal'}.woff`

/** Nearest available face of a family for the wanted weight/italic (italic is only used when the family has one). */
export function pickFace(fam: LibFamily, weight: number, italic: boolean): { weight: number; italic: boolean } {
  const has = (w: number, i: boolean) => fam.faces.includes(`${w}${i ? 'i' : 'n'}`)
  const useItalic = italic && fam.faces.some((f) => f.endsWith('i'))
  const weights = [...new Set(fam.faces.filter((f) => f.endsWith(useItalic ? 'i' : 'n')).map((f) => Number(f.slice(0, 3))))]
  const pool = weights.length ? weights : [400]
  const w = pool.reduce((best, c) => (Math.abs(c - weight) < Math.abs(best - weight) || (Math.abs(c - weight) === Math.abs(best - weight) && c > best) ? c : best), pool[0])
  return { weight: w, italic: useItalic && has(w, true) }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Well-known names (mostly proprietary faces) mapped to the closest / metric-compatible bundled family. */
const ALIASES: Record<string, string> = {
  liberationsans: 'arimo', nimbussans: 'arimo', freesans: 'arimo', arimo: 'arimo',
  liberationserif: 'tinos', nimbusroman: 'tinos', freeserif: 'tinos', tinos: 'tinos',
  liberationmono: 'cousine', nimbusmono: 'cousine', nimbusmonops: 'cousine', freemono: 'cousine', cousine: 'cousine',
  calibri: 'carlito', carlito: 'carlito', cambria: 'caladea', caladea: 'caladea', georgia: 'gelasio', gelasio: 'gelasio',
  verdana: 'dejavu-sans', tahoma: 'dejavu-sans', dejavusans: 'dejavu-sans', bitstreamverasans: 'dejavu-sans', lucidagrande: 'dejavu-sans', lucidasans: 'dejavu-sans',
  dejavuserif: 'dejavu-serif', bitstreamveraserif: 'dejavu-serif',
  segoeui: 'open-sans', segoe: 'open-sans', opensans: 'open-sans', droidsans: 'open-sans',
  trebuchetms: 'fira-sans', trebuchet: 'fira-sans', gillsans: 'cabin', frutiger: 'source-sans-3', myriad: 'source-sans-3', myriadpro: 'source-sans-3',
  sourcesanspro: 'source-sans-3', sourcesans3: 'source-sans-3', sourcesans: 'source-sans-3', sourceserifpro: 'source-serif-4', sourceserif4: 'source-serif-4', sourcecodepro: 'source-code-pro',
  avenir: 'nunito-sans', avenirnext: 'nunito-sans', gotham: 'montserrat', proximanova: 'montserrat', sfpro: 'inter', sanfrancisco: 'inter', systemui: 'inter', helveticaneue: 'arimo',
  palatino: 'crimson-text', palatinolinotype: 'crimson-text', bookantiqua: 'crimson-text', minion: 'crimson-text', minionpro: 'crimson-text',
  garamond: 'eb-garamond', adobegaramond: 'eb-garamond', garamondpremrpro: 'eb-garamond', baskerville: 'libre-baskerville', centuryschoolbook: 'pt-serif', century: 'pt-serif',
  didot: 'playfair-display', bodoni: 'playfair-display', bodonimt: 'playfair-display',
  consolas: 'fira-mono', menlo: 'noto-sans-mono', monaco: 'noto-sans-mono', lucidaconsole: 'noto-sans-mono', dejavusansmono: 'noto-sans-mono', andalemono: 'noto-sans-mono',
  ptsans: 'pt-sans', ptserif: 'pt-serif', ubuntumono: 'ubuntu', opendyslexic: 'opendyslexic',
}
const candidates = (() => {
  const m = new Map<string, string>(Object.entries(ALIASES))
  for (const f of FONT_LIBRARY) {
    m.set(norm(f.id), f.id)
    m.set(norm(f.name), f.id)
  }
  return [...m.entries()].sort((a, b) => b[0].length - a[0].length)
})()

export function weightFromName(name: string): number {
  const n = norm(name)
  if (/extrabold|ultrabold|heavy|black|ultra/.test(n)) return 700
  if (/semibold|demibold|demi/.test(n)) return 600
  if (/bold|bd(?![a-z])/.test(n)) return 700
  if (/medium|md(?![a-z])/.test(n)) return 500
  if (/thin|extralight|ultralight|hairline|light/.test(n)) return 300
  return 400
}
export const italicFromName = (name: string) => /italic|oblique|kursiv|ital(?![a-z])|-it$|,it$/.test(name.toLowerCase())

/** Finds the bundled family whose name is the longest prefix of the PDF's font name, plus the weight/italic it asks for. */
export function matchLibraryFont(rawName: string): { family: LibFamily; weight: number; italic: boolean } | null {
  const cleaned = rawName.replace(/^[A-Z]{6}\+/, '').replace(/-\d{3,}$/, '')
  const n = norm(cleaned)
  if (!n) return null
  for (const [alias, id] of candidates) {
    if (n.startsWith(alias)) {
      const family = byId.get(id)
      if (!family) continue
      return { family, ...pickFace(family, weightFromName(cleaned), italicFromName(cleaned)) }
    }
  }
  return null
}
