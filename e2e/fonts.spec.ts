import { expect, test, type Page } from '@playwright/test'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { FIX, openFiles, gotoEditor, pdfTexts, runCommand, saveAndGetBytes } from './helpers'

const obj = (page: Page) => page.locator('[data-obj][data-type=text]')
const content = (page: Page) => page.getByLabel('Text content')

/** Activates "Edit existing text" and clicks the PDF text run containing `text` (found through the text layer). */
async function pick(page: Page, text: string, nth = 0) {
  const span = page.locator('.pdf-text-layer span', { hasText: text }).nth(nth)
  const box = (await span.boundingBox())!
  await runCommand(page, 'text.edit')
  await page.mouse.click(box.x + Math.min(24, box.width / 2), box.y + box.height / 2)
  await expect(obj(page).last()).toBeAttached({ timeout: 15000 })
  return box
}
/** Ends on-page typing (focus leaves the text box) so the layer is interactive again. */
const blur = (page: Page) => page.getByTestId('status-page').click()

/** Bounding box (page px) of the dark pixels in a screenshot clip. */
async function ink(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const png = (await page.screenshot({ clip })).toString('base64')
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const k = (y * c.width + x) * 4
      if (255 - d[k] > 110) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    }
    return { x0, x1, y0, y1 }
  }, png)
}

const baseFonts = async (bytes: Uint8Array) => {
  // names live inside compressed object streams, so inspect the parsed document
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  return pdf.context.enumerateIndirectObjects().flatMap(([, o]) => (o instanceof PDFDict ? [o.get(PDFName.of('BaseFont'))?.toString() ?? ''] : []))
}

test.describe('edit existing text: selection fills the sidebar and keeps the exact font @cross', () => {
  test('clicking a line selects it: the sidebar shows its text and the detected embedded font', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    await pick(page, 'Exact Font Sample')
    await expect(obj(page)).toHaveCount(1)
    await expect(obj(page)).toHaveAttribute('data-font', /^custom:pdf-/)
    await expect(content(page)).toHaveValue('Exact Font Sample Line')
    await expect(page.getByTestId('font-detected')).toHaveText('DejaVuSerif-Italic')
    await expect(page.getByTestId('font-note')).toContainText('embedded font is reused')
    await expect(page.getByRole('combobox', { name: 'Font' })).toContainText('DejaVuSerif-Italic')
    await expect(page.getByLabel('Font size')).toHaveValue(/^\d/)
  })

  test('changing the text in the sidebar edits the page and keeps the PDF font in the export', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    await pick(page, 'Exact Font Sample')
    await blur(page)
    await content(page).fill('Exact Font Line')
    await expect(obj(page).locator('span:not(.sr-only)', { hasText: 'Exact Font Line' })).toBeVisible()
    await expect(obj(page)).toHaveAttribute('data-font', /^custom:pdf-/)
    const bytes = await saveAndGetBytes(page)
    // the original subset + the re-embedded copy that draws the replacement text
    expect((await baseFonts(bytes)).filter((n) => n.includes('DejaVuSerif-Italic')).length).toBeGreaterThanOrEqual(2)
    expect((await pdfTexts(bytes))[0]).toContain('Exact Font Line')
  })

  test('typing on the page updates the sidebar text live', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    await pick(page, 'Exact Font Sample')
    await expect(page.getByLabel('Edit text')).toBeFocused()
    await page.keyboard.press('End')
    await page.keyboard.type(' Two')
    await expect(content(page)).toHaveValue('Exact Font Sample Line Two')
    await blur(page)
    expect((await pdfTexts(await saveAndGetBytes(page)))[0]).toContain('Exact Font Sample Line Two')
  })

  test('characters missing from an embedded subset switch to the same family from the library (and back)', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    await pick(page, 'Exact Font Sample')
    await blur(page)
    await content(page).fill('Quiz Exact Zulu')
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /aren.t in the PDF.s embedded/ })).toBeVisible()
    // DejaVu Serif Italic is part of the bundled library, so the typeface stays the same
    await expect(obj(page)).toHaveAttribute('data-font', 'custom:lib-dejavu-serif-400-italic')
    await expect(page.getByTestId('font-note')).toContainText('closest match')
    await content(page).fill('Exact Font Line')
    await expect(obj(page)).toHaveAttribute('data-font', /^custom:pdf-/)
    await content(page).fill('Quiz Exact Zulu')
    await expect(obj(page)).toHaveAttribute('data-font', 'custom:lib-dejavu-serif-400-italic')
    const bytes = await saveAndGetBytes(page)
    expect((await pdfTexts(bytes))[0]).toContain('Quiz Exact Zulu')
    expect((await baseFonts(bytes)).some((n) => n.includes('DejaVuSerif-Italic') || n.includes('DejaVuSerif'))).toBe(true)
  })

  test('embedded TrueType bold sans keeps its exact face (subset has no space glyph)', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    await pick(page, 'Bold Sans Heading')
    await expect(page.getByTestId('font-detected')).toHaveText('DejaVuSans-Bold')
    await blur(page)
    await content(page).fill('Bold Sans Text')
    await expect(obj(page)).toHaveAttribute('data-font', /^custom:pdf-/)
    await expect(page.getByRole('button', { name: 'Bold' }).last()).toBeDisabled()
    expect((await pdfTexts(await saveAndGetBytes(page)))[0].replace(/\s+/g, ' ')).toContain('Bold Sans Text')
  })

  test('a non-embedded standard font maps to its metric-compatible standard font', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    await pick(page, 'Standard Times paragraph one')
    await expect(page.getByTestId('font-detected')).toHaveText('Times-Roman')
    await expect(obj(page)).toHaveAttribute('data-font', 'times')
    await blur(page)
    await content(page).fill('Standard Times paragraph two\nsecond line of the paragraph')
    expect((await pdfTexts(await saveAndGetBytes(page)))[0]).toContain('Standard Times paragraph two')
  })

  test('an unchanged selection leaves no trace: switching tools removes it and nothing is added to the undo history', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    await pick(page, 'Exact Font Sample')
    await expect(obj(page)).toHaveCount(1)
    await blur(page)
    await runCommand(page, 'tool.select')
    await expect(obj(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('clicking an already edited line re-opens the same object instead of stacking a new one', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    const box = await pick(page, 'Exact Font Sample')
    await blur(page)
    await content(page).fill('Exact Font Line')
    await page.mouse.click(box.x + 30, box.y + box.height / 2)
    await expect(page.getByLabel('Edit text')).toBeVisible()
    await expect(obj(page)).toHaveCount(1)
  })

  test('the original glyphs are fully hidden, including descenders (cover is pure page colour)', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    for (const [orig, text] of [['Exact Font Sample', 'Ex'], ['Bold Sans Heading', 'Bo']] as const) {
      const box = (await page.locator('.pdf-text-layer span', { hasText: orig }).first().boundingBox())!
      await pick(page, orig)
      await blur(page)
      await content(page).fill(text)
      await page.mouse.move(2, 2)
      // right part of the original run, a little taller than the run so descenders are included
      const clip = { x: box.x + box.width * 0.45, y: box.y - box.height * 0.1, width: box.width * 0.5, height: box.height * 1.25 }
      const r = await ink(page, clip)
      expect(r.x1, `${orig}: ink left where the original text was`).toBe(-1)
    }
  })

  test('edited objects survive autosave and reload', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('custom-fonts.pdf')])
    await pick(page, 'Exact Font Sample')
    await blur(page)
    await content(page).fill('Exact Font Line')
    await expect(page.getByTestId('autosave-state')).toContainText('Saved locally', { timeout: 15000 })
    await page.reload()
    await page.getByTestId('restore-project').first().click()
    await page.waitForSelector('[data-testid=pdf-page] canvas')
    await expect(obj(page)).toHaveAttribute('data-font', /^custom:pdf-/)
    await obj(page).click({ force: true })
    expect((await pdfTexts(await saveAndGetBytes(page)))[0]).toContain('Exact Font Line')
  })
})

test.describe('every kind of font is detected and reused @cross', () => {
  // [fixture, text of the run, expected detected name, expected data-font pattern]
  const cases: [string, string, string, RegExp][] = [
    ['font-zoo', 'Type1 Roman sample', 'NimbusRoman-Regular', /^custom:pdf-/], // Type 1 → CFF
    ['font-zoo', 'Type1 Sans Bold', 'NimbusSans-Bold', /^custom:pdf-/],
    ['font-zoo', 'OpenType CFF sample', 'C059-Roman', /^custom:pdf-/], // OpenType / CFF
    ['font-zoo', 'TrueType Serif sample', 'DejaVuSerif', /^custom:pdf-/], // TrueType subset
    ['font-zoo', 'TrueType Italic Liberation', 'LiberationSans-Italic', /^custom:pdf-/],
    ['font-zoo', 'Mono sample 12345', 'LiberationMono-Regular', /^custom:pdf-/], // monospaced
    ['font-cid', 'Composite Serif Bold', 'LiberationSerif-Bold', /^custom:pdf-/], // Type 0 / CID TrueType (Identity-H)
    ['font-cid', 'Composite Sans line', 'DejaVuSans', /^custom:pdf-/],
    ['font-missing', 'Calibri sample', 'Calibri', /^custom:lib-carlito-400-normal$/], // not embedded → metric-compatible library font
    ['font-missing', 'Georgia-Bold sample', 'Georgia-Bold', /^custom:lib-gelasio-700-normal$/],
    ['font-missing', 'Verdana sample', 'Verdana', /^custom:lib-dejavu-sans-400-normal$/],
    ['font-missing', 'Roboto-Medium sample', 'Roboto-Medium', /^custom:lib-roboto-500-normal$/],
    ['font-missing', 'Cambria sample', 'Cambria', /^custom:lib-caladea-400-normal$/],
    ['font-missing', 'OpenSans-Regular sample', 'OpenSans-Regular', /^custom:lib-open-sans-400-normal$/],
    ['font-missing', 'Montserrat-Bold sample', 'Montserrat-Bold', /^custom:lib-montserrat-700-normal$/],
    ['font-missing', 'Arial-BoldMT sample', 'Arial-BoldMT', /^helvetica$/], // standard PDF fonts
    ['font-missing', 'TimesNewRomanPS-ItalicMT sample', 'TimesNewRomanPS-ItalicMT', /^times$/],
  ]
  for (const [fx, text, detected, font] of cases) {
    test(`${fx}: ${detected}`, async ({ page }) => {
      await gotoEditor(page)
      await openFiles(page, [FIX(`${fx}.pdf`)])
      await pick(page, text)
      await expect(page.getByTestId('font-detected')).toHaveText(detected)
      await expect(obj(page)).toHaveAttribute('data-font', font)
      await expect(content(page)).toHaveValue(new RegExp(text.split(' ')[0]))
      await blur(page)
      await content(page).fill('Edited ' + text.split(' ')[0])
      const bytes = await saveAndGetBytes(page)
      expect((await pdfTexts(bytes))[0].replace(/\s+/g, ' ')).toContain('Edited ' + text.split(' ')[0])
    })
  }

  for (const [fx, text] of [['font-zoo', 'Type1 Roman sample'], ['font-zoo', 'TrueType Serif sample'], ['font-zoo', 'OpenType CFF sample'], ['font-cid', 'Composite Serif Bold']] as const) {
    test(`edited text sits exactly where the original was: ${text} (within 2 px, same width)`, async ({ page }) => {
      await gotoEditor(page)
      await openFiles(page, [FIX(`${fx}.pdf`)])
      await page.addStyleTag({ content: '.sel-outline{display:none!important} .editing-textarea{border:0!important;outline:0!important}' })
      const box = (await page.locator('.pdf-text-layer span', { hasText: text }).first().boundingBox())!
      const clip = { x: box.x - 4, y: box.y - 6, width: Math.min(box.width + 40, 700), height: box.height + 12 }
      const before = await ink(page, clip)
      await pick(page, text)
      await blur(page)
      await page.mouse.move(2, 2)
      await page.waitForTimeout(300)
      const after = await ink(page, clip)
      for (const k of ['x0', 'x1', 'y0', 'y1'] as const) expect(Math.abs(after[k] - before[k]), `${fx} "${text}" ${k}`).toBeLessThanOrEqual(2)
    })
  }

  test('the font list offers the PDF fonts and the whole library; picking one loads it and bold / italic switch faces', async ({ page }) => {
    await gotoEditor(page)
    await openFiles(page, [FIX('font-missing.pdf')])
    await pick(page, 'OpenSans-Regular sample')
    await blur(page)
    await page.getByRole('combobox', { name: 'Font' }).click()
    await expect(page.getByRole('option', { name: 'Lato', exact: true })).toBeAttached()
    await expect(page.getByRole('option', { name: 'Roboto', exact: true })).toBeAttached()
    await page.getByRole('option', { name: 'Roboto', exact: true }).click()
    await expect(obj(page)).toHaveAttribute('data-font', 'custom:lib-roboto-400-normal')
    await page.getByRole('button', { name: 'Bold' }).last().click()
    await expect(obj(page)).toHaveAttribute('data-font', 'custom:lib-roboto-700-normal')
    await page.getByRole('button', { name: 'Italic' }).last().click()
    await expect(obj(page)).toHaveAttribute('data-font', 'custom:lib-roboto-700-italic')
    const bytes = await saveAndGetBytes(page)
    expect((await baseFonts(bytes)).some((n) => /Roboto/.test(n))).toBe(true)
  })
})

test.describe('brand & footer @cross', () => {
  test('editor shows OurPDF branding and “Made in India” in the bottom bar', async ({ page }) => {
    await gotoEditor(page)
    await expect(page.getByTestId('menubar')).toContainText('OurPDF')
    await expect(page.getByTestId('statusbar').getByTestId('made-in-india')).toContainText('Made in India')
    await openFiles(page, [FIX('sample.pdf')])
    await expect(page.getByTestId('statusbar').getByTestId('made-in-india')).toBeVisible()
    await expect(page).toHaveTitle(/OurPDF/)
  })

  test('landing footer has the domain and “Made in India”', async ({ page }) => {
    await page.goto('/')
    const footer = page.locator('footer')
    await expect(footer).toContainText('ourpdf.space')
    await expect(footer.getByTestId('made-in-india')).toContainText('Made in India')
    await expect(page.locator('body')).not.toContainText('PDF Studio')
  })

  test('canonical URLs, sitemap and manifest use ourpdf.space / OurPDF', async ({ page, request }) => {
    await page.goto('/merge-pdf')
    expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe('https://ourpdf.space/merge-pdf')
    expect(await page.locator('meta[property="og:site_name"]').getAttribute('content')).toBe('OurPDF')
    const sm = await (await request.get('/sitemap.xml')).text()
    expect(sm).toContain('https://ourpdf.space/features')
    expect(sm).not.toContain('localhost')
    expect((await (await request.get('/manifest.webmanifest')).json()).name).toContain('OurPDF')
    expect(await (await request.get('/robots.txt')).text()).toContain('https://ourpdf.space/sitemap.xml')
  })
})
