// Regenerates src/lib/font-library.json from the installed @fontsource packages (run manually after adding a family).
// Only the Latin subset, weights 300–700, normal + italic are shipped (see copy-assets.mjs).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = join(root, 'node_modules', '@fontsource')
const out = []
for (const id of readdirSync(base).sort()) {
  const meta = join(base, id, 'metadata.json')
  if (!existsSync(meta)) continue
  const m = JSON.parse(readFileSync(meta, 'utf8'))
  const faces = []
  for (const w of [300, 400, 500, 600, 700]) for (const s of ['normal', 'italic']) {
    if (existsSync(join(base, id, 'files', `${id}-latin-${w}-${s}.woff`))) faces.push(`${w}${s === 'italic' ? 'i' : 'n'}`)
  }
  if (!faces.some((f) => f.startsWith('400'))) continue
  out.push({ id, name: m.family, cat: m.category, faces })
}
writeFileSync(join(root, 'src/lib/font-library.json'), JSON.stringify(out, null, 1) + '\n')
console.log(`font-library.json: ${out.length} families, ${out.reduce((n, f) => n + f.faces.length, 0)} faces`)
