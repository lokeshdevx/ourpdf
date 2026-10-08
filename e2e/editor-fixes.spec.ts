import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { FIX, gotoEditor, openFiles, pdfTexts, runCommand, saveAndGetBytes } from './helpers'

test.describe('editor: images and text editing @cross', () => {
  test('an image inside the PDF can be dragged to a new place and is saved there', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('with-image.pdf')])
    const target = page.locator('[data-pdf-image]').first()
    await expect(target).toBeVisible({ timeout: 15000 })
    const bx = (await target.boundingBox())!
    await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2)
    await page.waitForTimeout(600)
    await page.mouse.down()
    await expect(page.locator('[data-obj][data-type=image]')).toHaveCount(1, { timeout: 15000 })
    for (let i = 1; i <= 10; i++) await page.mouse.move(bx.x + bx.width / 2 + i * 25, bx.y + bx.height / 2 + i * 20)
    await page.mouse.up()
    const ob = (await page.locator('[data-obj][data-type=image]').first().boundingBox())!
    expect(ob.x - bx.x).toBeGreaterThan(150)
    expect(ob.y - bx.y).toBeGreaterThan(100)
    await expect(page.locator('[data-pdf-image]')).toHaveCount(0)
    const bytes = await saveAndGetBytes(page)
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(doc.getPageCount()).toBe(1)
    expect((await pdfTexts(bytes))[0]).toContain('Caption below the image')
  })

  test('editing a line never shows scrollbars or shifts the page, and long lines wrap inside the page', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    await runCommand(page, 'text.edit')
    const span = page.locator('.pdf-text-layer span', { hasText: 'Exact Font Sample' }).first()
    const box = (await span.boundingBox())!
    await page.mouse.click(box.x + 30, box.y + box.height / 2)
    await expect(page.locator('[data-obj][data-type=text]')).toHaveCount(1, { timeout: 15000 })
    const ta = page.getByLabel('Edit text')
    await expect(ta).toBeFocused()
    await page.keyboard.press('End')
    await page.keyboard.type(' and a lot more words so that the line runs well past the right edge of the page')
    const m = await ta.evaluate((t) => ({ sbV: (t as HTMLElement).offsetWidth - (t as HTMLElement).clientWidth, sbH: (t as HTMLElement).offsetHeight - (t as HTMLElement).clientHeight, overflow: getComputedStyle(t).overflow }))
    expect(m.overflow).toBe('hidden')
    expect(m.sbV).toBeLessThanOrEqual(2)
    expect(m.sbH).toBeLessThanOrEqual(2)
    const surface = page.locator('.pdf-page-paper').first()
    expect(await surface.evaluate((e) => e.scrollLeft + e.scrollTop)).toBe(0)
    await page.getByTestId('status-page').click()
    const pageBox = (await page.locator('[data-testid=pdf-page]').first().boundingBox())!
    const obj = (await page.locator('[data-obj][data-type=text]').first().boundingBox())!
    expect(obj.x + obj.width).toBeLessThanOrEqual(pageBox.x + pageBox.width + 1)
    await expect(page.getByText('Bold Sans Heading Text').first()).toBeAttached()
  })
})

test.describe('site chrome', () => {
  test('install modal offers Install and Later, and Later snoozes it', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
      e.prompt = async () => { (window as unknown as { __prompted: boolean }).__prompted = true }
      e.userChoice = Promise.resolve({ outcome: 'accepted' })
      ;(window as unknown as { __ourpdfInstall: Event }).__ourpdfInstall = e
      window.dispatchEvent(new Event('ourpdf:installable'))
    })
    await page.getByTestId('install-app').click()
    const modal = page.getByTestId('install-modal')
    await expect(modal).toBeVisible()
    await expect(modal.getByText('Works offline')).toBeVisible()
    await page.getByTestId('install-confirm').click()
    expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true)
    await page.goto('/merge-pdf')
    await page.getByTestId('install-app').click()
    await page.getByTestId('install-later').click()
    expect(Number(await page.evaluate(() => localStorage.getItem('ourpdf.install.snoozedUntil')))).toBeGreaterThan(Date.now() + 6 * 86400000)
  })

  test('footer has support, contact and Made in India', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('footer-coffee')).toHaveAttribute('href', 'https://buymeacoffee.com/lokeshdevx')
    await expect(page.getByTestId('footer-email')).toHaveAttribute('href', 'mailto:novastudio9895@gmail.com')
    await expect(page.locator('footer [data-testid=made-in-india]').first()).toBeVisible()
  })

  test('other tools page lists Picut and OurCalc, reachable from the sidebar and footer', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('sidebar-nav').getByRole('link', { name: 'Other tools' }).click()
    await page.waitForURL('**/other-tools')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('More free tools')
    for (const [id, url] of [['picut', 'https://picut.in'], ['ourcalc', 'https://ourcalc.space']]) {
      const card = page.getByTestId(`other-app-${id}`)
      await expect(card).toHaveAttribute('href', url)
      await expect(card).toHaveAttribute('target', '_blank')
    }
    await expect(page.locator('footer a[href="/other-tools"]')).toHaveCount(1)
    await expect(page.locator('footer a[href="https://picut.in"]')).toHaveCount(1)
    await expect(page.locator('footer a[href="https://ourcalc.space"]')).toHaveCount(1)
  })

  test('P2P invite links use the public site in production builds', async ({ page }) => {
    await page.goto('/p2p-file-share')
    await page.getByRole('button', { name: 'Create invite' }).click()
    const link = page.getByLabel('Invite link')
    await expect(link).toHaveValue(/^https:\/\/ourpdf\.space\/p2p-file-share#join=/, { timeout: 15000 })
  })
})
