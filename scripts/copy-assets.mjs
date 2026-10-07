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
rmSync(pub('ort'), { recursive: true, force: true })

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
// handwriting fonts (Text / PDF to Handwriting)
for (const id of ['caveat', 'homemade-apple', 'indie-flower', 'kalam', 'patrick-hand', 'shadows-into-light', 'gloria-hallelujah', 'reenie-beanie']) {
  cpSync(nm('@fontsource', id, 'files', `${id}-latin-400-normal.woff2`), pub('fonts', `hand-${id}.woff2`))
}
// ONNX Runtime Web (on-device AI: Whisper, embeddings) – the single-threaded asyncify build
mkdirSync(pub('ort'), { recursive: true })
for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) cpSync(nm('onnxruntime-web/dist', f), pub('ort', f))
// UI typeface: Plus Jakarta Sans (OFL), self-hosted
for (const w of [400, 500, 600, 700, 800]) cpSync(nm('@fontsource/plus-jakarta-sans/files', `plus-jakarta-sans-latin-${w}-normal.woff2`), pub('fonts', `jakarta-${w}.woff2`))
// the UI typeface (Inter) also needs the heavy weights the library does not ship
for (const w of [800, 900]) cpSync(nm('@fontsource/inter/files', `inter-latin-${w}-normal.woff`), pub('fonts', `inter-${w}-normal.woff`))
console.log(`assets copied to /public (pdfjs, tesseract, tessdata, ${faces} font faces)`)
