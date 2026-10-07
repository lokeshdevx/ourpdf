// Bundles Web Worker entry points into /public/workers as classic (IIFE) scripts.
// Done outside the app bundler so workers load identically in dev, production and offline (same-origin, CSP-safe).
import { build, context } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')
mkdirSync(join(root, 'public/workers'), { recursive: true })

const options = {
  entryPoints: { 'pdf.worker': join(root, 'src/workers/pdf.worker.ts') },
  outdir: join(root, 'public/workers'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: !watch,
  sourcemap: false,
  logLevel: 'info',
  alias: { '@': join(root, 'src') },
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  legalComments: 'none',
}

// The AI worker is an ES module worker (Transformers.js loads the ONNX runtime with dynamic import()).
const aiOptions = { ...options, entryPoints: { 'ai.worker': join(root, 'src/workers/ai.worker.ts') }, format: 'esm', logLevel: 'warning' }

if (watch) {
  const ctx = await context(options)
  const ai = await context(aiOptions)
  await Promise.all([ctx.watch(), ai.watch()])
  console.log('watching workers…')
} else {
  await Promise.all([build(options), build(aiOptions)])
}
