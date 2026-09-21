import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { expect, test } from '@playwright/test'
import { FIX, dropFiles, downloadBytes, gotoEditor, openFiles, pageCount, pdfTexts, runCommand, saveAndGetBytes, tmpFile } from './helpers'

test.describe('documents @cross', () => {
  test('merge two PDFs through the merge dialog', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('onboarding-merge').click()
    await expect(page.getByTestId('dialog-merge')).toBeVisible()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('merge-add').click()])
    await chooser.setFiles([FIX('sample.pdf'), FIX('second.pdf')])
    await expect(page.getByTestId('merge-list').locator('li')).toHaveCount(2)
    await page.getByTestId('merge-run').click()
    await expect(page.getByTestId('status-page')).toContainText('/ 5', { timeout: 30000 })
    await expect(page.getByTestId('doc-tab')).toContainText('Merged')
    const texts = await pdfTexts(await saveAndGetBytes(page))
    expect(texts.map((t) => t.split(' ').slice(0, 2).join(' '))).toEqual(['Sample 1', 'Sample 2', 'Sample 3', 'Second 1', 'Second 2'])
  })

  test('dropping several PDFs offers merge mode', async ({ page }) => {
    await gotoEditor(page)
    await dropFiles(page, [{ name: 'sample.pdf', path: FIX('sample.pdf'), type: 'application/pdf' }, { name: 'second.pdf', path: FIX('second.pdf'), type: 'application/pdf' }])
    await expect(page.getByTestId('dialog-dropMode')).toBeVisible()
    await page.getByTestId('drop-separate').click()
    await expect(page.getByTestId('doc-tab')).toHaveCount(2)
  })

  test('multi-document tabs: switch, close, close others', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await runCommand(page, 'file.open').catch(() => {})
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open another file' }).click()])
    await chooser.setFiles([FIX('second.pdf')])
    await expect(page.getByTestId('doc-tab')).toHaveCount(2)
    await page.getByTestId('doc-tab').first().click()
    await expect(page.getByTestId('status-page')).toContainText('/ 3')
    await page.getByTestId('doc-tab').nth(1).click()
    await expect(page.getByTestId('status-page')).toContainText('/ 2')
    await page.getByRole('button', { name: 'Close second.pdf' }).click()
    await expect(page.getByTestId('doc-tab')).toHaveCount(1)
  })

  test('split into single pages downloads a zip of PDFs', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await runCommand(page, 'pages.split')
    await expect(page.getByTestId('dialog-split')).toBeVisible()
    await page.getByText('Every page as its own file').click()
    await expect(page.getByTestId('split-preview')).toContainText('3 files')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('split-run').click()])
    const zip = await JSZip.loadAsync(await downloadBytes(dl))
    const names = Object.keys(zip.files).sort()
    expect(names).toHaveLength(3)
    for (const n of names) expect(await pageCount(await zip.files[n].async('uint8array'))).toBe(1)
  })

  test('split by ranges validates input and produces the right parts', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await runCommand(page, 'pages.split')
    await page.getByText('By page ranges').click()
    await page.locator('#split-ranges').fill('1-9')
    await expect(page.getByRole('alert')).toContainText('outside')
    await page.locator('#split-ranges').fill('1-2; 3')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('split-run').click()])
    const zip = await JSZip.loadAsync(await downloadBytes(dl))
    const counts = await Promise.all(Object.values(zip.files).map(async (f) => pageCount(await f.async('uint8array'))))
    expect(counts.sort()).toEqual([1, 2])
  })

  test('extract odd pages', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await runCommand(page, 'pages.extract')
    await page.getByText('Odd pages').click()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('extract-run').click()])
    const texts = await pdfTexts(await downloadBytes(dl))
    expect(texts.map((t) => t.slice(0, 8))).toEqual(['Sample 1', 'Sample 3'])
  })

  test('organizer: drag to reorder pages, then delete one, and the export reflects both', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await runCommand(page, 'pages.organizer')
    const cells = page.getByTestId('page-organizer').getByTestId('page-cell')
    await expect(cells).toHaveCount(3)
    const first = await cells.nth(0).boundingBox()
    const last = await cells.nth(2).boundingBox()
    await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2)
    await page.mouse.down()
    await page.mouse.move(last!.x + last!.width * 0.8, last!.y + last!.height / 2, { steps: 12 })
    await page.mouse.up()
    // now order should be Sample 2, Sample 3, Sample 1 → verify by exporting
    await page.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {})
    let texts = await pdfTexts(await saveAndGetBytes(page))
    expect(texts.map((t) => t.slice(0, 8))).toEqual(['Sample 2', 'Sample 3', 'Sample 1'])
    // delete the middle page via the pages panel
    await page.getByTestId('tab-pages').click()
    await page.getByTestId('pages-panel').getByTestId('page-cell').nth(1).click()
    await runCommand(page, 'pages.delete')
    await expect(page.getByTestId('pages-panel').getByTestId('page-cell')).toHaveCount(2)
    texts = await pdfTexts(await saveAndGetBytes(page))
    expect(texts.map((t) => t.slice(0, 8))).toEqual(['Sample 2', 'Sample 1'])
  })

  test('rotate pages and undo', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('sample.pdf')])
    await page.getByRole('button', { name: 'Rotate clockwise' }).click()
    let doc = await PDFDocument.load(await saveAndGetBytes(page), { updateMetadata: false })
    expect(doc.getPage(0).getRotation().angle).toBe(90)
    await page.keyboard.press('Control+z')
    doc = await PDFDocument.load(await saveAndGetBytes(page), { updateMetadata: false })
    expect(doc.getPage(0).getRotation().angle).toBe(0)
  })

  test('images → PDF (multiple images become pages)', async ({ page }, testInfo) => {
    await gotoEditor(page)
    await page.getByTestId('onboarding-images').click()
    const second = tmpFile(testInfo, 'second.png', await (await import('node:fs')).promises.readFile(FIX('pixel.png')))
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('images-add').click()])
    await chooser.setFiles([FIX('pixel.png'), second])
    await page.getByTestId('images-run').click()
    await expect(page.getByTestId('status-page')).toContainText('/ 2', { timeout: 30000 })
  })

  test('rejects files that are not what their extension claims', async ({ page }, testInfo) => {
    await gotoEditor(page)
    const fake = tmpFile(testInfo, 'evil.pdf', new TextEncoder().encode('MZ\u0090\u0000\u0003\u0000\u0000\u0000binary-not-a-pdf\u0000\u0001\u0002\u0003'))
    await dropFiles(page, [{ name: 'evil.pdf', path: fake, type: 'application/pdf' }])
    await expect(page.locator('[data-sonner-toast]').first()).toContainText(/Cannot open evil\.pdf/)
    await expect(page.getByTestId('doc-tab')).toHaveCount(0)
  })

  test('a corrupt PDF shows a clear, actionable error', async ({ page }, testInfo) => {
    await gotoEditor(page)
    const bad = tmpFile(testInfo, 'broken.pdf', new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'))
    await dropFiles(page, [{ name: 'broken.pdf', path: bad, type: 'application/pdf' }])
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /failed|Unable/i }).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('doc-tab')).toHaveCount(0)
  })

  test('password protected PDF: prompts, rejects a wrong password, opens with the right one', async ({ page }, testInfo) => {
    const src = await PDFDocument.create()
    src.addPage([300, 300]).drawText('SECRET-BODY', { x: 20, y: 200 })
    src.encrypt({ userPassword: 'open-me', ownerPassword: 'owner' })
    const file = tmpFile(testInfo, 'locked.pdf', await src.save())
    await gotoEditor(page)
    await openFiles(page, [file], { waitPage: false })
    await expect(page.getByTestId('password-dialog')).toBeVisible()
    await page.getByTestId('password-input').fill('wrong')
    await page.getByTestId('password-submit').click()
    await expect(page.getByTestId('password-dialog').getByRole('alert')).toContainText('Incorrect')
    await page.getByTestId('password-input').fill('open-me')
    await page.getByTestId('password-submit').click()
    await expect(page.getByTestId('doc-tab')).toContainText('locked.pdf')
    await page.waitForSelector('[data-testid=pdf-page] canvas')
    // saving yields an unprotected copy (the password was supplied to decrypt locally)
    const bytes = await saveAndGetBytes(page)
    expect((await pdfTexts(bytes))[0]).toContain('SECRET-BODY')
    expect((await PDFDocument.load(bytes, { updateMetadata: false })).isEncrypted).toBe(false)
  })
})

test.describe('large files', () => {
  test('500-page PDF opens instantly, virtualises pages and navigates', async ({ page }) => {
    await gotoEditor(page)
    const t0 = Date.now()
    await openFiles(page, [FIX('large-500.pdf')])
    expect(Date.now() - t0).toBeLessThan(20000)
    await expect(page.getByTestId('page-total')).toContainText('/ 500')
    const mounted = await page.locator('[data-testid=pdf-page]').count()
    expect(mounted).toBeLessThanOrEqual(6)
    // jump to the last page
    await page.getByTestId('page-input').fill('500')
    await page.getByTestId('page-input').press('Enter')
    await expect(page.getByTestId('status-page')).toContainText('Page 500 / 500')
    await expect(page.locator('[data-testid=pdf-page][data-page-index="499"] canvas')).toBeVisible()
    expect(await page.locator('[data-testid=pdf-page]').count()).toBeLessThanOrEqual(6)
    // thumbnails are virtualised too
    expect(await page.getByTestId('page-cell').count()).toBeLessThan(40)
    // scroll smoothly through some pages – DOM stays small
    await page.getByTestId('pdf-viewer').evaluate((el) => (el.scrollTop = 200000))
    await page.waitForTimeout(600)
    expect(await page.locator('[data-testid=pdf-page]').count()).toBeLessThanOrEqual(8)
    // low-memory mode keeps working
    await runCommand(page, 'view.lowMemory')
    await page.getByTestId('page-input').fill('250')
    await page.getByTestId('page-input').press('Enter')
    await expect(page.locator('[data-testid=pdf-page][data-page-index="249"] canvas')).toBeVisible()
  })

  test('extracting a range from the 500-page file works without loading everything into the UI', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('large-500.pdf')])
    await runCommand(page, 'pages.extract')
    await page.locator('#extract-range').fill('100-102, 499')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('extract-run').click()])
    const bytes = await downloadBytes(dl)
    expect(await pageCount(bytes)).toBe(4)
    expect((await pdfTexts(bytes)).map((t) => t.slice(0, 9))).toEqual(['Large 100', 'Large 101', 'Large 102', 'Large 499'])
  })
})
