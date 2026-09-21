import type { ImageFilters } from '@/types'

export const hasFilters = (f: ImageFilters): boolean =>
  f.brightness !== 1 || f.contrast !== 1 || f.saturation !== 1 || f.grayscale > 0 || f.blur > 0 || f.sharpen > 0

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Applies brightness/contrast/saturation/grayscale/blur/sharpen in place to RGBA pixel data. Pure & deterministic. */
export function applyFilters(data: Uint8ClampedArray, w: number, h: number, f: ImageFilters): void {
  const n = w * h
  if (f.brightness !== 1 || f.contrast !== 1 || f.saturation !== 1 || f.grayscale > 0) {
    for (let i = 0; i < n; i++) {
      const p = i * 4
      let r = data[p] * f.brightness
      let g = data[p + 1] * f.brightness
      let b = data[p + 2] * f.brightness
      if (f.contrast !== 1) {
        r = (r - 128) * f.contrast + 128
        g = (g - 128) * f.contrast + 128
        b = (b - 128) * f.contrast + 128
      }
      const l = 0.299 * r + 0.587 * g + 0.114 * b
      if (f.saturation !== 1) {
        r = l + (r - l) * f.saturation
        g = l + (g - l) * f.saturation
        b = l + (b - l) * f.saturation
      }
      if (f.grayscale > 0) {
        const l2 = 0.299 * r + 0.587 * g + 0.114 * b
        r += (l2 - r) * f.grayscale
        g += (l2 - g) * f.grayscale
        b += (l2 - b) * f.grayscale
      }
      data[p] = clamp255(r)
      data[p + 1] = clamp255(g)
      data[p + 2] = clamp255(b)
    }
  }
  if (f.blur > 0) boxBlur(data, w, h, Math.max(1, Math.round(f.blur)))
  if (f.sharpen > 0) sharpen(data, w, h, f.sharpen)
}

function boxBlur(data: Uint8ClampedArray, w: number, h: number, r: number) {
  const tmp = new Uint8ClampedArray(data.length)
  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, horizontal: boolean) => {
    const len = horizontal ? w : h
    const lines = horizontal ? h : w
    const step = horizontal ? 4 : w * 4
    const lineStep = horizontal ? w * 4 : 4
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep
      for (let c = 0; c < 4; c++) {
        let sum = 0
        let count = 0
        for (let k = -r; k <= r; k++) {
          const idx = Math.min(len - 1, Math.max(0, k))
          sum += src[base + idx * step + c]
          count++
        }
        for (let i = 0; i < len; i++) {
          dst[base + i * step + c] = sum / count
          const add = Math.min(len - 1, i + r + 1)
          const sub = Math.max(0, i - r)
          sum += src[base + add * step + c] - src[base + sub * step + c]
        }
      }
    }
  }
  pass(data, tmp, true)
  pass(tmp, data, false)
}

function sharpen(data: Uint8ClampedArray, w: number, h: number, amount: number) {
  const src = new Uint8ClampedArray(data)
  const a = amount
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        const v =
          src[p + c] * (1 + 4 * a) - a * (src[p - 4 + c] + src[p + 4 + c] + src[p - w * 4 + c] + src[p + w * 4 + c])
        data[p + c] = clamp255(v)
      }
    }
  }
}

/** CSS `filter` string approximating the baked result, for live preview. */
export function cssFilter(f: ImageFilters): string | undefined {
  if (!hasFilters(f)) return undefined
  const parts: string[] = []
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`)
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`)
  if (f.saturation !== 1) parts.push(`saturate(${f.saturation})`)
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale})`)
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`)
  return parts.join(' ') || undefined
}
