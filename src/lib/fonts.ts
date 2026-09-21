import type { FontFamilyKey } from '@/types'

export const STANDARD_FAMILIES = [
  { key: 'helvetica' as const, label: 'Helvetica (sans-serif)', css: 'Helvetica, Arial, "Liberation Sans", sans-serif' },
  { key: 'times' as const, label: 'Times (serif)', css: '"Times New Roman", Times, "Liberation Serif", serif' },
  { key: 'courier' as const, label: 'Courier (monospace)', css: '"Courier New", Courier, "Liberation Mono", monospace' },
]

/** pdf-lib StandardFonts enum values, keyed by family + style. */
export function standardFontName(family: 'helvetica' | 'times' | 'courier', bold: boolean, italic: boolean): string {
  if (family === 'times') return bold ? (italic ? 'Times-BoldItalic' : 'Times-Bold') : italic ? 'Times-Italic' : 'Times-Roman'
  if (family === 'courier') return bold ? (italic ? 'Courier-BoldOblique' : 'Courier-Bold') : italic ? 'Courier-Oblique' : 'Courier'
  return bold ? (italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : italic ? 'Helvetica-Oblique' : 'Helvetica'
}

export const isCustomFont = (k: FontFamilyKey): k is `custom:${string}` => k.startsWith('custom:')

/** CSS font-family used to *display* an object's font in the editor. */
export function cssFontFamily(key: FontFamilyKey, customNames?: Record<string, string>): string {
  if (isCustomFont(key)) return `"pdfstudio-${key.slice(7)}", ${customNames?.[key] ? `"${customNames[key]}", ` : ''}sans-serif`
  return STANDARD_FAMILIES.find((f) => f.key === key)?.css ?? STANDARD_FAMILIES[0].css
}
