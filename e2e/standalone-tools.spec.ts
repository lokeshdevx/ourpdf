import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { expect, test, type Page } from '@playwright/test'
import { FIX, downloadBytes, pageCount, pdfTexts } from './helpers'

async function open(page: Page, slug: string) {
  await page.goto(`/${slug}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}
async function drop(page: Page, files: string[], index = 0) {
  await page.getByTestId('file-drop').nth(index).locator('input[type=file]').setInputFiles(files)
}
async function run(page: Page) {
  await page.getByTestId('run-tool').first().click()
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 60_000 })
}
async function download(page: Page, index = 0) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').nth(index).click()])
  return { bytes: await downloadBytes(d), name: d.suggestedFilename() }
}

test.describe('tools hub', () => {
  test('lists every tool and searches', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('tool-scan-document')).toBeVisible()
    expect(await page.locator('main [data-testid^=tool-]').count()).toBe(67)
  })
})

test.describe('standalone PDF tools', () => {
  test('merge', async ({ page }) => {
    await open(page, 'merge-pdf')
    await drop(page, [FIX('sample.pdf'), FIX('second.pdf')])
    await expect(page.getByText('second.pdf')).toBeVisible()
    await run(page)
    const { bytes } = await download(page)
    expect(await pageCount(bytes)).toBe((await pageCount(new Uint8Array(readFileSync(FIX('sample.pdf'))))) + (await pageCount(new Uint8Array(readFileSync(FIX('second.pdf'))))))
  })

  test('split every page', async ({ page }) => {
    await open(page, 'split-pdf')
    await drop(page, [FIX('sample.pdf')])
    await page.getByRole('radio', { name: 'Every page' }).click()
    await run(page)
    expect(await page.getByTestId('download').count()).toBeGreaterThan(1)
  })

  test('page numbers + watermark via workflow, then encrypt and remove password', async ({ page }) => {
    await open(page, 'pdf-workflow')
    await drop(page, [FIX('sample.pdf')])
    await page.getByRole('button', { name: 'Confidential draft' }).click()
    await run(page)
    const { bytes } = await download(page)
    const text = (await pdfTexts(bytes)).join(' ')
    expect(text).toContain('DRAFT')
    expect(text).toMatch(/Page 1 of \d+/)

    await open(page, 'encrypt-pdf')
    await drop(page, [FIX('sample.pdf')])
    await page.getByLabel('Password to open the PDF').fill('s3cret!')
    await page.getByLabel('Repeat password').fill('s3cret!')
    await run(page)
    const enc = await download(page)
    await expect(PDFDocument.load(enc.bytes)).rejects.toThrow()

    await open(page, 'remove-password')
    const fs = await import('node:fs')
    const tmp = test.info().outputPath('locked.pdf')
    fs.writeFileSync(tmp, enc.bytes)
    await drop(page, [tmp])
    await page.getByLabel('Current password').fill('s3cret!')
    await page.getByRole('checkbox').check()
    await run(page)
    const plain = await download(page)
    expect(await pageCount(plain.bytes)).toBeGreaterThan(0)
  })

  test('compress reports a result', async ({ page }) => {
    await open(page, 'compress-pdf')
    await drop(page, [FIX('sample.pdf')])
    await run(page)
    await expect(page.getByText(/smaller|already well optimised/)).toBeVisible()
  })

  test('PDF → Word, Excel, PowerPoint and back to PDF', async ({ page }) => {
    await open(page, 'pdf-to-word')
    await drop(page, [FIX('sample.pdf')])
    await run(page)
    const docx = await download(page)
    const zip = await JSZip.loadAsync(docx.bytes)
    expect(await zip.file('word/document.xml')!.async('string')).toContain('<w:t')

    await open(page, 'pdf-to-excel')
    await drop(page, [FIX('sample.pdf')])
    await run(page)
    const xlsx = await JSZip.loadAsync((await download(page)).bytes)
    expect(xlsx.file('xl/workbook.xml')).toBeTruthy()

    await open(page, 'pdf-to-powerpoint')
    await drop(page, [FIX('sample.pdf')])
    await run(page)
    const pptx = await download(page)
    const fs = await import('node:fs')
    const tmp = test.info().outputPath('deck.pptx')
    fs.writeFileSync(tmp, pptx.bytes)

    await open(page, 'powerpoint-to-pdf')
    await drop(page, [tmp])
    await run(page)
    const back = await download(page)
    expect(await pageCount(back.bytes)).toBe(await pageCount(new Uint8Array(fs.readFileSync(FIX('sample.pdf')))))
  })

  test('PDF → JPG and extract text', async ({ page }) => {
    await open(page, 'pdf-to-jpg')
    await drop(page, [FIX('sample.pdf')])
    await page.getByLabel(/Pages/).fill('1')
    await run(page)
    const jpg = await download(page)
    expect(jpg.bytes[0]).toBe(0xff)

    await open(page, 'extract-text')
    await drop(page, [FIX('sample.pdf')])
    await run(page)
    await expect(page.getByLabel('Extracted text')).not.toBeEmpty()
  })

  test('auto-redact removes an email from the text layer', async ({ page }) => {
    // build a PDF with PII
    const doc = await PDFDocument.create()
    const { StandardFonts } = await import('pdf-lib')
    const font = await doc.embedFont(StandardFonts.Helvetica)
    doc.addPage([400, 300]).drawText('Contact: priya.k@example.com PAN ABCPE1234F', { x: 20, y: 200, size: 12, font })
    const fs = await import('node:fs')
    const tmp = test.info().outputPath('pii.pdf')
    fs.writeFileSync(tmp, await doc.save())
    await open(page, 'auto-redact-pii')
    await drop(page, [tmp])
    await page.getByRole('button', { name: 'Find personal data' }).click()
    await expect(page.getByText(/2 items found/)).toBeVisible()
    await run(page)
    const out = await download(page)
    const text = (await pdfTexts(out.bytes)).join(' ')
    expect(text).not.toContain('priya.k@example.com')
    expect(text).not.toContain('ABCPE1234F')
  })

  test('markdown, invoice and handwriting produce PDFs', async ({ page }) => {
    await open(page, 'markdown-to-pdf')
    await run(page)
    expect((await pdfTexts((await download(page)).bytes)).join(' ')).toContain('Project notes')

    await open(page, 'gst-invoice-generator')
    await run(page)
    const inv = (await pdfTexts((await download(page)).bytes)).join(' ')
    expect(inv).toContain('TAX INVOICE')
    expect(inv).toContain('IGST')

    await open(page, 'text-to-handwriting')
    await expect(page.getByAltText('Handwriting preview')).toBeVisible()
    await run(page)
    expect(await pageCount((await download(page)).bytes)).toBeGreaterThan(0)
  })

  test('fingerprint generator hashes a file', async ({ page }) => {
    await open(page, 'fingerprint-generator')
    await drop(page, [FIX('pixel.png')])
    await page.getByTestId('run-tool').click()
    await expect(page.getByText('SHA-256').first()).toBeVisible()
    await expect(page.locator('dd').first()).toHaveText(/^[0-9a-f]{64}$/)
  })
})

test.describe('on-device AI', () => {
  test.setTimeout(240_000)
  test('chat with PDF answers from the document (neural retrieval)', async ({ page }) => {
    const { StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const lines = ['The warranty covers manufacturing defects for two years.', 'Refunds are processed within ten working days.', 'The office is closed on public holidays.', 'Shipping is free for orders above five hundred rupees.']
    const p = doc.addPage([500, 400])
    lines.forEach((l, i) => p.drawText(l, { x: 20, y: 350 - i * 30, size: 11, font }))
    const fs = await import('node:fs')
    const tmp = test.info().outputPath('faq.pdf')
    fs.writeFileSync(tmp, await doc.save())
    await open(page, 'chat-with-pdf')
    await drop(page, [tmp])
    await page.getByTestId('run-tool').click()
    await expect(page.getByText(/I’ve read/)).toBeVisible({ timeout: 180_000 })
    await page.getByLabel('Your question').fill('How long until I get my money back?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.locator('p.whitespace-pre-wrap').last()).toHaveText(/Refunds are processed within ten working days/, { timeout: 60_000 })
    await expect(page.locator('p.whitespace-pre-wrap').last()).not.toContainText('office is closed')
  })

  test('audio to PDF transcribes speech with Whisper', async ({ page }) => {
    await open(page, 'audio-to-pdf')
    await drop(page, [FIX('speech.wav')])
    await page.getByLabel('Spoken language').selectOption('english')
    await page.getByTestId('run-tool').click()
    await expect(page.getByLabel('Text')).toHaveValue(/country/i, { timeout: 200_000 })
    await page.getByRole('button', { name: 'Create PDF' }).click()
    const { bytes } = await download(page)
    expect((await pdfTexts(bytes)).join(' ').toLowerCase()).toContain('country')
  })
})
