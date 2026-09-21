/** Unwraps a WOFF (v1) container into a plain sfnt (TrueType/OpenType) file. Browsers, fontkit and pdf-lib all need the sfnt. */
export async function woffToSfnt(b: Uint8Array): Promise<Uint8Array> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (v.getUint32(0) !== 0x774f4646) throw new Error('Not a WOFF font')
  const flavor = v.getUint32(4)
  const n = v.getUint16(12)
  const tables: { tag: number; sum: number; data: Uint8Array }[] = []
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20
    const off = v.getUint32(o + 4)
    const comp = v.getUint32(o + 8)
    const orig = v.getUint32(o + 12)
    const raw = b.subarray(off, off + comp)
    tables.push({ tag: v.getUint32(o), sum: v.getUint32(o + 16), data: comp < orig ? await inflate(raw) : raw })
  }
  tables.sort((a, c) => a.tag - c.tag)
  const head = 12 + 16 * n
  let size = head
  for (const t of tables) size += (t.data.length + 3) & ~3
  const out = new Uint8Array(size)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, flavor)
  ov.setUint16(4, n)
  let p = 1
  let log = 0
  while (p * 2 <= n) {
    p *= 2
    log++
  }
  ov.setUint16(6, p * 16)
  ov.setUint16(8, log)
  ov.setUint16(10, n * 16 - p * 16)
  let off = head
  tables.forEach((t, i) => {
    const o = 12 + i * 16
    ov.setUint32(o, t.tag)
    ov.setUint32(o + 4, t.sum)
    ov.setUint32(o + 8, off)
    ov.setUint32(o + 12, t.data.length)
    out.set(t.data, off)
    off += (t.data.length + 3) & ~3
  })
  return out
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  // WOFF tables are zlib streams = the "deflate" format of the platform decompressor
  const stream = new Blob([data.slice().buffer]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
