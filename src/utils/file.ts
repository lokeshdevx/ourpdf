export type DetectedKind = 'pdf' | 'png' | 'jpeg' | 'webp' | 'tiff' | 'docx' | 'xlsx' | 'html' | 'text' | 'unknown'

/** Detects the real file type from magic bytes. File extensions and MIME types are NOT trusted. */
export function sniffBytes(head: Uint8Array): DetectedKind {
  const b = head
  const ascii = (from: number, len: number) => String.fromCharCode(...b.slice(from, from + len))
  // %PDF may be preceded by up to 1024 bytes of junk in real-world files.
  const window = String.fromCharCode(...b.slice(0, Math.min(b.length, 1024)))
  if (window.includes('%PDF-')) return 'pdf'
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp'
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a))
    return 'tiff'
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5)) return 'docx' // refined by sniffZip()
  const lower = window.trimStart().slice(0, 200).toLowerCase()
  if (lower.startsWith('<!doctype html') || lower.startsWith('<html') || /<(head|body|div|p|h1|table)[\s>]/.test(lower)) return 'html'
  // text heuristic: no NUL bytes and mostly printable
  let bad = 0
  const n = Math.min(b.length, 2048)
  for (let i = 0; i < n; i++) {
    const c = b[i]
    if (c === 0 || (c < 9) || (c > 13 && c < 32 && c !== 27)) bad++
  }
  if (n > 0 && bad / n < 0.01) return 'text'
  return 'unknown'
}

/** Distinguishes docx from xlsx (both ZIP) by looking at the ZIP entry names. */
export function sniffZipKind(bytes: Uint8Array): 'docx' | 'xlsx' | 'unknown' {
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 65536)))
  if (text.includes('word/')) return 'docx'
  if (text.includes('xl/')) return 'xlsx'
  return 'unknown'
}

export async function detectFile(file: Blob): Promise<DetectedKind> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
  const kind = sniffBytes(head)
  if (kind === 'docx') {
    const full = new Uint8Array(await file.slice(0, 200_000).arrayBuffer())
    const z = sniffZipKind(full)
    if (z !== 'unknown') return z
    // Central directory lives at the end of the archive, look there too.
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 200_000)).arrayBuffer())
    return sniffZipKind(tail)
  }
  return kind
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i
/** Turns arbitrary user/file names into safe download names. */
export function sanitizeFilename(name: string, fallback = 'document'): string {
  let n = name.normalize('NFKC')
  n = n.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
  n = n.replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '')
  if (!n || RESERVED.test(n.replace(/\.[^.]*$/, ''))) n = fallback
  return n.slice(0, 120)
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]{1,8}$/, '')
}

export function withExtension(name: string, ext: string): string {
  return `${sanitizeFilename(stripExtension(name))}.${ext.replace(/^\./, '')}`
}

export const MAX_FILE_BYTES = 1024 * 1024 * 1024 // hard limit 1 GiB
export const WARN_FILE_BYTES = 150 * 1024 * 1024
