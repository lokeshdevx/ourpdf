import type { PageModel, Rect } from '@/types'
import { rgbToHex } from '@/utils/color'

/** Samples background and text colour from the rendered canvas around/inside `rect` (base space). */
export function sampleColors(outer: HTMLElement | null, page: Pick<PageModel, 'width'>, rect: Rect): { bg: string; fg: string } {
  const canvas = outer instanceof HTMLCanvasElement ? outer : outer?.querySelector('canvas')
  if (!canvas || !canvas.width) return { bg: '#ffffff', fg: '#000000' }
  const k = canvas.width / page.width
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { bg: '#ffffff', fg: '#000000' }
  const x = Math.max(0, Math.floor(rect.x * k))
  const y = Math.max(0, Math.floor(rect.y * k))
  const w = Math.max(1, Math.min(canvas.width - x, Math.ceil(rect.w * k)))
  const h = Math.max(1, Math.min(canvas.height - y, Math.ceil(rect.h * k)))
  let data: ImageData
  try {
    data = ctx.getImageData(x, y, w, h)
  } catch {
    return { bg: '#ffffff', fg: '#000000' }
  }
  // background = most common (quantised) colour along the border ring
  // (bucketed by 5 bits per channel for robustness, but the exact average of the winning bucket is used so plain white stays #ffffff)
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>()
  const q = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
  const add = (i: number) => {
    const key = q(data.data[i], data.data[i + 1], data.data[i + 2])
    const e = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++
    e.r += data.data[i]
    e.g += data.data[i + 1]
    e.b += data.data[i + 2]
    counts.set(key, e)
  }
  for (let i = 0; i < w; i++) {
    add(i * 4)
    add(((h - 1) * w + i) * 4)
  }
  for (let j = 0; j < h; j++) {
    add(j * w * 4)
    add((j * w + w - 1) * 4)
  }
  let win = { n: 0, r: 255, g: 255, b: 255 }
  for (const c of counts.values()) if (c.n > win.n) win = c
  const bg = [win.r, win.g, win.b].map((v) => Math.round(v / Math.max(1, win.n)))
  // foreground = pixel farthest from the background
  let far = 0
  let fg = [0, 0, 0]
  for (let i = 0; i < data.data.length; i += 4) {
    const d = Math.abs(data.data[i] - bg[0]) + Math.abs(data.data[i + 1] - bg[1]) + Math.abs(data.data[i + 2] - bg[2])
    if (d > far) {
      far = d
      fg = [data.data[i], data.data[i + 1], data.data[i + 2]]
    }
  }
  if (far < 60) fg = bg[0] + bg[1] + bg[2] > 384 ? [0, 0, 0] : [255, 255, 255]
  return { bg: rgbToHex(bg[0], bg[1], bg[2]), fg: rgbToHex(fg[0], fg[1], fg[2]) }
}

