export interface TypedStyle {
  id: string
  label: string
  font: string
}
export const TYPED_STYLES: TypedStyle[] = [
  { id: 'script', label: 'Script', font: "italic 400 %spx 'Brush Script MT','Segoe Script','Snell Roundhand','Apple Chancery','URW Chancery L','Z003',cursive" },
  { id: 'hand', label: 'Handwriting', font: "400 %spx 'Segoe Print','Bradley Hand','Marker Felt','Comic Sans MS','Comic Neue',cursive" },
  { id: 'serif', label: 'Classic', font: "italic 400 %spx 'Times New Roman','Liberation Serif',Georgia,serif" },
  { id: 'sans', label: 'Modern', font: "italic 500 %spx 'Helvetica Neue',Arial,'Liberation Sans',sans-serif" },
]

/** Renders typed text as a transparent PNG (tight-cropped) so it embeds like any image. */
export async function renderTypedSignature(text: string, style: TypedStyle, color: string, size = 96): Promise<{ blob: Blob; width: number; height: number }> {
  const font = style.font.replace('%s', String(size))
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const w = Math.ceil(measure.measureText(text).width) + size
  const h = Math.ceil(size * 1.8)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, size / 2, size * 1.2)
  return cropTransparent(c)
}

export async function cropTransparent(c: HTMLCanvasElement, pad = 8): Promise<{ blob: Blob; width: number; height: number }> {
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
  let x1 = width, y1 = height, x2 = -1, y2 = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 8) {
    if (x < x1) x1 = x
    if (x > x2) x2 = x
    if (y < y1) y1 = y
    if (y > y2) y2 = y
  }
  if (x2 < 0) throw new Error('The signature is empty')
  x1 = Math.max(0, x1 - pad)
  y1 = Math.max(0, y1 - pad)
  x2 = Math.min(width - 1, x2 + pad)
  y2 = Math.min(height - 1, y2 + pad)
  const out = document.createElement('canvas')
  out.width = x2 - x1 + 1
  out.height = y2 - y1 + 1
  out.getContext('2d')!.drawImage(c, x1, y1, out.width, out.height, 0, 0, out.width, out.height)
  const blob = await new Promise<Blob>((r, j) => out.toBlob((b) => (b ? r(b) : j(new Error('Encoding failed'))), 'image/png'))
  return { blob, width: out.width, height: out.height }
}

/** Removes a near-white background from an uploaded signature photo, making it transparent. */
export async function whiteToTransparent(blob: Blob, tolerance = 40): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3
    if (lum > 255 - tolerance) d[i + 3] = 0
    else if (lum > 255 - tolerance * 2) d[i + 3] = Math.min(d[i + 3], Math.round((255 * (255 - tolerance - lum)) / tolerance))
  }
  ctx.putImageData(img, 0, 0)
  return cropTransparent(c)
}
