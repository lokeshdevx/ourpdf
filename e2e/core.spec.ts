import { expect, test } from '@playwright/test'
import { FIX, dragOnPage, gotoEditor, openFiles, pageCount, pdfTexts, saveAndGetBytes } from './helpers'

test.describe('core editing @cross', () => {
  test('opens a PDF, renders pages, thumbnails and text layer', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await expect(page.getByTestId('doc-tab')).toContainText('sample.pdf')
    await expect(page.getByTestId('status-page')).toContainText('Page 1 / 3')
    await expect(page.getByTestId('page-cell')).toHaveCount(3)
    await expect(page.locator('.pdf-text-layer span').first()).toBeAttached({ timeout: 15000 })
    expect(errors).toEqual([])
  })

  test('adds text and exports it into the PDF', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await page.locator('[data-command="text.add"]').first().click()
    await dragOnPage(page, [0.15, 0.55], [0.7, 0.62])
    const ta = page.getByLabel('Type text')
    await ta.fill('Hello E2E overlay')
    await page.getByTestId('status-page').click() // blur commits
    await expect(page.locator('[data-obj][data-type=text]')).toHaveCount(1)
    const bytes = await saveAndGetBytes(page)
    const texts = await pdfTexts(bytes)
    expect(texts[0]).toContain('Hello E2E overlay')
    expect(texts[0]).toContain('Sample 1')
    expect(await pageCount(bytes)).toBe(3)
  })

  test('shapes: draw, undo, redo', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await page.locator('[data-command="tool.rect"]').first().click().catch(async () => {
      await page.getByRole('button', { name: 'Shapes tools' }).click()
      await page.locator('[data-command="tool.rect"]').click()
    })
    await dragOnPage(page, [0.2, 0.6], [0.5, 0.75])
    await expect(page.locator('[data-obj][data-type=shape]')).toHaveCount(1)
    await page.keyboard.press('Control+z')
    await expect(page.locator('[data-obj][data-type=shape]')).toHaveCount(0)
    await page.keyboard.press('Control+Shift+z')
    await expect(page.locator('[data-obj][data-type=shape]')).toHaveCount(1)
  })

  test('command palette finds and launches tools', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await page.keyboard.press('Control+k')
    await page.getByTestId('palette-input').fill('watermark')
    await page.locator('[cmdk-item][data-command="wm.add"]').first().click()
    await expect(page.getByTestId('dialog-watermark')).toBeVisible()
  })
})
