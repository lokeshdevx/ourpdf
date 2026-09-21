// Copies self-hosted runtime assets (pdf.js worker/cmaps/fonts, tesseract core + language data)
// into /public so the app never needs a CDN and works offline.
import { cpSync, mkdirSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = (...p) => join(root, 'node_modules', ...p)
const pub = (...p) => join(root, 'public', ...p)

function copyDir(from, to) {
  if (!existsSync(from)) throw new Error(`Missing asset source: ${from}`)
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true })
}

rmSync(pub('pdfjs'), { recursive: true, force: true })
rmSync(pub('tesseract'), { recursive: true, force: true })
rmSync(pub('tessdata'), { recursive: true, force: true })
rmSync(pub('fonts'), { recursive: true, force: true })

// pdf.js
mkdirSync(pub('pdfjs'), { recursive: true })
cpSync(nm('pdfjs-dist/build/pdf.worker.min.mjs'), pub('pdfjs/pdf.worker.min.mjs'))
copyDir(nm('pdfjs-dist/cmaps'), pub('pdfjs/cmaps'))
copyDir(nm('pdfjs-dist/standard_fonts'), pub('pdfjs/standard_fonts'))
copyDir(nm('pdfjs-dist/wasm'), pub('pdfjs/wasm'))
copyDir(nm('pdfjs-dist/iccs'), pub('pdfjs/iccs'))

// tesseract worker + LSTM cores (self-contained .wasm.js variants)
mkdirSync(pub('tesseract/core'), { recursive: true })
cpSync(nm('tesseract.js/dist/worker.min.js'), pub('tesseract/worker.min.js'))
for (const f of readdirSync(nm('tesseract.js-core'))) {
  if (/-lstm\.wasm\.js$/.test(f)) cpSync(nm('tesseract.js-core', f), pub('tesseract/core', f))
}

// language data (best_int models, gz)
mkdirSync(pub('tessdata'), { recursive: true })
for (const lang of ['eng', 'spa', 'fra', 'deu', 'ita', 'por', 'osd']) {
  const src = nm('@tesseract.js-data', lang, '4.0.0_best_int', `${lang}.traineddata.gz`)
  if (existsSync(src)) cpSync(src, pub('tessdata', `${lang}.traineddata.gz`))
}
// open-licence font library (Latin subset, WOFF) used to keep edited text in the same typeface family
mkdirSync(pub('fonts'), { recursive: true })
const library = JSON.parse(readFileSync(join(root, 'src/lib/font-library.json'), 'utf8'))
let faces = 0
for (const fam of library) {
  for (const f of fam.faces) {
    const w = f.slice(0, 3)
    const style = f.endsWith('i') ? 'italic' : 'normal'
    cpSync(nm('@fontsource', fam.id, 'files', `${fam.id}-latin-${w}-${style}.woff`), pub('fonts', `${fam.id}-${w}-${style}.woff`))
    faces++
  }
}
console.log(`assets copied to /public (pdfjs, tesseract, tessdata, ${faces} font faces)`)
