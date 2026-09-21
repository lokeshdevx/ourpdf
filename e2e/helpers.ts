import { expect, type Download, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const FIX = (name: string) => path.join(__dirname, 'fixtures', name)

/** Opens files through the app's real "Open PDF" button + file chooser. */
export async function openFiles(page: Page, files: string[], opts: { waitPage?: boolean } = {}) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('onboarding-open').or(page.locator('[data-command="file.open"]').first()).first().click()])
  await chooser.setFiles(files)
  if (opts.waitPage !== false) await page.waitForSelector('[data-testid=pdf-page] canvas')
}

export async function gotoEditor(page: Page) {
  await page.goto('/editor')
  await expect(page.getByTestId('onboarding')).toBeVisible()
}

export async function downloadBytes(download: Download): Promise<Uint8Array> {
  const p = await download.path()
  return new Uint8Array(readFileSync(p!))
}

/** Extracts text per page from PDF bytes using pdf.js in Node. */
export async function pdfTexts(bytes: Uint8Array, password?: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: bytes.slice(), password, useSystemFonts: true, verbosity: 0 })
  const doc = await task.promise
  const out: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    out.push(tc.items.map((it) => ('str' in it ? it.str : '')).join(' '))
  }
  await task.destroy()
  return out
}

export const pageCount = async (bytes: Uint8Array, password?: string) => (await PDFDocument.load(bytes, { password: password ?? '', updateMetadata: false })).getPageCount()

/** Runs a menu command by id through the command palette (works on every viewport). */
export async function runCommand(page: Page, id: string) {
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('pdfstudio:palette')))
  await page.getByTestId('palette-input').fill(id.split('.').pop()!.toLowerCase())
  // scope to the palette item – ribbon/menu buttons carry the same data-command attribute
  await page.locator(`[cmdk-item][data-command="${id}"]`).first().click()
  await expect(page.getByTestId('palette-input')).toBeHidden()
}

/** Bounding box of the first rendered page. */
export async function firstPageBox(page: Page) {
  const box = await page.locator('[data-testid=pdf-page]').first().boundingBox()
  if (!box) throw new Error('no page box')
  return box
}

/** Clicks the page at a fraction of its size. */
export async function clickPage(page: Page, fx: number, fy: number, index = 0) {
  const [x, y] = await pagePoint(page, fx, fy, index)
  await page.mouse.click(x, y)
}

/** Absolute screen point for a page fraction, clamped into the viewport so it is always hit-testable. */
export async function pagePoint(page: Page, fx: number, fy: number, index = 0): Promise<[number, number]> {
  const box = await page.locator('[data-testid=pdf-page]').nth(index).boundingBox()
  if (!box) throw new Error('no page box')
  const vp = page.viewportSize() ?? { width: 1280, height: 720 }
  return [Math.min(vp.width - 8, box.x + box.width * fx), Math.min(vp.height - 60, Math.max(8, box.y + box.height * fy))]
}

export async function dragOnPage(page: Page, from: [number, number], to: [number, number], index = 0) {
  const [x1, y1] = await pagePoint(page, from[0], from[1], index)
  const [x2, y2] = await pagePoint(page, to[0], to[1], index)
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 })
  await page.mouse.move(x2, y2, { steps: 4 })
  await page.mouse.up()
}

export async function saveAndGetBytes(page: Page): Promise<Uint8Array> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')])
  return downloadBytes(dl)
}

import { writeFileSync, mkdirSync } from 'node:fs'
import type { TestInfo } from '@playwright/test'

export function tmpFile(testInfo: TestInfo, name: string, bytes: Uint8Array | string): string {
  mkdirSync(testInfo.outputDir, { recursive: true })
  const p = path.join(testInfo.outputDir, name)
  writeFileSync(p, bytes)
  return p
}

/** Dispatches a real `drop` event with files onto the window (the app listens at window level). */
export async function dropFiles(page: Page, files: { name: string; path: string; type: string }[]) {
  const payload = files.map((f) => ({ name: f.name, type: f.type, data: Array.from(readFileSync(f.path)) }))
  await page.evaluate((items) => {
    const dt = new DataTransfer()
    for (const it of items) dt.items.add(new File([new Uint8Array(it.data)], it.name, { type: it.type }))
    for (const type of ['dragenter', 'dragover', 'drop']) window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, payload)
}

/** Waits until autosave reports the document as stored locally. */
export async function waitSaved(page: Page) {
  await expect(page.getByTestId('autosave-state')).toContainText('Saved locally', { timeout: 15000 })
}
