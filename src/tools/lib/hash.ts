/** File fingerprints. SHA family via Web Crypto; MD5 implemented here (Web Crypto deliberately omits it). */

const K = new Int32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0)
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]

export function md5(data: Uint8Array): string {
  const len = data.length
  const padded = new Uint8Array(((len + 8) >>> 6) * 64 + 64)
  padded.set(data)
  padded[len] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, (len * 8) >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(len / 0x20000000), true)
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476
  const M = new Int32Array(16)
  for (let off = 0; off < padded.length; off += 64) {
    for (let j = 0; j < 16; j++) M[j] = view.getInt32(off + j * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + K[i] + M[g]) | 0
      A = D
      D = C
      C = B
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }
  const out = new DataView(new ArrayBuffer(16))
  ;[a0, b0, c0, d0].forEach((v, i) => out.setInt32(i * 4, v, true))
  return hex(new Uint8Array(out.buffer))
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

export type HashAlgo = 'SHA-256' | 'SHA-1' | 'SHA-384' | 'SHA-512' | 'MD5'
export const HASH_ALGOS: HashAlgo[] = ['SHA-256', 'SHA-1', 'MD5', 'SHA-384', 'SHA-512']

export async function digest(data: Uint8Array, algo: HashAlgo): Promise<string> {
  if (algo === 'MD5') return md5(data)
  return hex(new Uint8Array(await crypto.subtle.digest(algo, data as BufferSource)))
}

export function base64(hexStr: string): string {
  const bytes = hexStr.match(/../g)!.map((h) => parseInt(h, 16))
  return btoa(String.fromCharCode(...bytes))
}
