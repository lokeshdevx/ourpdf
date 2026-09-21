// Generates PDF fixtures for e2e/manual tests: small, form, and large (500 pages).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync, mkdirSync } from 'node:fs'

mkdirSync('e2e/fixtures', { recursive: true })

async function make(name, pages, label = 'Page') {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([612, 792])
    p.drawText(`${label} ${i + 1}`, { x: 72, y: 700, size: 32, font: bold })
    p.drawText('The quick brown fox jumps over the lazy dog.', { x: 72, y: 650, size: 14, font })
    p.drawText('Confidential account number 123-456-789 belongs to Jane Doe.', { x: 72, y: 620, size: 14, font })
    p.drawRectangle({ x: 72, y: 500, width: 200, height: 80, color: rgb(0.85, 0.92, 1), borderColor: rgb(0.2, 0.4, 0.8), borderWidth: 1 })
    p.drawText(`Footer ${i + 1}`, { x: 72, y: 40, size: 10, font })
  }
  doc.setTitle(`${label} fixture`)
  writeFileSync(`e2e/fixtures/${name}.pdf`, await doc.save())
}
await make('sample', 3, 'Sample')
await make('second', 2, 'Second')
await make('large-500', 500, 'Large')

const doc = await PDFDocument.create()
const page = doc.addPage([612, 792])
const font = await doc.embedFont(StandardFonts.Helvetica)
page.drawText('Application form', { x: 72, y: 720, size: 24, font })
const form = doc.getForm()
const tf = form.createTextField('full_name'); tf.addToPage(page, { x: 72, y: 660, width: 220, height: 24 }); tf.setText('Alice Example')
const cb = form.createCheckBox('agree'); cb.addToPage(page, { x: 72, y: 620, width: 16, height: 16 })
const dd = form.createDropdown('country'); dd.addOptions(['Canada', 'India', 'Norway']); dd.addToPage(page, { x: 72, y: 570, width: 160, height: 24 }); dd.select('India')
writeFileSync('e2e/fixtures/form.pdf', await doc.save())

// a text-drawn PNG for OCR
console.log('fixtures written')
