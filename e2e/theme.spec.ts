import { expect, test, type Page } from '@playwright/test'
import { FIX, gotoEditor, openFiles, pdfTexts, saveAndGetBytes } from './helpers'

async function choose(page: Page, value: 'light' | 'dark' | 'system') {
  await page.getByTestId('theme-toggle').click()
  await page.locator(`[data-theme-option=${value}]`).click()
}
const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test.describe('theme switching @cross', () => {
  test('landing page: light ↔ dark ↔ system, remembered after reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await choose(page, 'dark')
    await expect(page.locator('html')).toHaveClass(/dark/)
    const dark = await bg(page)
    await choose(page, 'light')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    expect(await bg(page)).not.toBe(dark)
    await choose(page, 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await choose(page, 'system') // follows the OS (light here)
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('editor: toggle from the menu bar and from the command; theme is shared with the landing page', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await choose(page, 'dark')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.keyboard.press('Control+k')
    await page.getByTestId('palette-input').fill('theme')
    await page.locator('[cmdk-item][data-command="view.theme"]').click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await choose(page, 'dark')
    await page.goto('/')
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('the theme never changes the exported document', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await choose(page, 'dark')
    const t = await pdfTexts(await saveAndGetBytes(page))
    expect(t[0]).toContain('Sample 1')
  })
})
